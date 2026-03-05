import { AppError } from '../../utils/app-error';
import type { AdminLinksQueryDto } from '../../schemas/admin-schema';
import {
    listAdminLinks,
    type AdminLinksStatusFilter,
    type ListAdminLinksQuery,
} from '../../repositories/admin/link-admin-repository';

const SHORT_BASE_URL = process.env.SHORT_BASE_URL?.replace(/\/+$/, '') || 'http://localhost:3001';

type LinkStatus = 'active' | 'expired' | 'disabled' | 'deleted';

interface AdminLinkItem {
    id: number;
    code: string;
    shortUrl: string;
    longUrl: string;
    targetDomain: string;
    status: LinkStatus;
    createdAt: string;
    updatedAt: string;
    expireAt: string;
    deletedAt: string | null;
    clickCount: number;
    lastClickedAt: string | null;
    creatorUserId: number | null;
    creatorEmail: string | null;
}

interface AdminLinksListResult {
    data: AdminLinkItem[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

const resolveLinkStatus = (
    deletedAt: string | null,
    expireAt: string,
    isActive: boolean,
): LinkStatus => {
    if (deletedAt) {
        return 'deleted';
    }

    if (!isActive) {
        return 'disabled';
    }

    return new Date(expireAt).getTime() <= Date.now() ? 'expired' : 'active';
};

const resolveTargetDomain = (longUrl: string): string => {
    try {
        return new URL(longUrl).hostname;
    } catch {
        return '';
    }
};

const wrapServiceError = (error: unknown): AppError => {
    if (error instanceof AppError) {
        return new AppError(500, `[adminLinkService.getAdminLinks] ${error.message}`, error.code);
    }

    const message = error instanceof Error ? error.message : String(error);
    return new AppError(500, `[adminLinkService.getAdminLinks] ${message}`);
};

const resolveStatusFilter = (status: AdminLinksQueryDto['status']): AdminLinksStatusFilter => {
    if (status === 'active') {
        return {
            deletedAt: 'is_null',
            isActive: true,
            expireAt: 'gt_now',
        };
    }

    if (status === 'expired') {
        return {
            deletedAt: 'is_null',
            isActive: true,
            expireAt: 'lte_now',
        };
    }

    if (status === 'disabled') {
        return {
            deletedAt: 'is_null',
            isActive: false,
            expireAt: 'ignore',
        };
    }

    if (status === 'deleted') {
        return {
            deletedAt: 'is_not_null',
            isActive: 'ignore',
            expireAt: 'ignore',
        };
    }

    return {
        deletedAt: 'ignore',
        isActive: 'ignore',
        expireAt: 'ignore',
    };
};

export const getAdminLinksService = async (
    input: AdminLinksQueryDto,
): Promise<AdminLinksListResult> => {
    try {
        const queryInput: ListAdminLinksQuery = {
            page: input.page,
            limit: input.limit,
            sortBy: input.sortBy,
            sortOrder: input.sortOrder,
            q: input.q,
            statusFilter: resolveStatusFilter(input.status),
        };
        const queried = await listAdminLinks(queryInput);
        const data: AdminLinkItem[] = queried.rows
            .filter((row) => row.code !== null)
            .map((row) => {
                const code = row.code ?? '';
                const shortUrl = new URL(`/${code}`, SHORT_BASE_URL).toString();

                return {
                    id: row.id,
                    code,
                    shortUrl,
                    longUrl: row.long_url,
                    targetDomain: resolveTargetDomain(row.long_url),
                    status: resolveLinkStatus(
                        row.deleted_at,
                        row.expire_at,
                        row.is_active,
                    ),
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                    expireAt: row.expire_at,
                    deletedAt: row.deleted_at,
                    clickCount: Number(row.click_count),
                    lastClickedAt: row.last_clicked_at,
                    creatorUserId: row.creator_user_id,
                    creatorEmail: row.creator_email,
                };
            });

        return {
            data,
            pagination: {
                page: input.page,
                limit: input.limit,
                total: queried.total,
                totalPages: Math.ceil(queried.total / input.limit),
            },
        };
    } catch (error) {
        throw wrapServiceError(error);
    }
};
