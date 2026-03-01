import bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import type {
    Login2FaInputDto,
    LoginInputDto,
    RegisterInputDto,
    ResetPasswordInputDto,
} from '../../schemas/auth-schema';
import { jwtProvider } from '../../utils/jwt-provider';
import { signTwofaToken, verifyTwofaToken } from '../../utils/jwt-twofa-token';
import { parseUserAgentToDeviceInfo } from '../../lib/device-info';
import { verifyTotpCode } from '../../utils/totp';
import { decrypt } from '../../utils/crypto-utils';
import { consumeBackupCodes } from '../../utils/backup-codes';
import {
    consumeBackupCode,
    countRecentUserAction,
    findActiveRefreshTokensByUserId,
    findActiveUserByEmail,
    findActiveUserById,
    findAvailableBackupCodeHashes,
    findRoleIdByType,
    findRoleTypeByUserId,
    findUser2FaById,
    findUserByEmail,
    findUserForPasswordReset,
    insertRefreshToken,
    insertSession,
    insertUser,
    insertUserRole,
    revokeAllRefreshTokensByUserId,
    revokeRefreshTokenById,
    revokeSessionById,
    updateResetPasswordToken,
    updateSessionFromRefresh,
    updateUserLastLoginAt,
    updateUserPasswordAfterReset,
    withTransaction,
} from '../../repositories/auth/auth-repository';
import { cacheGetDel, cacheSet } from '../../lib/cache';
import { sendEmail } from '../../lib/email';
import { recordUserLogService } from '../user/user-log-service';
import { UserLogActionEnum } from '../../enum/user-log-action-enum';
import { AppError, toAppError } from '../../utils/app-error';

const jwtAuthTool = new jwtProvider();
const SHORT_BASE_URL = process.env.SHORT_BASE_URL?.replace(/\/+$/, '') || 'http://localhost:3001';

interface RegisterResult {
    id: number;
    email: string;
    nickname: string;
}

interface AuthContext {
    userAgent: string | null;
    userIp: string | undefined;
}

interface LoginSuccess {
    type: 'login_success';
    accessToken: string;
    refreshToken: string;
    maxAge: number;
    user: {
        id: number;
        email: string;
        name: string;
        role: string;
    };
}

interface LoginRequires2Fa {
    type: 'requires_2fa';
    token: string;
    expiresInSec: number;
}

type LoginResult = LoginSuccess | LoginRequires2Fa;

interface Login2FaResult {
    accessToken: string;
    refreshToken: string;
    maxAge: number;
    user: {
        id: number;
        email: string;
        name: string;
        role: string;
    };
}

interface RefreshSuccess {
    accessToken: string;
    refreshToken: string;
    maxAge: number;
    user: {
        id: number;
        email: string;
        nickname: string;
        role: string;
    };
}

interface LogoutResult {
    success: boolean;
}

interface ForgotPasswordResult {
    message: string;
}

interface ResetPasswordResult {
    message: string;
}

const parseRefreshTokenExpiry = (refreshToken: string): { expiresAt: Date; maxAge: number } => {
    const decoded = jwtAuthTool.verifyToken(refreshToken, 'refresh');
    const exp = decoded.claims?.exp;

    if (typeof exp !== 'number') {
        throw new AppError(500, '系統錯誤，請稍後再試');
    }

    const expiresAt = new Date(exp * 1000);
    const ttlMs = exp * 1000 - Date.now();
    if (ttlMs <= 0) {
        throw new AppError(500, '系統錯誤，請稍後再試');
    }

    return {
        expiresAt,
        maxAge: Math.max(0, ttlMs),
    };
};

const decodeRefreshUserId = (refreshToken: string): number => {
    const decoded = jwtAuthTool.verifyToken(refreshToken, 'refresh');
    const id = decoded.claims?.id;
    if (!id || Number.isNaN(Number(id))) {
        throw new AppError(401, 'Refresh Token 無效，請重新登入');
    }
    return Number(id);
};

export const registerService = async (input: RegisterInputDto): Promise<RegisterResult> => {
    try {
        const passwordHash = await bcrypt.hash(input.password, 10);

        const created = await withTransaction(async (client) => {
            const roleId = await findRoleIdByType('user', client);
            if (!roleId) {
                throw new AppError(409, '角色 user 尚未在role table建立');
            }

            const user = await insertUser(input.email, passwordHash, input.nickname, client);
            await insertUserRole(user.id, roleId, client);
            return user;
        });

        return {
            id: created.id,
            email: created.email,
            nickname: created.nickname,
        };
    } catch (err: unknown) {
        const pgErr = err as { code?: string; constraint?: string };
        if (pgErr?.code === '23505') {
            if (pgErr.constraint === 'users_email_uk') {
                throw new AppError(409, 'Email 已經被註冊過!');
            }
            if (pgErr.constraint === 'users_nickname_uk') {
                throw new AppError(409, '暱稱已經被使用!');
            }
            throw new AppError(409, '使用者資料已存在，請勿重複註冊!');
        }
        throw toAppError('authService.register', err);
    }
};

