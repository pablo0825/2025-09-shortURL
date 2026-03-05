import type { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { AppError } from '../../utils/app-error';
import type { AdminLinksQueryDto } from '../../schemas/admin-schema';
import {
    deactivateAdminLinkById,
    findAdminLinkById,
    findAdminLinkStateByIdForUpdate,
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

interface AdminLinkDetailResult {
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
    creator: {
        userId: number | null;
        email: string | null;
    };
    meta: {
        isExpired: boolean;
        isDeleted: boolean;
        canDisable: boolean;
        canRestore: boolean;
    };
}

interface DeactivateAdminLinkResult {
    id: number;
    before: {
        isActive: boolean;
        status: LinkStatus;
    };
    after: {
        isActive: false;
        status: 'disabled';
    };
    updatedAt: string;
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

const wrapServiceError = (context: string, error: unknown): AppError => {
    if (error instanceof AppError) {
        return new AppError(error.statusCode, `[${context}] ${error.message}`, error.code);
    }

    const message = error instanceof Error ? error.message : String(error);
    return new AppError(500, `[${context}] ${message}`);
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
                    status: resolveLinkStatus(row.deleted_at, row.expire_at, row.is_active),
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
        throw wrapServiceError('adminLinkService.getAdminLinks', error);
    }
};

export const getAdminLinkByIdService = async (id: number): Promise<AdminLinkDetailResult> => {
    try {
        const row = await findAdminLinkById(id);
        if (!row || !row.code) {
            throw new AppError(404, '查無資料');
        }

        const shortUrl = new URL(`/${row.code}`, SHORT_BASE_URL).toString();
        const status = resolveLinkStatus(row.deleted_at, row.expire_at, row.is_active);
        const isDeleted = row.deleted_at !== null;
        const isExpired = !isDeleted && row.is_active && new Date(row.expire_at).getTime() <= Date.now();

        return {
            id: row.id,
            code: row.code,
            shortUrl,
            longUrl: row.long_url,
            targetDomain: resolveTargetDomain(row.long_url),
            status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            expireAt: row.expire_at,
            deletedAt: row.deleted_at,
            clickCount: Number(row.click_count),
            lastClickedAt: row.last_clicked_at,
            creator: {
                userId: row.creator_user_id,
                email: row.creator_email,
            },
            meta: {
                isExpired,
                isDeleted,
                canDisable: status === 'active',
                canRestore: isDeleted,
            },
        };
    } catch (error) {
        if (error instanceof AppError && error.statusCode === 404) {
            throw error;
        }
        throw wrapServiceError('adminLinkService.getAdminLinkById', error);
    }
};

export const deactivateAdminLinkByIdService = async (
    id: number,
): Promise<DeactivateAdminLinkResult> => {
    let client: PoolClient | undefined;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const state = await findAdminLinkStateByIdForUpdate(client, id);
        if (!state) {
            throw new AppError(404, '查無資料');
        }

        if (state.deleted_at !== null) {
            throw new AppError(409, '連結已刪除，無法停用');
        }

        if (!state.is_active) {
            throw new AppError(409, '連結已停用');
        }

        const updated = await deactivateAdminLinkById(client, id);
        if (!updated) {
            throw new AppError(404, '查無資料');
        }

        await client.query('COMMIT');

        return {
            id,
            before: {
                isActive: state.is_active,
                status: resolveLinkStatus(state.deleted_at, state.expire_at, state.is_active),
            },
            after: {
                isActive: false,
                status: 'disabled',
            },
            updatedAt: updated.updated_at,
        };
    } catch (error) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                throw wrapServiceError('adminLinkService.deactivateAdminLinkById.rollback', rollbackError);
            }
        }

        throw wrapServiceError('adminLinkService.deactivateAdminLinkById', error);
    } finally {
        if (client) {
            client.release();
        }
    }
};
