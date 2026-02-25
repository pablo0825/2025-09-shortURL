import type { PoolClient } from 'pg';
import { pool } from '../db/pool';
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import crypto from 'crypto';
import { safeJoin, ensureDir } from '../utils/fs-utils';
import { UserLogActionEnum } from '../enum/user-log-action-enum';
import { writeUserLogToDB } from '../utils/write-user-log-to-db';
import { handleAccessTokenBlackList } from '../utils/handle-access-token-black-list';
import { generateTotpSecret, buildOtpAuthUrl, verifyTotpCode } from '../utils/totp';
import { toDataUrl } from '../utils/qrcode';
import { encrypt, decrypt } from '../utils/crypto-utils';
import { generateBackupCodes, hashBackupCodes } from '../utils/backup-codes';
import { buildCacheKey, cacheDel, cacheGet, cacheSet } from '../lib/cache';
import {
    clearUserAvatarKey,
    disableTwofaAndRevokeSessions,
    enableTwofaForUser,
    findActiveUserAvatarForUpdate,
    findTwofaVersionForUpdate,
    insertBackupCodeHashes,
    softDeleteUserAndRevokeSessions,
    updateUserAvatarKey,
} from '../repositories/user-security-repository';

interface UserActionContext {
    userId: number;
    userName?: string;
    ip: string | null;
    userAgent: string | null;
}

interface UpdateAvatarInput {
    fileBuffer: Buffer;
    fileType?: string;
}

interface UpdateAvatarResult {
    filename: string;
    url: string;
}

interface SetupTwofaResult {
    qrCode: string;
    expiresInSec: number;
    randomCode: string;
}

interface EnableTwofaInput {
    code: string;
    nonce: string;
}

interface EnableTwofaResult {
    backupCodes: string[];
}

const AVATAR_SIZE = 512;
const TWOFA_PENDING_TTL_SEC = 600;

const wrapServiceError = (context: string, error: unknown): Error => {
    const msg = error instanceof Error ? error.message : String(error);
    // 上下文 + msg ，方便辨識是那個錯誤出問題
    const wrapped = new Error(`[${context}] ${msg}`);

    if (error instanceof Error) {
        wrapped.name = error.name;
    }

    return wrapped;
};

const removeFileIfExists = async (filePath: string): Promise<void> => {
    try {
        // 刪除檔案
        await fs.unlink(filePath);
    } catch (error) {
        // 把 error 視為 node 的檔案型別錯誤
        const err = error as NodeJS.ErrnoException;
        // error 不是檔案/路徑不存在，就把 error 丟出
        if (err.code !== 'ENOENT') {
            throw err;
        }
    }
};

const removeOldAvatarIfAllowed = async (
    userId: number,
    oldAvatarKey: string | null,
): Promise<void> => {
    // 檢查 oldAvatarKey = null
    // 檢查 oldAvatarKey 是否包含指定路徑
    if (!oldAvatarKey || !oldAvatarKey.startsWith(`/static/avatars/${userId}/`)) {
        return;
    }

    // 把 /static 替換成 /uploads，因為對外路徑是用 /static
    const oldRelPath = oldAvatarKey.replace('/static', 'uploads');
    // 在原本的路徑上，補上根目錄
    const oldAbsPath = path.join(process.cwd(), oldRelPath);
    const allowedBase = path.join(process.cwd(), 'uploads', 'avatars', `${userId}/`);
    // 轉換為絕對路徑，同時檢查是否有犯法行為
    const resolvedOld = path.resolve(oldAbsPath);
    const resolvedBase = path.resolve(allowedBase) + path.sep;

    if (resolvedOld.startsWith(resolvedBase)) {
        await removeFileIfExists(resolvedOld);
    }
};

