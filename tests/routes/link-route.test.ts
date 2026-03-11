import { type NextFunction, type Request, type Response, type Router } from 'express';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { invokeRouter } from '../helpers/router-request';

const okHandler = (_req: Request, res: Response): void => {
    res.status(200).json({ ok: true });
};

const createShortUrl = vi.fn(okHandler);
const getAllLinks = vi.fn(okHandler);
const deleteLink = vi.fn(okHandler);
const deactivateLink = vi.fn(okHandler);

const passThrough = (_req: Request, _res: Response, next: NextFunction): void => next();
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

vi.mock('../../src/controllers/link-controllers', () => ({
    createShortUrl,
    getAllLinks,
    deleteLink,
    deactivateLink,
}));

vi.mock('../../src/middlewares/auth/check-permission', () => ({
    checkPermission,
}));

vi.mock('../../src/middlewares/auth/authenticate-tokens', () => ({
    authenticate: passThrough,
}));

vi.mock('../../src/middlewares/rate-limit/rate-limiter', () => ({
    getRateLimiters: () => ({
        generalApiLimiter: passThrough,
        createLinkLimiter: passThrough,
    }),
}));

describe('link-route integration', () => {
    let router: Router;

    beforeAll(async () => {
        const { linkRouter } = await import('../../src/routes/link-route');
        router = linkRouter;
    });

    it('should create short url on POST /api/link', async () => {
        const response = await invokeRouter(router, {
            method: 'POST',
            url: '/',
            headers: { 'content-type': 'application/json' },
            body: { originalUrl: 'https://example.com' },
        });

        expect(response.statusCode).toBe(200);
        expect(createShortUrl).toHaveBeenCalled();
    });

    it('should deny request when permission middleware blocks', async () => {
        const response = await invokeRouter(router, {
            method: 'GET',
            url: '/',
            headers: { 'x-deny': '1' },
        });

        expect(response.statusCode).toBe(403);
        expect(getAllLinks).not.toHaveBeenCalled();
    });

    it('should handle deactivate route', async () => {
        const response = await invokeRouter(router, {
            method: 'PUT',
            url: '/123/deactivate',
        });

        expect(response.statusCode).toBe(200);
        expect(deactivateLink).toHaveBeenCalled();
    });
});
