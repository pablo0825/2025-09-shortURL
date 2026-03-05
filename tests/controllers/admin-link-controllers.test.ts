import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/admin/admin-link-service', () => ({
    getAdminLinksService: vi.fn(),
}));

vi.mock('../../src/services/admin/admin-audit-log-service', () => ({
    recordAdminAuditLogService: vi.fn().mockResolvedValue(undefined),
}));

import { getAdminLinks as rawGetAdminLinks } from '../../src/controllers/admin-link-controllers';
import { errorHandler } from '../../src/middlewares/error/error-handler';
import { logger } from '../../src/lib/logger';
import { getAdminLinksService } from '../../src/services/admin/admin-link-service';

const mockedGetAdminLinksService = vi.mocked(getAdminLinksService);

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

    const getAdminLinks = async (req: never, res: ReturnType<typeof buildRes>): Promise<void> => {
        const next = (err?: unknown): void => {
            if (!err) {
                return;
            }

            errorHandler(err, req, res as never, vi.fn());
        };

        await rawGetAdminLinks(req, res as never, next);
    };

    it('should return 401 when user id is missing', async () => {
        const req = {
            user: { role: 'admin' },
            query: { page: 1, limit: 20, sortBy: 'created_at', sortOrder: 'desc' },
        } as never;
        const res = buildRes();

        await getAdminLinks(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 403 when user role is not admin or assistant', async () => {
        const req = {
            user: { id: 1, role: 'user' },
            query: { page: 1, limit: 20, sortBy: 'created_at', sortOrder: 'desc' },
        } as never;
        const res = buildRes();

        await getAdminLinks(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 400 when query is invalid', async () => {
        const req = {
            user: { id: 1, role: 'admin' },
            query: { page: 1, sortBy: 'created_at', sortOrder: 'desc' },
        } as never;
        const res = buildRes();

        await getAdminLinks(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 200 with result when service succeeds', async () => {
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

        await getAdminLinks(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when service throws error', async () => {
        mockedGetAdminLinksService.mockRejectedValue(new Error('db down'));

        const req = {
            user: { id: 1, role: 'admin' },
            query: { page: 1, limit: 20, sortBy: 'created_at', sortOrder: 'desc' },
            originalUrl: '/api/admin/links',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await getAdminLinks(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});