export const loginService = async (
    input: LoginInputDto,
    context: AuthContext,
): Promise<LoginResult> => {
    try {
        const user = await findActiveUserByEmail(input.email);
        if (!user) {
            throw new AppError(401, '帳號或密碼錯誤，請重新輸入');
        }

        const passwordCheck = await bcrypt.compare(input.password, user.password_hash);
        if (!passwordCheck) {
            throw new AppError(401, '帳號或密碼錯誤，請重新輸入');
        }

        // 有啟用 2fa 驗證
        if (user.twofa_enabled) {
            const { token, jti, expiresInSec } = signTwofaToken(user.id);
            await cacheSet(`2fa:login:${jti}`, String(user.id), expiresInSec);
            return {
                type: 'requires_2fa',
                token,
                expiresInSec,
            };
        }

        const role = await findRoleTypeByUserId(user.id);
        if (!role) {
            throw new AppError(500, '系統錯誤，請稍後再試');
        }

        const accessToken = jwtAuthTool.generateAccessToken({
            id: user.id.toString(),
            name: user.nickname,
            email: user.email,
            role,
        });
        const refreshToken = jwtAuthTool.generateRefreshToken(user.id.toString());
        const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
        const { expiresAt, maxAge } = parseRefreshTokenExpiry(refreshToken);

        await withTransaction(async (client) => {
            const lastUsedAt = new Date();
            const deviceInfoText = JSON.stringify(parseUserAgentToDeviceInfo(context.userAgent));
            const sessionId = await insertSession(
                {
                    userId: user.id,
                    userAgent: context.userAgent,
                    userIp: context.userIp,
                    lastUsedAt,
                    reason: 'login',
                    expiresAt,
                    deviceInfoText,
                },
                client,
            );

            await insertRefreshToken(
                {
                    userId: user.id,
                    refreshTokenHash,
                    userAgent: context.userAgent,
                    userIp: context.userIp,
                    expiresAt,
                    deviceInfoText,
                    lastUsedAt,
                    sessionId,
                },
                client,
            );
            await updateUserLastLoginAt(user.id, lastUsedAt, client);
        });

        return {
            type: 'login_success',
            accessToken,
            refreshToken,
            maxAge,
            user: {
                id: user.id,
                email: user.email,
                name: user.nickname,
                role,
            },
        };
    } catch (err) {
        throw toAppError('authService.login', err);
    }
};

export const login2faService = async (
    input: Login2FaInputDto,
    context: AuthContext,
): Promise<Login2FaResult> => {
    try {
        const params = verifyTwofaToken(input.twofaToken);
        if (!params.ok) {
            throw new AppError(401, '2FA token 無效或已過期');
        }

        const raw = await cacheGetDel(`2fa:login:${params.jti}`);
        if (!raw || Number(raw) !== params.userId) {
            throw new AppError(401, '2FA token 已使用或已過期');
        }

        const userId = params.userId;
        let usedBackupCodeHash: string | null = null;
        const user = await findUser2FaById(userId);
        if (!user) {
            throw new AppError(404, '使用者不存在或資料異常');
        }
        if (!user.twofa_enabled) {
            throw new AppError(400, '此帳號未啟用 2FA');
        }
        if (!user.role_type) {
            throw new AppError(500, '系統錯誤，請稍後再試');
        }

        if (input.method === 'totp') {
            const encrypted = user.twofa_secret_encrypted;
            const iv = user.twofa_secret_iv;
            const authTag = user.twofa_secret_auth_tag;
            if (!encrypted || !iv || !authTag) {
                throw new AppError(400, '2FA 資料不完整，請重新設定');
            }

            const secret = decrypt(encrypted, iv, authTag);
            const valid = verifyTotpCode(input.code, secret);
            if (!valid) {
                throw new AppError(400, '驗證碼錯誤');
            }
        } else {
            const version = user.twofa_backup_codes_version;
            if (!version || version <= 0) {
                throw new AppError(400, '尚未設定備用碼');
            }

            const hashes = await findAvailableBackupCodeHashes(userId, version);
            if (!hashes.length) {
                throw new AppError(400, '無有效的備用碼');
            }

            const matched = await consumeBackupCodes(input.code, hashes);
            if (!matched.ok || !matched.hash) {
                throw new AppError(400, '驗證碼錯誤');
            }
            usedBackupCodeHash = matched.hash;
        }

        const accessToken = jwtAuthTool.generateAccessToken({
            id: userId.toString(),
            name: user.nickname,
            email: user.email,
            role: user.role_type,
        });
        const refreshToken = jwtAuthTool.generateRefreshToken(userId.toString());
        const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
        const { expiresAt, maxAge } = parseRefreshTokenExpiry(refreshToken);

        await withTransaction(async (client) => {
            const lastUsedAt = new Date();
            const deviceInfoText = JSON.stringify(parseUserAgentToDeviceInfo(context.userAgent));
            const sessionId = await insertSession(
                {
                    userId,
                    userAgent: context.userAgent,
                    userIp: context.userIp,
                    lastUsedAt,
                    reason: 'login2fa',
                    expiresAt,
                    deviceInfoText,
                },
                client,
            );

            await insertRefreshToken(
                {
                    userId,
                    refreshTokenHash,
                    userAgent: context.userAgent,
                    userIp: context.userIp,
                    expiresAt,
                    deviceInfoText,
                    lastUsedAt,
                    sessionId,
                },
                client,
            );

            if (usedBackupCodeHash) {
                const consumed = await consumeBackupCode(
                    {
                        userId,
                        codeHash: usedBackupCodeHash,
                        userIp: context.userIp,
                        userAgent: context.userAgent,
                        sessionId,
                    },
                    client,
                );
                if (!consumed) {
                    throw new AppError(400, '備用碼已使用或無效');
                }
            }

            await updateUserLastLoginAt(userId, lastUsedAt, client);
        });

        return {
            accessToken,
            refreshToken,
            maxAge,
            user: {
                id: userId,
                email: user.email,
                name: user.nickname,
                role: user.role_type,
            },
        };
    } catch (err) {
        throw toAppError('authService.login2fa', err);
    }
};

