import type { NextFunction } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/link/link-service', () => ({
    createShortUrlService: vi.fn(),
    deactivateLinkService: vi.fn(),
    deleteLinkService: vi.fn(),
    getAllLinksService: vi.fn(),
    resolveShortCodeService: vi.fn(),
}));

vi.mock('../../src/services/link/link-log-service', () => ({
    recordLinkLogService: vi.fn(),
}));

import {
    createShortUrl,
    deactivateLink,
    deleteLink,
    getAllLinks,
    redirectToLongUrl,
} from '../../src/controllers/link-controllers';
import {
    createShortUrlService,
    deactivateLinkService,
    deleteLinkService,
    getAllLinksService,
    resolveShortCodeService,
} from '../../src/services/link/link-service';

const mockedCreateShortUrlService = vi.mocked(createShortUrlService);
const mockedResolveShortCodeService = vi.mocked(resolveShortCodeService);
const mockedGetAllLinksService = vi.mocked(getAllLinksService);
const mockedDeleteLinkService = vi.mocked(deleteLinkService);
const mockedDeactivateLinkService = vi.mocked(deactivateLinkService);

const buildRes = () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    const redirect = vi.fn().mockReturnThis();
    return { status, json, redirect };
};

const buildNext = () => vi.fn() as NextFunction;

describe('link-controllers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return 201 when createShortUrl succeeds', async () => {
        mockedCreateShortUrlService.mockResolvedValue({
            id: '1',
            code: 'abc123',
            shortUrl: 'http://localhost:3001/abc123',
        });

        const req = {
            body: { longUrl: 'https://example.com' },
            ip: '1.1.1.1',
            get: vi.fn(),
            originalUrl: '/api/link',
        } as never;
        const res = buildRes();
        const next = buildNext();

        await createShortUrl(req, res as never, next);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(mockedCreateShortUrlService).toHaveBeenCalledWith('https://example.com/', '1.1.1.1');
        expect(next).not.toHaveBeenCalled();
    });

    it('should return 400 when createShortUrl longUrl is invalid', async () => {
        const req = {
            body: { longUrl: 'javascript:alert(1)' },
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();
        const next = buildNext();

        await createShortUrl(req, res as never, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockedCreateShortUrlService).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it('should pass createShortUrl errors to next', async () => {
        const err = new Error('boom');
        mockedCreateShortUrlService.mockRejectedValue(err);

        const req = {
            body: { longUrl: 'https://example.com' },
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();
        const next = buildNext();

        await createShortUrl(req, res as never, next);

        expect(next).toHaveBeenCalledWith(err);
        expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 404 when redirect target is not found', async () => {
        mockedResolveShortCodeService.mockResolvedValue({ status: 'not_found' });

        const req = {
            params: { code: 'abc123' },
        } as never;
        const res = buildRes();
        const next = buildNext();

        await redirectToLongUrl(req, res as never, next);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(next).not.toHaveBeenCalled();
    });

    it('should pass redirect errors to next', async () => {
        const err = new Error('boom');
        mockedResolveShortCodeService.mockRejectedValue(err);

        const req = {
            params: { code: 'abc123' },
        } as never;
        const res = buildRes();
        const next = buildNext();

        await redirectToLongUrl(req, res as never, next);

        expect(next).toHaveBeenCalledWith(err);
    });

    it('should return 200 when getAllLinks succeeds', async () => {
        mockedGetAllLinksService.mockResolvedValue({
            page: 1,
            pageSize: 30,
            total: 0,
            hasMore: false,
            data: [],
        });

        const req = {
            query: {},
        } as never;
        const res = buildRes();
        const next = buildNext();

        await getAllLinks(req, res as never, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(mockedGetAllLinksService).toHaveBeenCalledWith({
            page: 1,
            pageSize: 30,
            includeExpired: false,
            includeInactive: false,
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('should return 400 when getAllLinks pagination is invalid', async () => {
        const req = {
            query: {
                page: '0',
                pageSize: '999',
            },
        } as never;
        const res = buildRes();
        const next = buildNext();

        await getAllLinks(req, res as never, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockedGetAllLinksService).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it('should pass getAllLinks errors to next', async () => {
        const err = new Error('boom');
        mockedGetAllLinksService.mockRejectedValue(err);

        const req = {
            query: {},
        } as never;
        const res = buildRes();
        const next = buildNext();

        await getAllLinks(req, res as never, next);

        expect(next).toHaveBeenCalledWith(err);
    });

    it('should return 404 when deleteLink target does not exist', async () => {
        mockedDeleteLinkService.mockResolvedValue(false);

        const req = {
            params: { id: '1' },
            get: vi.fn(),
            originalUrl: '/api/link/1',
        } as never;
        const res = buildRes();
        const next = buildNext();

        await deleteLink(req, res as never, next);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(next).not.toHaveBeenCalled();
    });

    it('should pass deleteLink errors to next', async () => {
        const err = new Error('boom');
        mockedDeleteLinkService.mockRejectedValue(err);

        const req = {
            params: { id: '1' },
        } as never;
        const res = buildRes();
        const next = buildNext();

        await deleteLink(req, res as never, next);

        expect(next).toHaveBeenCalledWith(err);
    });

    it('should return 410 when deactivateLink target is expired', async () => {
        mockedDeactivateLinkService.mockResolvedValue({ status: 'expired' });

        const req = {
            params: { id: '1' },
        } as never;
        const res = buildRes();
        const next = buildNext();

        await deactivateLink(req, res as never, next);

        expect(res.status).toHaveBeenCalledWith(410);
        expect(next).not.toHaveBeenCalled();
    });

    it('should pass deactivateLink errors to next', async () => {
        const err = new Error('boom');
        mockedDeactivateLinkService.mockRejectedValue(err);

        const req = {
            params: { id: '1' },
        } as never;
        const res = buildRes();
        const next = buildNext();

        await deactivateLink(req, res as never, next);

        expect(next).toHaveBeenCalledWith(err);
    });
});