export const updateMyAvatarService = async (
    context: UserActionContext,
    input: UpdateAvatarInput,
): Promise<UpdateAvatarResult> => {
    const userIdStr = context.userId.toString();
    const uploadRoot = path.join(process.cwd(), 'uploads', 'avatars');
    const userDir = safeJoin(uploadRoot, userIdStr);
    await ensureDir(userDir);

    const filename = `${crypto.randomUUID()}.webp`;
    const absFilePath = safeJoin(userDir, filename);
    const avatarUrl = `/static/avatars/${userIdStr}/${filename}`;

    let client: PoolClient | undefined;

    try {
        // sharp 是圖片處理工具
        // 用 sharp 讀取 memory 的圖片資料 (buffer)
        const webBuffer = await sharp(input.fileBuffer, {
            // 限制最高為2千萬像素
            limitInputPixels: 20_000_000,
        })
            .rotate()
            .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
            .webp({ quality: 85 })
            .toBuffer();

        // .rotate() 自動旋正
        // 裁切/縮放成 512*512, fit: cover (保持比例填滿，超出會裁切)
        // 轉成 webp 檔
        // 回傳處理後的二進制內容，真正執行前面的內容，把處理後的圖片變成新的 buffer

        // 寫入檔案到指定路徑
        await fs.writeFile(absFilePath, webBuffer);

        client = await pool.connect();
        await client.query('BEGIN');

        // 策略就是，先拿 old avatar key，然後 update new avatar key 到 db
        // 最後刪除 old avatar key 的路徑的檔案

        const avatarLookup = await findActiveUserAvatarForUpdate(client, context.userId);
        if (!avatarLookup.exists) {
            const notFoundError = new Error('使用者不存在或資料異常');
            notFoundError.name = 'UserNotFoundError';
            throw notFoundError;
        }

        const updated = await updateUserAvatarKey(client, context.userId, avatarUrl);
        if (!updated) {
            const updateError = new Error('使用者不存在或資料異常');
            // 指定名稱後，在上層更容易做錯誤分類
            updateError.name = 'UserNotFoundError';
            throw updateError;
        }

        await writeUserLogToDB(
            context.userId,
            UserLogActionEnum.UPDATE_AVATAR,
            {
                detail: '使用者請求更新使用者頭像',
                metadata: {
                    name: context.userName,
                    filename,
                    url: avatarUrl,
                    type: input.fileType,
                },
                ipAddress: context.ip,
                userAgent: context.userAgent,
            },
            client,
        );

        await client.query('COMMIT');
        await removeOldAvatarIfAllowed(context.userId, avatarLookup.avatarKey);

        return {
            filename,
            url: avatarUrl,
        };
    } catch (error) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                throw wrapServiceError('userSecurityService.updateMyAvatar.rollback', rollbackError);
            }
        }

        await removeFileIfExists(absFilePath);
        throw wrapServiceError('userSecurityService.updateMyAvatar', error);
    } finally {
        if (client) {
            client.release();
        }
    }
};

export const deleteMyAvatarService = async (context: UserActionContext): Promise<void> => {
    let client: PoolClient | undefined;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const avatarLookup = await findActiveUserAvatarForUpdate(client, context.userId);
        if (!avatarLookup.exists) {
            const notFoundError = new Error('使用者不存在或資料異常');
            notFoundError.name = 'UserNotFoundError';
            throw notFoundError;
        }

        if (avatarLookup.avatarKey !== null) {
            const updated = await clearUserAvatarKey(client, context.userId);
            if (!updated) {
                const updateError = new Error('使用者不存在或資料異常');
                updateError.name = 'UserNotFoundError';
                throw updateError;
            }
        }

        await client.query('COMMIT');

        if (avatarLookup.avatarKey !== null) {
            await removeOldAvatarIfAllowed(context.userId, avatarLookup.avatarKey);
        }

        await writeUserLogToDB(context.userId, UserLogActionEnum.DELETE_AVATAR, {
            detail: '使用者請求刪除使用者頭像',
            metadata: {
                name: context.userName,
            },
            ipAddress: context.ip,
            userAgent: context.userAgent,
        });
    } catch (error) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                throw wrapServiceError('userSecurityService.deleteMyAvatar.rollback', rollbackError);
            }
        }

        throw wrapServiceError('userSecurityService.deleteMyAvatar', error);
    } finally {
        if (client) {
            client.release();
        }
    }
};

export const setup2faService = async (
    context: UserActionContext,
    userEmail: string,
): Promise<SetupTwofaResult> => {
    try {
        const secret:string = generateTotpSecret();
        const issuer:string = process.env.APP_NAME || 'MaApp';
        const otpauthUrl:string = buildOtpAuthUrl(issuer, userEmail, secret);
        let qrCode: string;

        try {
            qrCode = await toDataUrl(otpauthUrl);
        } catch (error) {
            const qrError = new Error('無法產生驗證 QR Code');
            qrError.name = 'TwofaQrGenerationError';
            throw qrError;
        }

        // 16 bytes 轉成16進位字串，每 1 byte 轉成 2 個 hex 字元
        const randomCode:string = crypto.randomBytes(16).toString('hex');
        const { encrypted, iv, authTag } = encrypt(secret);

        const redisKey = buildCacheKey('2fa_pending', `${context.userId}:${randomCode}`);
        try {
            await cacheSet(
                redisKey,
                JSON.stringify({
                    encrypted: encrypted.toString('base64'),
                    iv: iv.toString('base64'),
                    authTag: authTag.toString('base64'),
                }),
                TWOFA_PENDING_TTL_SEC,
            );
        } catch (error) {
            const redisError = new Error('系統暫時無法設定 2FA，請稍後再試');
            redisError.name = 'TwofaCacheWriteError';
            throw redisError;
        }

        await writeUserLogToDB(context.userId, UserLogActionEnum.SETUP_2FA, {
            detail: '使用者設定2fa',
            metadata: {
                name: context.userName,
                method: 'totp',
            },
            ipAddress: context.ip,
            userAgent: context.userAgent,
        });

        return {
            qrCode,
            expiresInSec: TWOFA_PENDING_TTL_SEC,
            randomCode,
        };
    } catch (error) {
        throw wrapServiceError('userSecurityService.setup2fa', error);
    }
};

