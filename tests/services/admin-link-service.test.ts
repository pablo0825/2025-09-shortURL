import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/repositories/admin/link-admin-repository', () => ({
    deactivateAdminLinkById: vi.fn(),
    findAdminLinkById: vi.fn(),
    findAdminLinkStateByIdForUpdate: vi.fn(),
    listAdminLinks: vi.fn(),
}));

vi.mock('../../src/db/pool', () => ({
    pool: {
        connect: vi.fn(),
    },
}));

import { pool } from '../../src/db/pool';
import {
    deactivateAdminLinkById,
    findAdminLinkById,
    findAdminLinkStateByIdForUpdate,
    listAdminLinks,
} from '../../src/repositories/admin/link-admin-repository';
import {
    deactivateAdminLinkByIdService,
    getAdminLinkByIdService,
    getAdminLinksService,
} from '../../src/services/admin/admin-link-service';

const mockedPool = vi.mocked(pool);
const mockedListAdminLinks = vi.mocked(listAdminLinks);
const mockedFindAdminLinkById = vi.mocked(findAdminLinkById);
const mockedFindAdminLinkStateByIdForUpdate = vi.mocked(findAdminLinkStateByIdForUpdate);
const mockedDeactivateAdminLinkById = vi.mocked(deactivateAdminLinkById);

const queryMock = vi.fn();
const releaseMock = vi.fn();

describe('admin-link-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedPool.connect.mockResolvedValue({
            query: queryMock,
            release: releaseMock,
        } as never);
        queryMock.mockResolvedValue(undefined);
    });

    it('should map rows to response shape', async () => {
        mockedListAdminLinks.mockResolvedValue({
            rows: [
                {
                    id: 101,
                    code: 'abc123',
                    long_url: 'https://example.com/page',
                    created_at: '2026-03-03T10:00:00.000Z',
                    updated_at: '2026-03-03T10:00:00.000Z',
                    expire_at: '2099-03-10T10:00:00.000Z',
                    deleted_at: null,
                    click_count: '42',
                    last_clicked_at: '2026-03-03T12:00:00.000Z',
                    is_active: true,
                    creator_user_id: 7,
                    creator_email: 'user@example.com',
                },
            ],
            total: 1,
        });

        const result = await getAdminLinksService({
            page: 1,
            limit: 20,
            sortBy: 'created_at',
            sortOrder: 'desc',
            q: 'abc',
        });

        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.status).toBe('active');
        expect(result.data[0]?.targetDomain).toBe('example.com');
        expect(result.pagination.totalPages).toBe(1);
        expect(mockedListAdminLinks).toHaveBeenCalledWith(
            expect.objectContaining({
                statusFilter: {
                    deletedAt: 'ignore',
                    isActive: 'ignore',
                    expireAt: 'ignore',
                },
            }),
        );
    });

    it('should convert active status to repository filter', async () => {
        mockedListAdminLinks.mockResolvedValue({
            rows: [],
            total: 0,
        });

        await getAdminLinksService({
            page: 1,
            limit: 20,
            sortBy: 'updated_at',
            sortOrder: 'asc',
            status: 'active',
        });

        expect(mockedListAdminLinks).toHaveBeenCalledWith(
            expect.objectContaining({
                statusFilter: {
                    deletedAt: 'is_null',
                    isActive: true,
                    expireAt: 'gt_now',
                },
            }),
        );
    });

    it('should wrap repository error with service context', async () => {
        mockedListAdminLinks.mockRejectedValue(new Error('db down'));

        await expect(
            getAdminLinksService({
                page: 1,
                limit: 20,
                sortBy: 'created_at',
                sortOrder: 'desc',
            }),
        ).rejects.toMatchObject({
            message: '[adminLinkService.getAdminLinks] db down',
        });
    });

    it('should return link detail for existing id', async () => {
        mockedFindAdminLinkById.mockResolvedValue({
            id: 101,
            code: 'abc123',
            long_url: 'https://example.com/page?a=1',
            created_at: '2026-03-03T10:00:00.000Z',
            updated_at: '2026-03-04T09:00:00.000Z',
            expire_at: '2099-03-10T10:00:00.000Z',
            deleted_at: null,
            click_count: '42',
            last_clicked_at: '2026-03-05T06:00:00.000Z',
            is_active: true,
            creator_user_id: 7,
            creator_email: 'user@example.com',
        });

        const result = await getAdminLinkByIdService(101);

        expect(result.id).toBe(101);
        expect(result.status).toBe('active');
        expect(result.meta.isDeleted).toBe(false);
        expect(result.creator.email).toBe('user@example.com');
    });

    it('should throw 404 when link id does not exist', async () => {
        mockedFindAdminLinkById.mockResolvedValue(null);

        await expect(getAdminLinkByIdService(999)).rejects.toMatchObject({
            statusCode: 404,
            message: '查無資料',
        });
    });

    it('should deactivate link and return before/after', async () => {
        mockedFindAdminLinkStateByIdForUpdate.mockResolvedValue({
            id: 101,
            code: 'abc123',
            is_active: true,
            deleted_at: null,
            expire_at: '2099-03-10T10:00:00.000Z',
            updated_at: '2026-03-03T10:00:00.000Z',
        });
        mockedDeactivateAdminLinkById.mockResolvedValue({
            updated_at: '2026-03-06T09:30:00.000Z',
        });

        const result = await deactivateAdminLinkByIdService(101);

        expect(result.before.isActive).toBe(true);
        expect(result.after.isActive).toBe(false);
        expect(result.after.status).toBe('disabled');
        expect(queryMock).toHaveBeenCalledWith('COMMIT');
    });

    it('should throw 409 when link is deleted in deactivate', async () => {
        mockedFindAdminLinkStateByIdForUpdate.mockResolvedValue({
            id: 101,
            code: 'abc123',
            is_active: true,
            deleted_at: '2026-03-06T09:00:00.000Z',
            expire_at: '2099-03-10T10:00:00.000Z',
            updated_at: '2026-03-03T10:00:00.000Z',
        });

        await expect(deactivateAdminLinkByIdService(101)).rejects.toMatchObject({
            statusCode: 409,
        });
        await expect(deactivateAdminLinkByIdService(101)).rejects.toThrow('連結已刪除，無法停用');
        expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should throw 409 when link is already disabled in deactivate', async () => {
        mockedFindAdminLinkStateByIdForUpdate.mockResolvedValue({
            id: 101,
            code: 'abc123',
            is_active: false,
            deleted_at: null,
            expire_at: '2099-03-10T10:00:00.000Z',
            updated_at: '2026-03-03T10:00:00.000Z',
        });

        await expect(deactivateAdminLinkByIdService(101)).rejects.toMatchObject({
            statusCode: 409,
        });
        await expect(deactivateAdminLinkByIdService(101)).rejects.toThrow('連結已停用');
        expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
    });
});