export const refreshService = async (
    refreshToken: string,
    context: AuthContext,
): Promise<RefreshSuccess> => {
    try {
        const userId: number = decodeRefreshUserId(refreshToken);

        return await withTransaction(async (client) => {
            const tokens = await findActiveRefreshTokensByUserId(userId, 10, client);
            if (!tokens.length) {
                throw new AppError(401, 'Refresh Token 已過期或不存在，請重新登入');
            }

            // (typeof tokens)[number] 的意思是，型別是從 tokens 取出的，並取出陣列元素的型別，如 tokens: string[]，型別就是字串陣列
            let matched: (typeof tokens)[number] | null = null;
            for (const token of tokens) {
                const isMatch = await bcrypt.compare(refreshToken, token.refresh_token_hash);
                if (isMatch) {
                    matched = token;
                    break;
                }
            }

            if (!matched) {
                throw new AppError(401, 'Refresh Token 無效，請重新登入');
            }

            await revokeRefreshTokenById(matched.id, client);

            const user = await findActiveUserById(userId, client);
            if (!user) {
                throw new AppError(401, '帳戶不存在或已被停用，請重新登入');
            }

            const role = await findRoleTypeByUserId(userId, client);
            if (!role) {
                throw new AppError(500, '系統錯誤，請稍後再試');
            }

            const newAccessToken = jwtAuthTool.generateAccessToken({
                id: userId.toString(),
                name: user.nickname,
                email: user.email,
                role,
            });
            const newRefreshToken = jwtAuthTool.generateRefreshToken(userId.toString());
            const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
            const { expiresAt, maxAge } = parseRefreshTokenExpiry(newRefreshToken);

            const lastUsedAt = new Date();
            const deviceInfoText = JSON.stringify(parseUserAgentToDeviceInfo(context.userAgent));
            const sessionId = await updateSessionFromRefresh(
                {
                    sessionId: matched.session_id,
                    lastUsedAt,
                    userAgent: context.userAgent,
                    userIp: context.userIp,
                    expiresAt,
                    deviceInfoText,
                },
                client,
            );
            if (!sessionId) {
                throw new AppError(401, '更新失敗，請重新登入');
            }

            await insertRefreshToken(
                {
                    userId,
                    refreshTokenHash: newRefreshTokenHash,
                    userAgent: context.userAgent,
                    userIp: context.userIp,
                    expiresAt,
                    deviceInfoText,
                    lastUsedAt,
                    sessionId,
                },
                client,
            );
            await updateUserLastLoginAt(userId, lastUsedAt, client);

            return {
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
                maxAge,
                user: {
                    id: userId,
                    email: user.email,
                    nickname: user.nickname,
                    role,
                },
            };
        });
    } catch (err) {
        throw toAppError('authService.refresh', err);
    }
};

export const logoutService = async (refreshToken: string): Promise<LogoutResult> => {
    try {
        const userId = decodeRefreshUserId(refreshToken);

        await withTransaction(async (client) => {
            const tokens = await findActiveRefreshTokensByUserId(userId, 10, client);
            if (!tokens.length) {
                return;
            }

            let matched: (typeof tokens)[number] | null = null;
            for (const token of tokens) {
                const isMatch = await bcrypt.compare(refreshToken, token.refresh_token_hash);
                if (isMatch) {
                    matched = token;
                    break;
                }
            }

            if (!matched) {
                return;
            }

            await revokeRefreshTokenById(matched.id, client);
            await revokeSessionById(matched.session_id, 'logout', client);
        });

        return { success: true };
    } catch (err) {
        throw toAppError('authService.logout', err);
    }
};

