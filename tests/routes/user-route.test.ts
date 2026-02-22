import { type NextFunction, type Request, type Response, type Router } from 'express';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { invokeRouter } from '../helpers/router-request';

const okHandler = (_req: Request, res: Response): void => {
    res.status(200).json({ ok: true });
};

const getMyProfile = vi.fn(okHandler);
const updateMyProfile = vi.fn(okHandler);
const updateMyAvatar = vi.fn(okHandler);
const deleteMyAvatar = vi.fn(okHandler);
const changeMyPassword = vi.fn(okHandler);
const setup2fa = vi.fn(okHandler);
const enable2fa = vi.fn(okHandler);
const disable2fa = vi.fn(okHandler);
const softDeleteMyAccount = vi.fn(okHandler);
const getMySessionsList = vi.fn(okHandler);
const logoutAll = vi.fn(okHandler);
const logoutDevice = vi.fn(okHandler);

const passThrough = (_req: Request, _res: Response, next: NextFunction): void => next();
const authenticate = vi.fn((req: Request, res: Response, next: NextFunction): void => {
    if (!req.headers.authorization) {
        res.status(401).json({ ok: false, error: 'Unauthorized' });
        return;
    }
    next();
});

const checkPermission = vi.fn(
    (_resource: string, _action: string) =>
        (req: Request, res: Response, next: NextFunction): void => {
            if (req.headers['x-deny'] === '1') {
                res.status(403).json({ ok: false, error: 'Forbidden' });
                return;
            }
            next();
        },
);

vi.mock('../../src/controllers/user-controllers', () => ({
    getMyProfile,
    updateMyProfile,
    updateMyAvatar,
    deleteMyAvatar,
    changeMyPassword,
    setup2fa,
    enable2fa,
    disable2fa,
    softDeleteMyAccount,
    getMySessionsList,
    logoutAll,
    logoutDevice,
}));

vi.mock('../../src/middlewares/auth/authenticate-tokens', () => ({
    authenticate,
}));

vi.mock('../../src/middlewares/auth/check-permission', () => ({
    checkPermission,
}));

vi.mock('../../src/middlewares/upload/upload-avatar', () => ({
    uploadAvatar: passThrough,
}));

vi.mock('../../src/middlewares/upload/validate-avatar-file', () => ({
    validateAvatarFile: passThrough,
}));

vi.mock('../../src/middlewares/rate-limit/rate-limiter', () => ({
    getRateLimiters: () => ({
        updateAvatarLimiter: passThrough,
        getMyProfileLimiter: passThrough,
        updateMyProfileLimiter: passThrough,
        deleteAvatarLimiter: passThrough,
        updatePasswordLimiter: passThrough,
        setup2faLimiter: passThrough,
        enable2faLimiter: passThrough,
        disable2faLimiter: passThrough,
        softDeleteMyAccountLimiter: passThrough,
        getMySessionsLimiter: passThrough,
        logoutAllLimiter: passThrough,
        logoutDeviceLimiter: passThrough,
    }),
}));

describe('user-route integration', () => {
    let router: Router;

    beforeAll(async () => {
        const { userRouter } = await import('../../src/routes/user-route');
        router = userRouter;
    });

    it('should require authentication for GET /api/user/me', async () => {
        const response = await invokeRouter(router, {
            method: 'GET',
            url: '/me',
        });
        expect(response.statusCode).toBe(401);
        expect(getMyProfile).not.toHaveBeenCalled();
    });

    it('should handle GET /api/user/me when authenticated', async () => {
        const response = await invokeRouter(router, {
            method: 'GET',
            url: '/me',
            headers: { authorization: 'Bearer token' },
        });
        expect(response.statusCode).toBe(200);
        expect(getMyProfile).toHaveBeenCalled();
    });

    it('should deny route when permission middleware blocks', async () => {
        const response = await invokeRouter(router, {
            method: 'POST',
            url: '/me/password',
            headers: {
                authorization: 'Bearer token',
                'x-deny': '1',
            },
        });
        expect(response.statusCode).toBe(403);
        expect(changeMyPassword).not.toHaveBeenCalled();
    });
});
