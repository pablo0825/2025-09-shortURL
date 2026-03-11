import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/cache', () => ({
    buildCacheKey: vi.fn((module: string, identifier: string) => `${module}:${identifier}`),
    cacheDel: vi.fn(),
    cacheExists: vi.fn(),
    cacheGet: vi.fn(),
    cacheSet: vi.fn(), // still needed for DB-hit path tests
}));

vi.mock('../../src/repositories/link/link-repository', () => ({
    createLinkRecord: vi.fn(),
    deactivateLinkById: vi.fn(),
    deleteLinkById: vi.fn(),
    findLinkByShortCode: vi.fn(),
    findLinkStateById: vi.fn(),
    listLinks: vi.fn(),
}));

vi.mock('../../src/lib/is-forbidden-target', () => ({
    isForbiddenTarget: vi.fn(),
}));

import { cacheDel, cacheExists, cacheGet } from '../../src/lib/cache';
import {
    createLinkRecord,
    deactivateLinkById,
    deleteLinkById,
    findLinkByShortCode,
    findLinkStateById,
    listLinks,
} from '../../src/repositories/link/link-repository';
import { isForbiddenTarget } from '../../src/lib/is-forbidden-target';
import {
    createShortUrlService,
    deactivateLinkService,
    deleteLinkService,
    getAllLinksService,
    resolveShortCodeService,
} from '../../src/services/link/link-service';

const mockedCacheDel = vi.mocked(cacheDel);
const mockedCacheExists = vi.mocked(cacheExists);
const mockedCacheGet = vi.mocked(cacheGet);
const mockedCreateLinkRecord = vi.mocked(createLinkRecord);
const mockedDeactivateLinkById = vi.mocked(deactivateLinkById);
const mockedDeleteLinkById = vi.mocked(deleteLinkById);
const mockedFindLinkByShortCode = vi.mocked(findLinkByShortCode);
const mockedFindLinkStateById = vi.mocked(findLinkStateById);
const mockedIsForbiddenTarget = vi.mocked(isForbiddenTarget);
const mockedListLinks = vi.mocked(listLinks);

