import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/admin/admin-link-service', () => ({
    deactivateAdminLinksService: vi.fn(),
    deleteAdminLinksService: vi.fn(),
    getAdminLinkByIdService: vi.fn(),
    getAdminLinksService: vi.fn(),
    restoreAdminLinksService: vi.fn(),
}));

vi.mock('../../src/services/admin/admin-audit-log-service', () => ({
    recordAdminAuditLogService: vi.fn().mockResolvedValue(undefined),
}));

import {
    deactivateAdminLinkById as rawDeactivateAdminLinkById,
    deleteAdminLinkById as rawDeleteAdminLinkById,
    getAdminLinkById as rawGetAdminLinkById,
    getAdminLinks as rawGetAdminLinks,
    restoreAdminLinks as rawRestoreAdminLinks,
} from '../../src/controllers/admin-link-controllers';
import { errorHandler } from '../../src/middlewares/error/error-handler';
import { logger } from '../../src/lib/logger';
import { AppError } from '../../src/utils/app-error';
import {
    deactivateAdminLinksService,
    deleteAdminLinksService,
    getAdminLinkByIdService,
    getAdminLinksService,
    restoreAdminLinksService,
} from '../../src/services/admin/admin-link-service';

const mockedGetAdminLinksService = vi.mocked(getAdminLinksService);
const mockedGetAdminLinkByIdService = vi.mocked(getAdminLinkByIdService);
const mockedDeactivateAdminLinksService = vi.mocked(deactivateAdminLinksService);
const mockedDeleteAdminLinksService = vi.mocked(deleteAdminLinksService);
const mockedRestoreAdminLinksService = vi.mocked(restoreAdminLinksService);

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
        mockedGetAdminLinkByIdService.mockRejectedValue(new AppError(404, '?亦鞈?'));

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

    it('should return 200 in deactivateAdminLinkById when all deactivations succeed', async () => {
        mockedDeactivateAdminLinksService.mockResolvedValue({
            succeeded: [
                {
                    id: 101,
                    before: { isActive: true, deletedAt: null, status: 'active' },
                    after: { isActive: false, deletedAt: null, status: 'disabled' },
                    updatedAt: '2026-03-06T09:30:00.000Z',
                },
            ],
            failed: [],
        });

        const req = {
            user: { id: 1, role: 'admin' },
            body: { ids: [101] },
            originalUrl: '/api/admin/links/deactivate',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawDeactivateAdminLinkById, req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 207 in deactivateAdminLinkById when deactivations are partially successful', async () => {
        mockedDeactivateAdminLinksService.mockResolvedValue({
            succeeded: [
                {
                    id: 101,
                    before: { isActive: true, deletedAt: null, status: 'active' },
                    after: { isActive: false, deletedAt: null, status: 'disabled' },
                    updatedAt: '2026-03-06T09:30:00.000Z',
                },
            ],
            failed: [{ id: 102, reason: '連結已刪除，請使用 restore' }],
        });

        const req = {
            user: { id: 1, role: 'admin' },
            body: { ids: [101, 102] },
            originalUrl: '/api/admin/links/deactivate',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawDeactivateAdminLinkById, req, res);

        expect(res.status).toHaveBeenCalledWith(207);
    });

    it('should return 422 in deactivateAdminLinkById when all deactivations fail', async () => {
        mockedDeactivateAdminLinksService.mockResolvedValue({
            succeeded: [],
            failed: [{ id: 101, reason: '連結已過期，無法停用' }],
        });

        const req = {
            user: { id: 1, role: 'admin' },
            body: { ids: [101] },
            originalUrl: '/api/admin/links/deactivate',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawDeactivateAdminLinkById, req, res);

        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('should return 400 in deactivateAdminLinkById when ids body is invalid', async () => {
        const req = {
            user: { id: 1, role: 'admin' },
            body: { ids: [] },
            originalUrl: '/api/admin/links/deactivate',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawDeactivateAdminLinkById, req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 200 in deleteAdminLinkById when all deletes succeed', async () => {
        mockedDeleteAdminLinksService.mockResolvedValue({
            succeeded: [
                {
                    id: 101,
                    before: { isActive: true, deletedAt: null, status: 'active' },
                    after: { isActive: false, deletedAt: '2026-03-06T09:30:00.000Z', status: 'deleted' },
                    updatedAt: '2026-03-06T09:30:00.000Z',
                },
            ],
            failed: [],
        });

        const req = {
            user: { id: 1, role: 'admin' },
            body: { ids: [101] },
            originalUrl: '/api/admin/links',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawDeleteAdminLinkById, req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 207 in deleteAdminLinkById when deletes are partially successful', async () => {
        mockedDeleteAdminLinksService.mockResolvedValue({
            succeeded: [
                {
                    id: 101,
                    before: { isActive: true, deletedAt: null, status: 'active' },
                    after: { isActive: false, deletedAt: '2026-03-06T09:30:00.000Z', status: 'deleted' },
                    updatedAt: '2026-03-06T09:30:00.000Z',
                },
            ],
            failed: [{ id: 102, reason: '連結已刪除，無法被刪除' }],
        });

        const req = {
            user: { id: 1, role: 'admin' },
            body: { ids: [101, 102] },
            originalUrl: '/api/admin/links',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawDeleteAdminLinkById, req, res);

        expect(res.status).toHaveBeenCalledWith(207);
    });

    it('should return 422 in deleteAdminLinkById when all deletes fail', async () => {
        mockedDeleteAdminLinksService.mockResolvedValue({
            succeeded: [],
            failed: [{ id: 101, reason: '連結已刪除，無法被刪除' }],
        });

        const req = {
            user: { id: 1, role: 'admin' },
            body: { ids: [101] },
            originalUrl: '/api/admin/links',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawDeleteAdminLinkById, req, res);

        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('should return 400 in deleteAdminLinkById when ids body is invalid', async () => {
        const req = {
            user: { id: 1, role: 'admin' },
            body: { ids: [] },
            originalUrl: '/api/admin/links',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawDeleteAdminLinkById, req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 200 in restoreAdminLinks when all restores succeed', async () => {
        mockedRestoreAdminLinksService.mockResolvedValue({
            succeeded: [
                {
                    id: 101,
                    before: { isActive: false, deletedAt: '2026-03-06T09:30:00.000Z', status: 'deleted' },
                    after: { isActive: true, deletedAt: null, status: 'active' },
                    updatedAt: '2026-03-06T09:35:00.000Z',
                },
            ],
            failed: [],
        });

        const req = {
            user: { id: 1, role: 'admin' },
            body: { ids: [101] },
            originalUrl: '/api/admin/links/restore',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawRestoreAdminLinks, req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 207 in restoreAdminLinks when restores are partially successful', async () => {
        mockedRestoreAdminLinksService.mockResolvedValue({
            succeeded: [
                {
                    id: 101,
                    before: { isActive: false, deletedAt: '2026-03-06T09:30:00.000Z', status: 'deleted' },
                    after: { isActive: true, deletedAt: null, status: 'active' },
                    updatedAt: '2026-03-06T09:35:00.000Z',
                },
            ],
            failed: [{ id: 102, reason: 'Link is active' }],
        });

        const req = {
            user: { id: 1, role: 'admin' },
            body: { ids: [101, 102] },
            originalUrl: '/api/admin/links/restore',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawRestoreAdminLinks, req, res);

        expect(res.status).toHaveBeenCalledWith(207);
    });

    it('should return 422 in restoreAdminLinks when all restores fail', async () => {
        mockedRestoreAdminLinksService.mockResolvedValue({
            succeeded: [],
            failed: [{ id: 101, reason: 'Link is active' }],
        });

        const req = {
            user: { id: 1, role: 'admin' },
            body: { ids: [101] },
            originalUrl: '/api/admin/links/restore',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawRestoreAdminLinks, req, res);

        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('should return 400 in restoreAdminLinks when ids body is invalid', async () => {
        const req = {
            user: { id: 1, role: 'admin' },
            body: { ids: [] },
            originalUrl: '/api/admin/links/restore',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(rawRestoreAdminLinks, req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });
});
