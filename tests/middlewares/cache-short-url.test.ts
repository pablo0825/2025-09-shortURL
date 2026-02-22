import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockBuildCacheKey,
    mockCacheDel,
    mockCacheExists,
    mockCacheGet,
    mockIsForbiddenTarget,
    mockWriteLogToDB,
    mockSafeParse,
} = vi.hoisted(() => {
    return {
        mockBuildCacheKey: vi.fn((module: string, identifier: string) => `${module}:${identifier}`),
        mockCacheDel: vi.fn(),
        mockCacheExists: vi.fn(),
        mockCacheGet: vi.fn(),
        mockIsForbiddenTarget: vi.fn(),
        mockWriteLogToDB: vi.fn(),
        mockSafeParse: vi.fn(),
    };
});

vi.mock('../../src/lib/cache', () => ({
    buildCacheKey: mockBuildCacheKey,
    cacheDel: mockCacheDel,
    cacheExists: mockCacheExists,
    cacheGet: mockCacheGet,
}));

vi.mock('../../src/utils/is-forbidden-target', () => ({
    isForbiddenTarget: mockIsForbiddenTarget,
}));

vi.mock('../../src/utils/write-log-to-db', () => ({
    writeLogToDB: mockWriteLogToDB,
}));

vi.mock('../../src/schemas/long-url-schema', () => ({
    longUrlSchema: () => ({
        safeParse: mockSafeParse,
    }),
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
        expect(mockWriteLogToDB).toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it('should redirect when positive cache hits and target is allowed', async () => {
        const req = {
            params: { code: 'abc123' },
        } as unknown as Request;
        const res = createResponse();
        const next = vi.fn() as NextFunction;

        const longUrl = 'https://example.com/page';
        mockCacheExists.mockResolvedValue(false);
        mockCacheGet.mockResolvedValue(longUrl);
        mockSafeParse.mockReturnValue({
            success: true,
            data: longUrl,
        });
        mockIsForbiddenTarget.mockResolvedValue(false);

        await cacheShortUrl(req, res, next);

        expect(mockCacheGet).toHaveBeenCalledWith('short:abc123');
        expect(res.redirect).toHaveBeenCalledWith(302, longUrl);
        expect(mockWriteLogToDB).toHaveBeenCalled();
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
});