export const forgotPasswordService = async (
    email: string,
    context: AuthContext,
): Promise<ForgotPasswordResult> => {
    try {
        const normalizedEmail = email.trim().toLowerCase();
        // crypto.randomBytes(32) 產生 32 bytes 的 Buffer
        // .toString('hex') 轉為 16進位的字串，1 byte = 2 個 hex 字元
        // 所以字串長度是64位元
        const resetToken = crypto.randomBytes(32).toString('hex');
        // sha256 是 hash ，hash 是不可逆的
        // digest() 結束 hash 計算，並取出 hex 字串
        const hashToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        const tokenExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000);
        const resetUrl = `${SHORT_BASE_URL}/reset-password?token=${resetToken}`;

        const user = await findUserByEmail(normalizedEmail);
        if (!user) {
            return {
                message: '如果該帳號存在，密碼重設郵件已發送',
            };
        }

        const count = await countRecentUserAction(user.id, UserLogActionEnum.FORGOT_PASSWORD, 5);
        if (count > 0) {
            throw new AppError(429, '請稍後再試，您已在 5 分鐘內請求過密碼重設');
        }

        await updateResetPasswordToken(user.id, hashToken, tokenExpiry);

        await sendEmail({
            to: normalizedEmail,
            subject: ` ${user.nickname} 您的密碼重設通知`,
            html: `
        <h2>重設密碼</h2>
        <p>親愛的 ${user.nickname}：</p>
        <p>我們收到了重設您密碼的請求。請點擊以下連結重設密碼：</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>此連結將在 2 小時後失效。</p>
        <p>若您未提出此要求，請忽略這封信。</p>
      `,
            text: `親愛的 ${user.nickname}：\n\n我們收到了重設您密碼的請求。請點擊以下連結重設密碼：\n\n${resetUrl}\n\n此連結將在 2 小時後失效。\n\n如果您沒有請求此操作，請忽略此郵件。\n\n`,
        });

        await recordUserLogService(user.id, UserLogActionEnum.FORGOT_PASSWORD, {
            detail: '使用者請求重設密碼',
            metadata: { name: user.nickname },
            ipAddress: context.userIp ?? null,
            userAgent: context.userAgent,
        });

        return {
            message: '密碼重設郵件已發送，請檢查您的信箱',
        };
    } catch (err) {
        throw toAppError('authService.forgotPassword', err);
    }
};

export const resetPasswordService = async (
    input: ResetPasswordInputDto,
    context: AuthContext,
): Promise<ResetPasswordResult> => {
    try {
        const hashToken = crypto.createHash('sha256').update(input.resetToken).digest('hex');

        const { email, nickname } = await withTransaction(async (client) => {
            const user = await findUserForPasswordReset(hashToken, client);
            if (!user) {
                throw new AppError(400, '無效或已過期的重設連結');
            }

            const isSamePassword = await bcrypt.compare(input.newPassword, user.password_hash);
            if (isSamePassword) {
                throw new AppError(400, '新密碼不能與舊密碼相同');
            }

            const newPasswordHash = await bcrypt.hash(input.newPassword, 10);
            await updateUserPasswordAfterReset(user.id, newPasswordHash, client);
            await revokeAllRefreshTokensByUserId(user.id, client);

            await recordUserLogService(
                user.id,
                UserLogActionEnum.RESET_PASSWORD,
                {
                    detail: '使用者重設密碼成功',
                    metadata: { name: user.nickname },
                    ipAddress: context.userIp ?? null,
                    userAgent: context.userAgent,
                },
                client,
            );

            return {
                email: user.email,
                nickname: user.nickname,
            };
        });

        await sendEmail({
            to: email,
            subject: ` ${nickname} 您的密碼重設通知`,
            html: `
        <h2>重設密碼</h2>
        <p>親愛的 ${nickname}：</p>
        <p>您的帳號密碼已成功重設。</p>
        <p>重設位置 IP: ${context.userIp ?? ''}</p>
        <p>如果這不是您本人的操作,請立即聯繫我們的客服團隊。</p>
      `,
            text: `親愛的 ${nickname}：\n\n您的帳號密碼成功重設。\n\n如果這不是您本人的操作,請立即聯繫我們的客服團隊。\n\n`,
        });

        return {
            message: '密碼已成功重設，請使用新密碼重新登入',
        };
    } catch (err) {
        throw toAppError('authService.resetPassword', err);
    }
};
