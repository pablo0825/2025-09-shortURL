import { type NextFunction, type Request, type Response, type Router } from 'express';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeRouter } from '../helpers/router-request';

const getAdminLinks = vi.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});

const passThrough = (_req: Request, _res: Response, next: NextFunction): void => next();

vi.mock('../../src/controllers/admin-link-controllers', () => ({
    getAdminLinks,
}));

vi.mock('../../src/middlewares/auth/authenticate-tokens', () => ({
    authenticate: (req: Request, res: Response, next: NextFunction): void => {
        if (req.headers['x-no-auth'] === '1') {
            res.status(401).json({
                ok: false,
                error: 'unauthorized',
            });
            return;
        }
        req.user = {
            id: '1',
            email: 'admin@example.com',
            name: 'admin',
            role: 'admin',
        };
        next();
    },
}));

vi.mock('../../src/middlewares/rate-limit/rate-limiter', () => ({
    getRateLimiters: () => ({
        generalApiLimiter: passThrough,
    }),
}));

describe('admin-route integration', () => {
    let router: Router;

    beforeAll(async () => {
        const { adminRouter } = await import('../../src/routes/admin-route');
        router = adminRouter;
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should route GET /links to controller', async () => {
        const response = await invokeRouter(router, {
            method: 'GET',
            url: '/links?page=1&limit=20&sortBy=created_at&sortOrder=desc',
        });

        expect(response.statusCode).toBe(200);
        expect(getAdminLinks).toHaveBeenCalled();
    });

    it('should stop at authenticate middleware when unauthorized', async () => {
        const response = await invokeRouter(router, {
            method: 'GET',
            url: '/links?page=1&limit=20&sortBy=created_at&sortOrder=desc',
            headers: { 'x-no-auth': '1' },
        });

        expect(response.statusCode).toBe(401);
        expect(getAdminLinks).not.toHaveBeenCalled();
    });
});
