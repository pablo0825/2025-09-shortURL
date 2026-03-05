import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/repositories/admin/link-admin-repository', () => ({
    listAdminLinks: vi.fn(),
}));

import { listAdminLinks } from '../../src/repositories/admin/link-admin-repository';
import { getAdminLinksService } from '../../src/services/admin/admin-link-service';

const mockedListAdminLinks = vi.mocked(listAdminLinks);

describe('admin-link-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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

    it('should map disabled status from row state', async () => {
        mockedListAdminLinks.mockResolvedValue({
            rows: [
                {
                    id: 1,
                    code: 'd1',
                    long_url: 'https://example.com',
                    created_at: '2026-03-03T10:00:00.000Z',
                    updated_at: '2026-03-03T10:00:00.000Z',
                    expire_at: '2099-03-10T10:00:00.000Z',
                    deleted_at: null,
                    click_count: '0',
                    last_clicked_at: null,
                    is_active: false,
                    creator_user_id: null,
                    creator_email: null,
                },
            ],
            total: 1,
        });

        const result = await getAdminLinksService({
            page: 1,
            limit: 20,
            sortBy: 'updated_at',
            sortOrder: 'asc',
        });

        expect(result.data[0]?.status).toBe('disabled');
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
});
