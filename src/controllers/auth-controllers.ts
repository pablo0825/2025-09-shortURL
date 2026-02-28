import { type NextFunction, type Request, type Response } from 'express';
import {
    emailSchema,
    login2faSchema,
    loginSchema,
    registerSchema,
    resetPasswordSchema,
} from '../schemas/auth-schema';
import { handleAccessTokenBlackList } from '../utils/handle-access-token-black-list';
import {
    forgotPasswordService,
    login2faService,
    loginService,
    logoutService,
    refreshService,
    registerService,
    resetPasswordService,
} from '../services/auth/auth-service';
import { isAppError } from '../utils/app-error';

export const register = async (req: Request, res: Response, next: NextFunction) => {
    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
        const msg = result.error.issues[0]?.message ?? '無效的註冊資料';
        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }

    const { email, nickname, password } = result.data;
    try {
        const user = await registerService({ email, nickname, password });
        return res.status(201).json({
            ok: true,
            message: `${nickname} 使用者註冊成功`,
            user: {
                id: user.id,
                email: user.email,
                nickname: user.nickname,
            },
        });
    } catch (err) {
        next(err);
        return;
    }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
        const message = result.error.issues[0]?.message ?? '無效的登入資料';
        return res.status(400).json({
            ok: false,
            error: message,
        });
    }

    const { email, password } = result.data;
    try {
        const serviceResult = await loginService(
            { email, password },
            {
                userAgent: req.get('user-agent') ?? null,
                userIp: req.ip,
            },
        );

        if (serviceResult.type === 'requires_2fa') {
            return res.status(200).json({
                ok: true,
                requires2FA: true,
                twofaToken: serviceResult.token,
                expiresInSec: serviceResult.expiresInSec,
            });
        }

        res.cookie('refreshToken', serviceResult.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: serviceResult.maxAge,
            sameSite: 'lax',
            path: '/',
        });

        return res.status(200).json({
            ok: true,
            message: `${serviceResult.user.name} 使用者登入成功`,
            accessToken: serviceResult.accessToken,
            user: serviceResult.user,
        });
    } catch (err) {
        next(err);
        return;
    }
};

export const login2fa = async (req: Request, res: Response, next: NextFunction) => {
    const parsed = login2faSchema.safeParse(req.body);
    if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? '無效的資料';
        return res.status(400).json({
            ok: false,
            error: message,
        });
    }

    try {
        const result = await login2faService(parsed.data, {
            userAgent: req.get('user-agent') ?? null,
            userIp: req.ip,
        });

        res.cookie('refreshToken', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: result.maxAge,
            sameSite: 'lax',
            path: '/',
        });

        return res.status(200).json({
            ok: true,
            message: `${result.user.name} 2FA 登入成功`,
            accessToken: result.accessToken,
            user: result.user,
        });
    } catch (err) {
        next(err);
        return;
    }
};

export const refresh = async (req: Request, res: Response, next: NextFunction) => {
    const refreshToken: string = req.cookies?.refreshToken;
    if (!refreshToken) {
        return res.status(401).json({
            ok: false,
            error: '未提供 Refresh Token，請重新登入',
        });
    }

    try {
        const refreshed = await refreshService(refreshToken, {
            userAgent: req.get('user-agent') ?? null,
            userIp: req.ip,
        });

        res.cookie('refreshToken', refreshed.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: refreshed.maxAge,
            sameSite: 'lax',
            path: '/',
        });

        return res.status(200).json({
            ok: true,
            message: 'Token 刷新成功',
            accessToken: refreshed.accessToken,
            user: refreshed.user,
        });
    } catch (err) {
        if (isAppError(err) && err.statusCode === 401) {
            res.clearCookie('refreshToken');
        }
        next(err);
        return;
    }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
    const refreshToken: string = req.cookies?.refreshToken;
    if (!refreshToken) {
        return res.status(401).json({
            ok: false,
            error: '未提供 Refresh Token',
        });
    }

    try {
        await logoutService(refreshToken);
        res.clearCookie('refreshToken');
        await handleAccessTokenBlackList(req.headers?.authorization);

        return res.status(200).json({
            ok: true,
            message: '登出成功',
        });
    } catch (err) {
        if (isAppError(err) && err.statusCode === 401) {
            res.clearCookie('refreshToken');
        }
        next(err);
        return;
    }
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
    const result = emailSchema.safeParse(req.body?.email);
    if (!result.success) {
        const msg = result.error.issues[0]?.message ?? '無效的email';
        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }

    try {
        const forgot = await forgotPasswordService(result.data, {
            userAgent: req.get('user-agent') ?? null,
            userIp: req.ip,
        });
        return res.status(200).json({
            ok: true,
            message: forgot.message,
        });
    } catch (err) {
        next(err);
        return;
    }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    const result = resetPasswordSchema.safeParse(req.body);
    if (!result.success) {
        const msg = result.error.issues[0]?.message ?? '無效的資料';
        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }

    try {
        const reset = await resetPasswordService(result.data, {
            userAgent: req.get('user-agent') ?? null,
            userIp: req.ip,
        });
        return res.status(200).json({
            ok: true,
            message: reset.message,
        });
    } catch (err) {
        next(err);
        return;
    }
};
