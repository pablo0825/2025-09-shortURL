import type { PoolClient } from 'pg';
import { pool } from '../db/pool';
import type { SessionListItem } from '../types/types';
import {
    countUsersByWhereSql,
    disableUserTwofaState,
    findActiveSessionsByUserId,
    findActiveUserForDeactivateForUpdate,
    findActiveUserTwofaStateForUpdate,
    findInactiveUserForRestoreForUpdate,
    findRolesByUserIds,
    findUserById,
    findUsersByWhereSql,
    restoreInactiveUser,
    revokeAllBackupCodes,
    revokeBackupCodesByVersion,
    revokeRefreshTokensByUserId,
    revokeSessionsByUserId,
    softDeleteActiveUser,
} from '../repositories/admin-user-repository';

interface GetUsersInput {
    page: number;
    limit: number;
    sortBy: 'created_at' | 'last_login_at' | 'email' | 'nickname';
    sortOrder: 'asc' | 'desc';
    q?: string;
    twofa_enabled?: boolean;
    includeInactive: boolean;
}

interface GetUsersResultRow {
    id: number;
    email: string;
    nickname: string;
    is_active: boolean;
    last_login_at: string | null;
    twofa_enabled: boolean;
    role: string[];
}

interface GetUsersResult {
    data: GetUsersResultRow[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

interface GetUserSessionsResult {
    message: string;
    data: SessionListItem[];
}

interface ResetUserTwofaResult {
    before: {
        twofa_enabled: boolean;
        twofa_enabled_at: string | null;
        twofa_backup_codes_version: number;
    };
    after: {
        twofa_enabled: boolean;
        twofa_enabled_at: string | null;
        twofa_backup_codes_version: number;
    };
    affected: {
        user_backup_codes_revoked: number;
        refresh_tokens_revoked: number;
        sessions_revoked: number;
    };
}

interface DeactivateUserResult {
    before: {
        is_active: boolean;
        deleted_at: string | null;
        twofa_enabled: boolean;
        twofa_enabled_at: string | null;
        twofa_backup_codes_version: number;
    };
    after: {
        is_active: boolean;
        deleted_at: string | null;
        twofa_enabled: boolean;
        twofa_enabled_at: string | null;
        twofa_backup_codes_version: number;
    };
    affected: {
        user_backup_codes_revoked: number;
        refresh_tokens_revoked: number;
        sessions_revoked: number;
    };
}

interface RestoreUserResult {
    before: {
        is_active: boolean;
        deleted_at: string | null;
        twofa_enabled: boolean;
    };
    after: {
        is_active: boolean;
        deleted_at: string | null;
        twofa_enabled: boolean;
    };
    affected: {
        users_updated: number;
    };
}

const wrapServiceError = (context: string, error: unknown): Error => {
    const msg:string = error instanceof Error ? error.message : String(error);
    const wrappedError = new Error(`[${context}] ${msg}`);

    if (error instanceof Error) {
        wrappedError.name = error.name;
    }

    return wrappedError;
};

export const getUsersService = async (input: GetUsersInput): Promise<GetUsersResult> => {
    let client: PoolClient | undefined;

    try {
        // 決定跳過幾筆資料，如: (1-1=0)*30, (2-1=1)*30
        const offset:number = (input.page - 1) * input.limit;
        // 檢查 sortBy 是否在合法白名單內
        const sortBySafe = ['created_at', 'last_login_at', 'email', 'nickname'].includes(input.sortBy)
            ? input.sortBy
            : 'created_at';
        const sortOrderSafe = input.sortOrder === 'asc' ? 'ASC' : 'DESC';
        const queryFilter = {
            includeInactive: input.includeInactive,
            includeTwofaFilter: input.twofa_enabled !== undefined,
            twofaEnabled: input.twofa_enabled ?? false,
            q: input.q ?? null,
        };

        client = await pool.connect();
        await client.query('BEGIN');

        const total:number = await countUsersByWhereSql(client, queryFilter);
        const users = await findUsersByWhereSql(
            client,
            queryFilter,
            sortBySafe,
            sortOrderSafe,
            input.limit,
            offset,
        );

        const userIds = users.map((item) => item.id);
        const roleRows = await findRolesByUserIds(client, userIds);
        const roleMap = roleRows.reduce((acc, row) => {
            const current = acc.get(row.user_id) ?? [];
            current.push(row.type);
            acc.set(row.user_id, current);
            return acc;
        }, new Map<number, string[]>());

        const data: GetUsersResultRow[] = users.map((item) => ({
            ...item,
            role: roleMap.get(item.id) ?? [],
        }));

        await client.query('COMMIT');

        return {
            data,
            pagination: {
                page: input.page,
                limit: input.limit,
                total,
                totalPages: Math.ceil(total / input.limit),
            },
        };
    } catch (error) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                throw wrapServiceError('adminUserService.getUsers.rollback', rollbackError);
            }
        }

