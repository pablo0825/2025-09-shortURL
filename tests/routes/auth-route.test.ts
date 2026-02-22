import { type NextFunction, type Request, type Response, type Router } from 'express';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { invokeRouter } from '../helpers/router-request';

const okHandler = (_req: Request, res: Response): void => {
    res.status(200).json({ ok: true });
};

const register = vi.fn(okHandler);
const login = vi.fn(okHandler);
const refresh = vi.fn(okHandler);
const logout = vi.fn(okHandler);
const forgotPassword = vi.fn(okHandler);
const resetPassword = vi.fn(okHandler);

const passThrough = (_req: Request, _res: Response, next: NextFunction): void => next();
const authenticate = vi.fn((req: Request, res: Response, next: NextFunction): void => {
    if (!req.headers.authorization) {
        res.status(401).json({ ok: false, error: 'Unauthorized' });
        return;
    }
    next();
});

vi.mock('../../src/controllers/auth-controllers', () => ({
    register,
    login,
    refresh,
    logout,
    forgotPassword,
    resetPassword,
}));

vi.mock('../../src/middlewares/auth/authenticate-tokens', () => ({
    authenticate,
}));

vi.mock('../../src/middlewares/rate-limit/rate-limiter', () => ({
    getRateLimiters: () => ({
        loginLimiter: passThrough,
        registerLimiter: passThrough,
        forgotPasswordLimiter: passThrough,
        resetPasswordLimiter: passThrough,
        generalApiLimiter: passThrough,
    }),
}));

describe('auth-route integration', () => {
    let router: Router;

    beforeAll(async () => {
        const { authRouter } = await import('../../src/routes/auth-route');
        router = authRouter;
    });

    it('should handle register route', async () => {
        const response = await invokeRouter(router, {
            method: 'POST',
            url: '/register',
            headers: { 'content-type': 'application/json' },
            body: {},
        });
        expect(response.statusCode).toBe(200);
        expect(register).toHaveBeenCalled();
    });

    it('should reject logout when missing authorization header', async () => {
        const response = await invokeRouter(router, {
            method: 'POST',
            url: '/logout',
        });
        expect(response.statusCode).toBe(401);
        expect(logout).not.toHaveBeenCalled();
    });

    it('should allow logout when authorization header exists', async () => {
        const response = await invokeRouter(router, {
            method: 'POST',
            url: '/logout',
            headers: { authorization: 'Bearer token' },
        });
        expect(response.statusCode).toBe(200);
        expect(logout).toHaveBeenCalled();
    });
});
