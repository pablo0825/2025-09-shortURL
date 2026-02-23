import { Request, Response } from 'express';
import {
    bodySchema,
    codeAndNonceSchema,
    logoutTokenIdSchema,
    myProfileSchema,
    userIdSchema,
} from '../schemas/user-schema';
import { emailSchema } from '../schemas/auth-schema';
import { changeMyPasswordService } from '../services/user-password-service';
import { getMyProfileService, updateMyProfileService } from '../services/user-service';
import {
    getMySessionsListService,
    logoutAllService,
    logoutDeviceService,
} from '../services/user-session-service';
import {
    deleteMyAvatarService,
    disable2faService,
    enable2faService,
    setup2faService,
    softDeleteMyAccountService,
    updateMyAvatarService,
} from '../services/user-security-service';
import { handleAccessTokenBlackList } from '../utils/handle-access-token-black-list';

export const getMyProfile = async (req: Request, res: Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg: string = userIdParams.error.issues[0]?.message ?? '未登入';
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const userId: number = userIdParams.data;

    try {
        const userResult = await getMyProfileService(userId);

        return res.status(200).json({
            ok: true,
            message: '讀取使用者資料',
            data: {
                nickname: userResult.nickname,
                email: userResult.email,
                unit: userResult.unit,
                phone: userResult.phone,
                job_title: userResult.job_title,
                avatar_key: userResult.avatar_key,
                twofa_enabled: userResult.twofa_enabled,
                is_active: userResult.is_active,
                userRoleType: userResult.type,
            },
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        if (msg.includes('使用者資料不存在')) {
            return res.status(404).json({
                ok: false,
                error: '使用者資料不存在',
            });
        }

        return res.status(500).json({
            ok: false,
            error: '系統錯誤',
        });
    }
};

export const updateMyProfile = async (req: Request, res: Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg: string = userIdParams.error.issues[0]?.message ?? '未登入';
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const userId: number = userIdParams.data;
    const newMyProfile = myProfileSchema.safeParse(req.body);

    if (!newMyProfile.success) {
        const msg: string = newMyProfile.error.issues[0]?.message ?? '使用者資料格式錯誤';

        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }

    const { nickname, unit, phone, jobTitle } = newMyProfile.data;

    try {
        const updateUserProfile = await updateMyProfileService(
            {
                userId,
                ip: req.ip ?? null,
                userAgent: req.get('user-agent') ?? null,
            },
            { nickname, unit, phone, jobTitle },
        );

        return res.status(200).json({
            ok: true,
            message: '使用者資料更新成功',
            data: {
                nickname: updateUserProfile.nickname,
                unit: updateUserProfile.unit,
                phone: updateUserProfile.phone,
                jobTitle: updateUserProfile.job_title,
            },
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('使用者資料不存在')) {
            return res.status(404).json({
                ok: false,
                error: '使用者資料不存在',
            });
        }

        return res.status(500).json({
            ok: false,
            error: '系統錯誤',
        });
    }
};

export const updateMyAvatar = async (req: Request, res: Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg = userIdParams.error.issues[0]?.message ?? '未登入';
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    if (!req.file) {
        return res.status(400).json({
            ok: false,
            error: '請上傳 avatar 檔案',
        });
    }

    try {
        const result = await updateMyAvatarService(
            {
                userId: userIdParams.data,
                userName: req.user?.name,
                ip: req.ip ?? null,
                userAgent: req.get('user-agent') ?? null,
            },
            {
                fileBuffer: req.file.buffer,
                fileType: req.avatarFileType,
            },
        );

        return res.status(200).json({
            ok: true,
            message: '使用者頭像更新成功',
            data: {
                filename: result.filename,
                url: result.url,
            },
        });
    } catch (err) {
        if (err instanceof Error && err.name === 'UserNotFoundError') {
            return res.status(404).json({
                ok: false,
                error: '使用者不存在或資料異常',
            });
        }

        return res.status(500).json({
            ok: false,
            error: '系統錯誤',
        });
    }
};

export const deleteMyAvatar = async (req: Request, res: Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg: string = userIdParams.error.issues[0]?.message ?? '未登入';
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    try {
        await deleteMyAvatarService({
            userId: userIdParams.data,
            userName: req.user?.name,
            ip: req.ip ?? null,
            userAgent: req.get('user-agent') ?? null,
        });

        return res.status(200).json({
            ok: true,
            message: '使用者頭像刪除成功',
        });
    } catch (err) {
        if (err instanceof Error && err.name === 'UserNotFoundError') {
            return res.status(404).json({
                ok: false,
                error: '使用者不存在或資料異常',
            });
        }

        return res.status(500).json({
            ok: false,
            error: '系統錯誤',
        });
    }
};

export const changeMyPassword = async (req: Request, res: Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg: string = userIdParams.error.issues[0]?.message ?? '未登入';
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const bodyParams = bodySchema.safeParse(req.body);

    if (!bodyParams.success) {
        const msg: string = bodyParams.error.issues[0]?.message ?? '密碼格式錯誤';
        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }

    const userId: number = userIdParams.data;
    const { currentPassword, newPassword } = bodyParams.data;

    try {
        await changeMyPasswordService({
            userId,
            currentPassword,
            newPassword,
            ip: req.ip ?? '',
            userAgent: req.get('user-agent') ?? null,
            authorizationHeader: req.headers?.authorization,
        });

        return res.status(200).json({
            ok: true,
            message: '密碼已成功重設，請使用新密碼重新登入',
        });
    } catch (err) {
        if (err instanceof Error && err.name === 'UserNotFoundError') {
            return res.status(404).json({
                ok: false,
                error: '使用者不存在或資料異常',
            });
        }

        if (err instanceof Error && err.name === 'PasswordMismatchError') {
            return res.status(400).json({
                ok: false,
                error: '舊密碼輸入錯誤，請重新確認',
            });
        }

        if (err instanceof Error && err.name === 'PasswordAlreadyUpdatedError') {
            return res.status(409).json({
                ok: false,
                error: '密碼已被更新',
            });
        }

        return res.status(500).json({
            ok: false,
            error: '系統錯誤',
        });
    }
};

export const setup2fa = async (req: Request, res: Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg: string = userIdParams.error.issues[0]?.message ?? '未登入';

        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const userEmailParams = emailSchema.safeParse(req.user?.email);

    if (!userEmailParams.success) {
        const msg: string = userEmailParams.error.issues[0]?.message ?? '未登入';

        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    try {
        const result = await setup2faService(
            {
                userId: userIdParams.data,
                userName: req.user?.name,
                ip: req.ip ?? null,
                userAgent: req.get('user-agent') ?? null,
            },
            userEmailParams.data,
        );

        return res.status(200).json({
            ok: true,
            qrCode: result.qrCode,
            expiresInSec: result.expiresInSec,
            randomCode: result.randomCode,
        });
    } catch (err) {
        if (err instanceof Error && err.name === 'TwofaQrGenerationError') {
            return res.status(500).json({
                ok: false,
                error: '無法產生驗證 QR Code',
            });
        }

        if (err instanceof Error && err.name === 'TwofaCacheWriteError') {
            return res.status(503).json({
                ok: false,
                error: '系統暫時無法設定 2FA，請稍後再試',
            });
        }

        return res.status(503).json({
            ok: false,
            error: '系統暫時無法設定 2FA，請稍後再試',
        });
    }
};

export const enable2fa = async (req: Request, res: Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg: string = userIdParams.error.issues[0]?.message ?? '未登入';

        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const codeAndNonceParams = codeAndNonceSchema.safeParse(req.body);

    if (!codeAndNonceParams.success) {
        const msg: string = codeAndNonceParams.error.issues[0]?.message ?? '驗證碼錯誤';

        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }

    try {
        const result = await enable2faService(
            {
                userId: userIdParams.data,
                userName: req.user?.name,
                ip: req.ip ?? null,
                userAgent: req.get('user-agent') ?? null,
            },
            codeAndNonceParams.data,
        );

        return res.status(200).json({
            ok: true,
            message: '2fa 已啟用',
            backupCodes: result.backupCodes,
        });
    } catch (err) {
        if (err instanceof Error && err.name === 'PendingTwofaExpiredError') {
            return res.status(400).json({
                ok: false,
                error: '2FA 設定已過期，請重新開始',
            });
        }

        if (err instanceof Error && err.name === 'InvalidTwofaCodeError') {
            return res.status(400).json({
                ok: false,
                error: '驗證碼錯誤',
            });
        }

        if (err instanceof Error && err.name === 'InvalidTwofaPayloadError') {
            return res.status(400).json({
                ok: false,
                error: '資料解析失敗',
            });
        }

        if (err instanceof Error && err.name === 'TwofaCacheReadError') {
            return res.status(503).json({
                ok: false,
                error: '系統暫時無法啟用 2FA / Redis 讀取失敗',
            });
        }

        if (err instanceof Error && err.name === 'UserNotFoundError') {
            return res.status(404).json({
                ok: false,
                error: '使用者不存在或資料異常',
            });
        }

        return res.status(500).json({
            ok: false,
            error: '系統錯誤',
        });
    }
};

export const disable2fa = async (req: Request, res: Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg: string = userIdParams.error.issues[0]?.message ?? '未登入';

        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    try {
        await disable2faService(
            {
                userId: userIdParams.data,
                userName: req.user?.name,
                ip: req.ip ?? null,
                userAgent: req.get('user-agent') ?? null,
            },
            req.headers?.authorization,
        );

        res.clearCookie('refreshToken');

        return res.status(200).json({
            ok: true,
            message: '2fa 已停用',
        });
    } catch (err) {
        if (err instanceof Error && err.name === 'UserNotFoundError') {
            return res.status(404).json({
                ok: false,
                error: '使用者不存在或資料異常',
            });
        }

        return res.status(500).json({
            ok: false,
            error: '系統錯誤',
        });
    }
};

export const softDeleteMyAccount = async (req: Request, res: Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg = userIdParams.error.issues[0]?.message ?? '未登入';
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    try {
        await softDeleteMyAccountService(
            {
                userId: userIdParams.data,
                userName: req.user?.name,
                ip: req.ip ?? null,
                userAgent: req.get('user-agent') ?? null,
            },
            req.headers?.authorization,
        );

        res.clearCookie('refreshToken');

        return res.status(200).json({
            ok: true,
            message: '使用者帳號已刪除',
        });
    } catch (err) {
        if (err instanceof Error && err.name === 'UserNotFoundError') {
            return res.status(404).json({
                ok: false,
                error: '使用者不存在或資料異常',
            });
        }

        return res.status(500).json({
            ok: false,
            error: '系統錯誤',
        });
    }
};

export const getMySessionsList = async (req: Request, res: Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg = userIdParams.error.issues[0]?.message ?? '未登入';
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const refreshToken: string | undefined = req.cookies?.refreshToken;

    if (!refreshToken) {
        return res.status(401).json({
            ok: false,
            error: '未登入',
        });
    }

    try {
        const sessionResult = await getMySessionsListService(userIdParams.data, refreshToken);
        return res.status(200).json({
            ok: true,
            message: sessionResult.message,
            data: sessionResult.data,
        });
    } catch (err) {
        return res.status(500).json({
            ok: false,
            error: '系統錯誤',
        });
    }
};

export const logoutAll = async (req: Request, res: Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg = userIdParams.error.issues[0]?.message ?? '未登入';
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const userId = userIdParams.data;

    try {
        const sessionCount = await logoutAllService(userId);

        res.clearCookie('refreshToken');

        res.status(200).json({
            ok: true,
            message: `已登出 ${sessionCount.count} 個裝置`,
        });

        await handleAccessTokenBlackList(req.headers?.authorization);

        return;
    } catch (err) {
        return res.status(500).json({
            ok: false,
            error: '系統錯誤',
        });
    }
};

export const logoutDevice = async (req: Request, res: Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg = userIdParams.error.issues[0]?.message ?? '未登入';
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const userId = userIdParams.data;
    const refreshToken: string | undefined = req.cookies?.refreshToken;

    const sessionIdParam = logoutTokenIdSchema.safeParse(req.params.sessionId);

    if (!sessionIdParam.success) {
        const msg = sessionIdParam.error.issues[0]?.message ?? 'tokenId 格式錯誤';
        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }

    const sessionId: number = sessionIdParam.data;

    try {
        const result = await logoutDeviceService(userId, sessionId, refreshToken);
        if (!result.revoked) {
            return res.status(404).json({
                ok: false,
                error: '裝置不存在、已登出或不屬於您',
            });
        }

        if (result.currentSessionLoggedOut) {
            res.clearCookie('refreshToken');
            await handleAccessTokenBlackList(req.headers?.authorization);
        }

        return res.status(200).json({
            ok: true,
            message: '裝置已登出',
        });
    } catch (err) {
        return res.status(500).json({
            ok: false,
            error: '系統錯誤',
        });
    }
};