        throw wrapServiceError('adminUserService.getUsers', error);
    } finally {
        if (client) {
            client.release();
        }
    }
};

export const getUserService = async (targetId: number) => {
    try {
        const user = await findUserById(targetId);

        if (!user) {
            const notFoundError = new Error('使用者不存在或資料異常');
            notFoundError.name = 'UserNotFoundError';
            throw notFoundError;
        }

        return user;
    } catch (error) {
        throw wrapServiceError('adminUserService.getUser', error);
    }
};

export const getUserSessionsService = async (
    targetId: number,
): Promise<GetUserSessionsResult> => {
    try {
        const sessions = await findActiveSessionsByUserId(targetId);
        if (!sessions.length) {
            return {
                message: '尚無裝置紀錄',
                data: [],
            };
        }

        const inactiveMs = 30 * 24 * 60 * 60 * 1000;
        const now = Date.now();

        const sessionList: SessionListItem[] = sessions.map((sessionRow) => {
            const isExpired = sessionRow.expires_at.getTime() < now;

            let status: 'expired' | 'inactive' | 'active';
            if (isExpired) {
                status = 'expired';
            } else if (!sessionRow.last_seen_at) {
                status = 'inactive';
            } else {
                const lastSeenMs = sessionRow.last_seen_at.getTime();
                status = now - lastSeenMs > inactiveMs ? 'inactive' : 'active';
            }

            return {
                id: sessionRow.id,
                last_seen_at: sessionRow.last_seen_at,
                userAgent: sessionRow.user_agent,
                ip_address: sessionRow.ip_address,
                device_info: sessionRow.device_info,
                status,
            };
        });

        return {
            message: `讀取 ${sessionList.length} 個裝置`,
            data: sessionList,
        };
    } catch (error) {
        throw wrapServiceError('adminUserService.getUserSessions', error);
    }
};

export const resetUser2faService = async (targetId: number): Promise<ResetUserTwofaResult> => {
    let client: PoolClient | undefined;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const oldState = await findActiveUserTwofaStateForUpdate(client, targetId);
        if (!oldState) {
            const notFoundError = new Error('使用者不存在或資料異常');
            notFoundError.name = 'UserNotFoundError';
            throw notFoundError;
        }

        const newState = await disableUserTwofaState(client, targetId);
        if (!newState) {
            const notFoundError = new Error('使用者不存在或資料異常');
            notFoundError.name = 'UserNotFoundError';
            throw notFoundError;
        }

        const userBackupCodesRevoked = await revokeBackupCodesByVersion(
            client,
            targetId,
            oldState.twofa_backup_codes_version,
        );
        const refreshTokensRevoked = await revokeRefreshTokensByUserId(client, targetId);
        const sessionsRevoked = await revokeSessionsByUserId(client, targetId, 'reset_user_2fa');

        await client.query('COMMIT');

        return {
            before: {
                twofa_enabled: oldState.twofa_enabled,
                twofa_enabled_at: oldState.twofa_enabled_at,
                twofa_backup_codes_version: oldState.twofa_backup_codes_version,
            },
            after: {
                twofa_enabled: newState.twofa_enabled,
                twofa_enabled_at: newState.twofa_enabled_at,
                twofa_backup_codes_version: newState.twofa_backup_codes_version,
            },
            affected: {
                user_backup_codes_revoked: userBackupCodesRevoked,
                refresh_tokens_revoked: refreshTokensRevoked,
                sessions_revoked: sessionsRevoked,
            },
        };
    } catch (error) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                throw wrapServiceError('adminUserService.resetUser2fa.rollback', rollbackError);
            }
        }
        throw wrapServiceError('adminUserService.resetUser2fa', error);
    } finally {
        if (client) {
            client.release();
        }
    }
};

