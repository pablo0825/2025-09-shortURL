import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockBuildCacheKey,
    mockCacheExists,
    mockCacheGet,
} = vi.hoisted(() => {
    return {
        mockBuildCacheKey: vi.fn((module: string, identifier: string) => `${module}:${identifier}`),
        mockCacheExists: vi.fn(),
        mockCacheGet: vi.fn(),
    };
});

vi.mock('../../src/lib/cache', () => ({
    buildCacheKey: mockBuildCacheKey,
    cacheExists: mockCacheExists,
    cacheGet: mockCacheGet,
}));

import { cacheShortUrl } from '../../src/middlewares/redirect/cache-short-url';

const createResponse = (): Response => {
    const response = {
        status: vi.fn(),
        json: vi.fn(),
        send: vi.fn(),
        redirect: vi.fn(),
    } as unknown as Response;

    (response.status as unknown as ReturnType<typeof vi.fn>).mockReturnValue(response);
    (response.json as unknown as ReturnType<typeof vi.fn>).mockReturnValue(response);
    (response.send as unknown as ReturnType<typeof vi.fn>).mockReturnValue(response);
    (response.redirect as unknown as ReturnType<typeof vi.fn>).mockReturnValue(response);

    return response;
};

describe('cache-short-url middleware', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return 400 when code is missing', async () => {
        const req = {
            params: { code: '   ' },
        } as unknown as Request;
        const res = createResponse();
        const next = vi.fn() as NextFunction;

        await cacheShortUrl(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.send).toHaveBeenCalledWith('short_code是必須的');
        expect(next).not.toHaveBeenCalled();
    });

    it('should return 400 when code format is invalid', async () => {
        const req = {
            params: { code: 'bad code!' },
        } as unknown as Request;
        const res = createResponse();
        const next = vi.fn() as NextFunction;

        await cacheShortUrl(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.send).toHaveBeenCalledWith('short_code格式不正確');
        expect(next).not.toHaveBeenCalled();
    });

    it('should return 404 when negative cache key exists', async () => {
        const req = {
            params: { code: 'abc123' },
        } as unknown as Request;
        const res = createResponse();
        const next = vi.fn() as NextFunction;

        mockCacheExists.mockResolvedValue(true);

        await cacheShortUrl(req, res, next);

        expect(mockCacheExists).toHaveBeenCalledWith('short404:abc123');
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            ok: false,
            error: 'shortURL 不存在(redis)',
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('should redirect when positive cache hits', async () => {
        const req = {
            params: { code: 'abc123' },
        } as unknown as Request;
        const res = createResponse();
        const next = vi.fn() as NextFunction;

        const longUrl = 'https://example.com/page';
        mockCacheExists.mockResolvedValue(false);
        mockCacheGet.mockResolvedValue(longUrl);

        await cacheShortUrl(req, res, next);

        expect(mockCacheGet).toHaveBeenCalledWith('short:abc123');
        expect(res.redirect).toHaveBeenCalledWith(302, longUrl);
        expect(next).not.toHaveBeenCalled();
    });

    it('should call next when positive cache misses', async () => {
        const req = {
            params: { code: 'abc123' },
        } as unknown as Request;
        const res = createResponse();
        const next = vi.fn() as NextFunction;

        mockCacheExists.mockResolvedValue(false);
        mockCacheGet.mockResolvedValue(null);

        await cacheShortUrl(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.redirect).not.toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('should call next when cache access throws', async () => {
        const req = {
            params: { code: 'abc123' },
        } as unknown as Request;
        const res = createResponse();
        const next = vi.fn() as NextFunction;

        mockCacheExists.mockRejectedValue(new Error('redis down'));

        await cacheShortUrl(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
    });
});
