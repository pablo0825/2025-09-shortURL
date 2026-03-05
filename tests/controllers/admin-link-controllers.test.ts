import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/admin/admin-link-service', () => ({
    deactivateAdminLinkByIdService: vi.fn(),
    getAdminLinkByIdService: vi.fn(),
    getAdminLinksService: vi.fn(),
}));

vi.mock('../../src/services/admin/admin-audit-log-service', () => ({
    recordAdminAuditLogService: vi.fn().mockResolvedValue(undefined),
}));

import {
    deactivateAdminLinkById as rawDeactivateAdminLinkById,
    getAdminLinkById as rawGetAdminLinkById,
    getAdminLinks as rawGetAdminLinks,
} from '../../src/controllers/admin-link-controllers';
import { errorHandler } from '../../src/middlewares/error/error-handler';
import { logger } from '../../src/lib/logger';
import { AppError } from '../../src/utils/app-error';
import {
    deactivateAdminLinkByIdService,
    getAdminLinkByIdService,
    getAdminLinksService,
} from '../../src/services/admin/admin-link-service';

const mockedGetAdminLinksService = vi.mocked(getAdminLinksService);
const mockedGetAdminLinkByIdService = vi.mocked(getAdminLinkByIdService);
const mockedDeactivateAdminLinkByIdService = vi.mocked(deactivateAdminLinkByIdService);

const buildRes = () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    return { status, json, headersSent: false };
};

describe('admin-link-controllers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(logger, 'error').mockImplementation(() => undefined);
        vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    });

    const invokeWithErrorHandler = async (
        handler: (req: never, res: never, next?: (err?: unknown) => void) => Promise<void>,
        req: never,
        res: ReturnType<typeof buildRes>,
    ): Promise<void> => {
        const next = (err?: unknown): void => {
            if (!err) {
                return;
            }

            errorHandler(err, req, res as never, vi.fn());
        };

        await handler(req, res as never, next);
    };

    it('should return 401 in getAdminLinks when user id is missing', async () => {
        const req = {
            user: { role: 'admin' },
            query: { page: 1, limit: 20, sortBy: 'created_at', sortOrder: 'desc' },
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawGetAdminLinks, req, res);

        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 403 in getAdminLinks when role is not admin or assistant', async () => {
        const req = {
            user: { id: 1, role: 'user' },
            query: { page: 1, limit: 20, sortBy: 'created_at', sortOrder: 'desc' },
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawGetAdminLinks, req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 400 in getAdminLinks when query is invalid', async () => {
        const req = {
            user: { id: 1, role: 'admin' },
            query: { page: 1, sortBy: 'created_at', sortOrder: 'desc' },
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawGetAdminLinks, req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 200 in getAdminLinks when service succeeds', async () => {
        mockedGetAdminLinksService.mockResolvedValue({
            data: [],
            pagination: {
                page: 1,
                limit: 20,
                total: 0,
                totalPages: 0,
            },
        });

        const req = {
            user: { id: 1, role: 'admin' },
            query: { page: 1, limit: 20, sortBy: 'created_at', sortOrder: 'desc' },
            originalUrl: '/api/admin/links',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawGetAdminLinks, req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 200 in getAdminLinkById when service succeeds', async () => {
        mockedGetAdminLinkByIdService.mockResolvedValue({
            id: 101,
            code: 'abc123',
            shortUrl: 'https://sho.rt/abc123',
            longUrl: 'https://example.com/page?a=1',
            targetDomain: 'example.com',
            status: 'active',
            createdAt: '2026-03-03T10:00:00.000Z',
            updatedAt: '2026-03-04T09:00:00.000Z',
            expireAt: '2026-03-10T10:00:00.000Z',
            deletedAt: null,
            clickCount: 42,
            lastClickedAt: '2026-03-05T06:00:00.000Z',
            creator: { userId: 7, email: 'user@example.com' },
            meta: { isExpired: false, isDeleted: false, canDisable: true, canRestore: false },
        });

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '101' },
            originalUrl: '/api/admin/links/101',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawGetAdminLinkById, req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 404 in getAdminLinkById when link is missing', async () => {
        mockedGetAdminLinkByIdService.mockRejectedValue(new AppError(404, '查無資料'));

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '999' },
            originalUrl: '/api/admin/links/999',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawGetAdminLinkById, req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 200 in deactivateAdminLinkById when service succeeds', async () => {
        mockedDeactivateAdminLinkByIdService.mockResolvedValue({
            id: 101,
            before: { isActive: true, status: 'active' },
            after: { isActive: false, status: 'disabled' },
            updatedAt: '2026-03-06T09:30:00.000Z',
        });

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '101' },
            originalUrl: '/api/admin/links/101/deactivate',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawDeactivateAdminLinkById, req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 409 in deactivateAdminLinkById when link is deleted', async () => {
        mockedDeactivateAdminLinkByIdService.mockRejectedValue(
            new AppError(409, '連結已刪除，無法停用'),
        );

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '101' },
            originalUrl: '/api/admin/links/101/deactivate',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawDeactivateAdminLinkById, req, res);

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it('should return 409 in deactivateAdminLinkById when link is disabled', async () => {
        mockedDeactivateAdminLinkByIdService.mockRejectedValue(new AppError(409, '連結已停用'));

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '101' },
            originalUrl: '/api/admin/links/101/deactivate',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawDeactivateAdminLinkById, req, res);

        expect(res.status).toHaveBeenCalledWith(409);
    });
});