export const deactivateUserService = async (targetId: number): Promise<DeactivateUserResult> => {
    let client: PoolClient | undefined;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const oldState = await findActiveUserForDeactivateForUpdate(client, targetId);
        if (!oldState) {
            const notFoundError = new Error('使用者不存在或資料異常');
            notFoundError.name = 'UserNotFoundError';
            throw notFoundError;
        }

        const newState = await softDeleteActiveUser(client, targetId);
        if (!newState) {
            const notFoundError = new Error('使用者不存在或資料異常');
            notFoundError.name = 'UserNotFoundError';
            throw notFoundError;
        }

        const userBackupCodesRevoked = await revokeAllBackupCodes(client, targetId);
        const refreshTokensRevoked = await revokeRefreshTokensByUserId(client, targetId);
        const sessionsRevoked = await revokeSessionsByUserId(client, targetId, 'soft_delete');

        await client.query('COMMIT');

        return {
            before: {
                is_active: oldState.is_active,
                deleted_at: oldState.deleted_at,
                twofa_enabled: oldState.twofa_enabled,
                twofa_enabled_at: oldState.twofa_enabled_at,
                twofa_backup_codes_version: oldState.twofa_backup_codes_version,
            },
            after: {
                is_active: newState.is_active,
                deleted_at: newState.deleted_at,
                twofa_enabled: newState.twofa_enabled,
                twofa_enabled_at: newState.twofa_enabled_at,
                twofa_backup_codes_version: newState.twofa_backup_codes_version,
            },
            affected: {
                user_backup_codes_revoked: userBackupCodesRevoked,
                refresh_tokens_revoked: refreshTokensRevoked,
                sessions_revoked: sessionsRevoked,
            },
        };
    } catch (error) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                throw wrapServiceError('adminUserService.deactivateUser.rollback', rollbackError);
            }
        }
        throw wrapServiceError('adminUserService.deactivateUser', error);
    } finally {
        if (client) {
            client.release();
        }
    }
};

export const restoreUserService = async (targetId: number): Promise<RestoreUserResult> => {
    let client: PoolClient | undefined;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const oldState = await findInactiveUserForRestoreForUpdate(client, targetId);
        if (!oldState) {
            const notFoundError = new Error('使用者不存在或資料異常');
            notFoundError.name = 'UserNotFoundError';
            throw notFoundError;
        }

        const newState = await restoreInactiveUser(client, targetId);
        if (!newState) {
            const notFoundError = new Error('使用者不存在或資料異常');
            notFoundError.name = 'UserNotFoundError';
            throw notFoundError;
        }

        await client.query('COMMIT');

        return {
            before: {
                is_active: oldState.is_active,
                deleted_at: oldState.deleted_at,
                twofa_enabled: oldState.twofa_enabled,
            },
            after: {
                is_active: newState.is_active,
                deleted_at: newState.deleted_at,
                twofa_enabled: newState.twofa_enabled,
            },
            affected: {
                users_updated: 1,
            },
        };
    } catch (error) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                throw wrapServiceError('adminUserService.restoreUser.rollback', rollbackError);
            }
        }
        throw wrapServiceError('adminUserService.restoreUser', error);
    } finally {
        if (client) {
            client.release();
        }
    }
};