export const enable2faService = async (
    context: UserActionContext,
    input: EnableTwofaInput,
): Promise<EnableTwofaResult> => {
    const redisKey = buildCacheKey('2fa_pending', `${context.userId}:${input.nonce}`);
    let client: PoolClient | undefined;

    try {
        let raw: string | null;

        try {
            raw = await cacheGet(redisKey);
        } catch (error) {
            const redisError = new Error('系統暫時無法啟用 2FA / Redis 讀取失敗');
            redisError.name = 'TwofaCacheReadError';
            throw redisError;
        }

        if (!raw) {
            const expiredError = new Error('2FA 設定已過期，請重新開始');
            expiredError.name = 'PendingTwofaExpiredError';
            throw expiredError;
        }

        const parsedData = JSON.parse(raw) as {
            encrypted: string;
            iv: string;
            authTag: string;
        };

        const encrypted = Buffer.from(parsedData.encrypted, 'base64');
        const iv = Buffer.from(parsedData.iv, 'base64');
        const authTag = Buffer.from(parsedData.authTag, 'base64');
        const secret = decrypt(encrypted, iv, authTag);

        const isValid = verifyTotpCode(input.code, secret);
        if (!isValid) {
            const invalidCodeError = new Error('驗證碼錯誤');
            invalidCodeError.name = 'InvalidTwofaCodeError';
            throw invalidCodeError;
        }

        const backupCodes = generateBackupCodes(10);
        const backupHashes = await hashBackupCodes(backupCodes);

        client = await pool.connect();
        await client.query('BEGIN');

        const oldVersion = await findTwofaVersionForUpdate(client, context.userId);
        if (oldVersion === null) {
            const notFoundError = new Error('使用者不存在或資料異常');
            notFoundError.name = 'UserNotFoundError';
            throw notFoundError;
        }

        const newVersion = oldVersion + 1;
        await enableTwofaForUser(client, context.userId, encrypted, iv, authTag, newVersion);
        await insertBackupCodeHashes(client, context.userId, newVersion, backupHashes);

        await client.query('COMMIT');
        await cacheDel(redisKey);

        await writeUserLogToDB(context.userId, UserLogActionEnum.ENABLE_2FA, {
            detail: '使用者啟用2fa成功',
            metadata: {
                name: context.userName,
                method: 'totp',
                version: newVersion,
            },
            ipAddress: context.ip,
            userAgent: context.userAgent,
        });

        return { backupCodes };
    } catch (error) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                throw wrapServiceError('userSecurityService.enable2fa.rollback', rollbackError);
            }
        }

        if (error instanceof SyntaxError) {
            const payloadError = new Error('資料解析失敗');
            payloadError.name = 'InvalidTwofaPayloadError';
            throw wrapServiceError('userSecurityService.enable2fa', payloadError);
        }

        throw wrapServiceError('userSecurityService.enable2fa', error);
    } finally {
        if (client) {
            client.release();
        }
    }
};

export const disable2faService = async (
    context: UserActionContext,
    authorizationHeader?: string | null,
): Promise<void> => {
    let client: PoolClient | undefined;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const oldVersion = await findTwofaVersionForUpdate(client, context.userId);
        if (oldVersion === null) {
            const notFoundError = new Error('使用者不存在或資料異常');
            notFoundError.name = 'UserNotFoundError';
            throw notFoundError;
        }

        await disableTwofaAndRevokeSessions(client, context.userId, oldVersion);
        await client.query('COMMIT');

        await writeUserLogToDB(context.userId, UserLogActionEnum.DISABLE_2FA, {
            detail: '使用者停用2fa成功',
            metadata: {
                name: context.userName,
                method: 'totp',
            },
            ipAddress: context.ip,
            userAgent: context.userAgent,
        });

        await handleAccessTokenBlackList(authorizationHeader);
    } catch (error) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                throw wrapServiceError('userSecurityService.disable2fa.rollback', rollbackError);
            }
        }

        throw wrapServiceError('userSecurityService.disable2fa', error);
    } finally {
        if (client) {
            client.release();
        }
    }
};

export const softDeleteMyAccountService = async (
    context: UserActionContext,
    authorizationHeader?: string | null,
): Promise<void> => {
    let client: PoolClient | undefined;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const deleted = await softDeleteUserAndRevokeSessions(client, context.userId);
        if (!deleted) {
            const notFoundError = new Error('使用者不存在或資料異常');
            notFoundError.name = 'UserNotFoundError';
            throw notFoundError;
        }

        await client.query('COMMIT');

        await writeUserLogToDB(context.userId, UserLogActionEnum.DELETE_ACCOUNT, {
            detail: '使用者軟刪除帳號成功',
            metadata: {
                name: context.userName,
            },
            ipAddress: context.ip,
            userAgent: context.userAgent,
        });

        await handleAccessTokenBlackList(authorizationHeader);
    } catch (error) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                throw wrapServiceError('userSecurityService.softDeleteMyAccount.rollback', rollbackError);
            }
        }

        throw wrapServiceError('userSecurityService.softDeleteMyAccount', error);
    } finally {
        if (client) {
            client.release();
        }
    }
};