describe('link-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedCacheExists.mockResolvedValue(false);
        mockedCacheGet.mockResolvedValue(null);
        mockedIsForbiddenTarget.mockResolvedValue(false);
    });

    describe('resolveShortCodeService', () => {
        it('should return not_found when negative cache key exists', async () => {
            mockedCacheExists.mockResolvedValue(true);

            const result = await resolveShortCodeService('abc123');

            expect(result).toEqual({ status: 'not_found' });
            expect(mockedCacheGet).not.toHaveBeenCalled();
            expect(mockedFindLinkByShortCode).not.toHaveBeenCalled();
        });

        it('should return cached long url when cache hits', async () => {
            mockedCacheGet.mockResolvedValue('https://example.com/path');

            const result = await resolveShortCodeService('abc123');

            expect(result).toEqual({
                status: 'found',
                longUrl: 'https://example.com/path',
            });
            expect(mockedCacheDel).not.toHaveBeenCalled();
            expect(mockedFindLinkByShortCode).not.toHaveBeenCalled();
            expect(mockedIsForbiddenTarget).not.toHaveBeenCalled();
        });

        it('should throw wrapped AppError when db long url is invalid', async () => {
            mockedFindLinkByShortCode.mockResolvedValue({
                id: '1',
                code: 'abc123',
                long_url: 'javascript:alert(1)',
                expire_at: new Date(Date.now() + 60_000).toISOString(),
            } as never);

            await expect(resolveShortCodeService('abc123')).rejects.toMatchObject({
                name: 'AppError',
                statusCode: 400,
                message: '[linkService.resolveShortCode] 只支援http, https，其他都拒絕',
            });
        });
    });

    describe('createShortUrlService', () => {
        it('should create short url when target host is allowed', async () => {
            mockedCreateLinkRecord.mockResolvedValue({
                id: '1',
                code: 'abc123',
            } as never);

            const result = await createShortUrlService('https://example.com/path', '1.1.1.1', 'user-1');

            expect(result).toEqual({
                id: '1',
                code: 'abc123',
                shortUrl: 'http://localhost:3001/abc123',
            });
            expect(mockedCreateLinkRecord).toHaveBeenCalledWith('https://example.com/path', '1.1.1.1', 'user-1');
        });

        it('should throw wrapped AppError when target host is forbidden', async () => {
            mockedIsForbiddenTarget.mockResolvedValue(true);

            await expect(createShortUrlService('https://example.com/path', null, 'user-1')).rejects.toMatchObject({
                name: 'AppError',
                statusCode: 400,
                message: '[linkService.createShortUrl] 不允許的目標主機',
            });
        });
    });

    describe('getAllLinksService', () => {
        it('should use validated pagination values and map rows', async () => {
            mockedListLinks.mockResolvedValue({
                total: 1,
                rows: [
                    {
                        id: '1',
                        code: 'abc123',
                        long_url: 'https://example.com/page',
                        created_at: '2024-01-01T00:00:00.000Z',
                        expire_at: '2024-12-31T00:00:00.000Z',
                        is_active: true,
                    },
                ],
            } as never);

            const result = await getAllLinksService({
                page: 2,
                pageSize: 50,
                includeExpired: true,
                includeInactive: false,
                userId: 'user-1',
            });

            expect(mockedListLinks).toHaveBeenCalledWith(50, 50, true, false, 'user-1');
            expect(result).toEqual({
                page: 2,
                pageSize: 50,
                total: 1,
                hasMore: false,
                data: [
                    {
                        id: '1',
                        shortUrl: 'http://localhost:3001/abc123',
                        longUrl: 'https://example.com/page',
                        createdAt: '2024-01-01T00:00:00.000Z',
                        expireAt: '2024-12-31T00:00:00.000Z',
                        isActive: true,
                    },
                ],
            });
        });
    });

    describe('deleteLinkService', () => {
        it('should return false when target link does not exist', async () => {
            mockedDeleteLinkById.mockResolvedValue(null);

            const result = await deleteLinkService('1');

            expect(result).toBe(false);
            expect(mockedCacheDel).not.toHaveBeenCalled();
        });

        it('should clear related cache keys when delete succeeds', async () => {
            mockedDeleteLinkById.mockResolvedValue('abc123');

            const result = await deleteLinkService('1');

            expect(result).toBe(true);
            expect(mockedCacheDel).toHaveBeenCalledWith('short:abc123');
            expect(mockedCacheDel).toHaveBeenCalledWith('short404:abc123');
        });
    });

    describe('deactivateLinkService', () => {
        it('should clear related cache keys when deactivate succeeds', async () => {
            mockedDeactivateLinkById.mockResolvedValue('abc123');

            const result = await deactivateLinkService('1');

            expect(result).toEqual({ status: 'deactivated' });
            expect(mockedCacheDel).toHaveBeenCalledWith('short:abc123');
            expect(mockedCacheDel).toHaveBeenCalledWith('short404:abc123');
        });

        it('should return not_found when link state does not exist', async () => {
            mockedDeactivateLinkById.mockResolvedValue(null);
            mockedFindLinkStateById.mockResolvedValue(null);

            const result = await deactivateLinkService('1');

            expect(result).toEqual({ status: 'not_found' });
        });

        it('should return already_inactive when link is inactive', async () => {
            mockedDeactivateLinkById.mockResolvedValue(null);
            mockedFindLinkStateById.mockResolvedValue({
                is_active: false,
                expire_at: new Date(Date.now() + 60_000).toISOString(),
            } as never);

            const result = await deactivateLinkService('1');

            expect(result).toEqual({ status: 'already_inactive' });
        });

        it('should return expired when link is already expired', async () => {
            mockedDeactivateLinkById.mockResolvedValue(null);
            mockedFindLinkStateById.mockResolvedValue({
                is_active: true,
                expire_at: new Date(Date.now() - 60_000).toISOString(),
            } as never);

            const result = await deactivateLinkService('1');

            expect(result).toEqual({ status: 'expired' });
        });
    });
});
