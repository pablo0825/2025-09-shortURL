import type { PoolClient } from 'pg';
import { pool } from '../../db/pool';

export interface AdminUserListRow {
    id: number;
    email: string;
    nickname: string;
    is_active: boolean;
    last_login_at: string | null;
    twofa_enabled: boolean;
}

export interface AdminUserRoleRow {
    user_id: number;
    type: string;
}

export interface AdminUserRoleTypeRow {
    type: string;
}

export interface AdminRoleLookupRow {
    id: number;
    type: string;
}

export interface AdminUserDetailRow {
    id: number;
    email: string;
    nickname: string;
    phone: string | null;
    unit: string | null;
    job_title: string | null;
    is_active: boolean;
    avatar_key: string | null;
    updated_at: string | null;
    last_login_at: string | null;
    twofa_enabled: boolean;
    twofa_enabled_at: string | null;
    deleted_at: string | null;
    role: string[];
}

export interface AdminSessionRow {
    id: number;
    last_seen_at: Date | null;
    expires_at: Date;
    user_agent: string | null;
    ip_address: string | null;
    device_info: string | null;
}

export interface AdminUserTwofaStateRow {
    twofa_backup_codes_version: number;
    twofa_enabled: boolean;
    twofa_enabled_at: string | null;
}

export interface AdminUserDeactivateStateRow {
    is_active: boolean;
    deleted_at: string | null;
    twofa_enabled: boolean;
    twofa_enabled_at: string | null;
    twofa_backup_codes_version: number;
}

export interface AdminUserRestoreStateRow {
    is_active: boolean;
    deleted_at: string | null;
    twofa_enabled: boolean;
}

interface AdminUsersFilterInput {
    includeInactive: boolean;
    includeTwofaFilter: boolean;
    twofaEnabled: boolean;
    q: string | null;
}

export const countUsersByWhereSql = async (
    client: PoolClient,
    input: AdminUsersFilterInput,
): Promise<number> => {
    // count 計算比數，::int 把結果轉成整數，total 欄位名稱
    // $1::boolean，把 $1 轉成 boolean，
    // 兩種結果，如: true or is_active = true (不過濾)，false or is_active = true (過濾，看右邊結果)
    // NOT $2 是指邏輯反轉，像是 $2 = true -> NOT $2 = false
    // 只有 $2 = true 時，$3 才有意義
    // p - $4 預設是 null ，也就是不篩選，如果不是預設的話，就會去比較看 $4 符合 email 或 name 那一筆資料
    const sql = `
        SELECT COUNT(*)::int AS total
        FROM users u
        WHERE ($1::boolean OR u.is_active = TRUE)
          AND (NOT $2::boolean OR u.twofa_enabled = $3::boolean)
          AND (
            $4::text IS NULL
            OR u.email ILIKE '%' || $4 || '%'
            OR u.nickname ILIKE '%' || $4 || '%'
          )
    `;

    const result = await client.query<{ total: number }>(sql, [
        input.includeInactive,
        input.includeTwofaFilter,
        input.twofaEnabled,
        input.q,
    ]);

    return result.rows[0]?.total ?? 0;
};

export const findUsersByWhereSql = async (
    client: PoolClient,
    input: AdminUsersFilterInput,
    orderByColumn: 'created_at' | 'last_login_at' | 'email' | 'nickname',
    orderByDirection: 'ASC' | 'DESC',
    limit: number,
    offset: number,
): Promise<AdminUserListRow[]> => {
    // last 排在最後
    const sql = `
        SELECT
            u.id,
            u.email,
            u.nickname,
            u.is_active,
            u.last_login_at,
            u.twofa_enabled
        FROM users u
        WHERE ($1::boolean OR u.is_active = TRUE)
          AND (NOT $2::boolean OR u.twofa_enabled = $3::boolean)
          AND (
            $4::text IS NULL
            OR u.email ILIKE '%' || $4 || '%'
            OR u.nickname ILIKE '%' || $4 || '%'
          )
        ORDER BY
            CASE WHEN $5::text = 'created_at' AND $6::text = 'ASC' THEN u.created_at END ASC,
            CASE WHEN $5::text = 'created_at' AND $6::text = 'DESC' THEN u.created_at END DESC,
            CASE WHEN $5::text = 'last_login_at' AND $6::text = 'ASC' THEN u.last_login_at END ASC NULLS LAST,
            CASE WHEN $5::text = 'last_login_at' AND $6::text = 'DESC' THEN u.last_login_at END DESC NULLS LAST,
            CASE WHEN $5::text = 'email' AND $6::text = 'ASC' THEN u.email END ASC,
            CASE WHEN $5::text = 'email' AND $6::text = 'DESC' THEN u.email END DESC,
            CASE WHEN $5::text = 'nickname' AND $6::text = 'ASC' THEN u.nickname END ASC,
            CASE WHEN $5::text = 'nickname' AND $6::text = 'DESC' THEN u.nickname END DESC,
            CASE WHEN $6::text = 'ASC' THEN u.id END ASC,
            CASE WHEN $6::text = 'DESC' THEN u.id END DESC
        LIMIT $7 OFFSET $8
    `;

    const result = await client.query<AdminUserListRow>(sql, [
        input.includeInactive,
        input.includeTwofaFilter,
        input.twofaEnabled,
        input.q,
        orderByColumn,
        orderByDirection,
        limit,
        offset,
    ]);

    return result.rows;
};

export const findRolesByUserIds = async (
    client: PoolClient,
    userIds: number[],
): Promise<AdminUserRoleRow[]> => {
    if (!userIds.length) {
        return [];
    }

    const roleSql =
        'SELECT ur.user_id, r.type FROM user_role ur JOIN role r ON r.id = ur.role_id WHERE ur.user_id = ANY($1::int[])';

    const result = await client.query<AdminUserRoleRow>(roleSql, [userIds]);
    return result.rows;
};

export const checkUserExistsById = async (
    client: PoolClient,
    userId: number,
): Promise<boolean> => {
    const result = await client.query('SELECT 1 FROM users WHERE id = $1 LIMIT 1', [userId]);
    return (result.rowCount ?? 0) > 0;
};

export const findRoleTypesByUserId = async (
    client: PoolClient,
    userId: number,
): Promise<string[]> => {
    const sql =
        'SELECT r.type FROM user_role ur JOIN role r ON r.id = ur.role_id WHERE ur.user_id = $1 ORDER BY r.id ASC';
    const result = await client.query<AdminUserRoleTypeRow>(sql, [userId]);

    return result.rows.map((row) => row.type);
};

export const findRoleByType = async (
    client: PoolClient,
    roleType: string,
): Promise<AdminRoleLookupRow | null> => {
    const result = await client.query<AdminRoleLookupRow>(
        'SELECT id, type FROM role WHERE type = $1 LIMIT 1',
        [roleType],
    );

    if (result.rowCount === 0) {
        return null;
    }

    return result.rows[0];
};

export const checkUserRoleExists = async (
    client: PoolClient,
    userId: number,
    roleId: number,
): Promise<boolean> => {
    const result = await client.query(
        'SELECT 1 FROM user_role WHERE user_id = $1 AND role_id = $2 LIMIT 1',
        [userId, roleId],
    );

    return (result.rowCount ?? 0) > 0;
};

export const insertUserRoleByIds = async (
    client: PoolClient,
    userId: number,
    roleId: number,
): Promise<void> => {
    await client.query('INSERT INTO user_role(user_id, role_id) VALUES ($1, $2)', [userId, roleId]);
};

export const findUserById = async (targetId: number): Promise<AdminUserDetailRow | null> => {
    const sql = `SELECT
        u.id,
        u.email,
        u.nickname,
        u.phone,
        u.unit,
        u.job_title,
        u.is_active,
        u.avatar_key,
        u.updated_at,
        u.last_login_at,
        u.twofa_enabled,
        u.twofa_enabled_at,
        u.deleted_at,
        COALESCE(array_agg(r.type) FILTER (WHERE r.type IS NOT NULL), '{}') AS role
    FROM users u
    LEFT JOIN user_role ur ON ur.user_id = u.id
    LEFT JOIN role r ON r.id = ur.role_id
    WHERE u.id = $1
    GROUP BY u.id, u.email`;

    const result = await pool.query<AdminUserDetailRow>(sql, [targetId]);
    if (result.rowCount === 0) {
        return null;
    }

    return result.rows[0];
};

export const findActiveSessionsByUserId = async (targetId: number): Promise<AdminSessionRow[]> => {
    const sql =
        'SELECT id, last_seen_at, expires_at, user_agent, ip_address, device_info FROM session WHERE user_id = $1 AND revoked_at IS NULL ORDER BY last_seen_at DESC NULLS LAST, id DESC';

    const result = await pool.query<AdminSessionRow>(sql, [targetId]);
    return result.rows;
};

export const findActiveUserTwofaStateForUpdate = async (
    client: PoolClient,
    targetId: number,
): Promise<AdminUserTwofaStateRow | null> => {
    const sql =
        'SELECT twofa_backup_codes_version, twofa_enabled, twofa_enabled_at FROM users WHERE id = $1 AND is_active = TRUE FOR UPDATE';
    const result = await client.query<AdminUserTwofaStateRow>(sql, [targetId]);

    if (result.rowCount === 0) {
        return null;
    }

    return result.rows[0];
};

export const disableUserTwofaState = async (
    client: PoolClient,
    targetId: number,
): Promise<AdminUserTwofaStateRow | null> => {
    const sql =
        'UPDATE users SET twofa_enabled = FALSE, twofa_secret_encrypted = NULL, twofa_secret_iv = NULL, twofa_secret_auth_tag = NULL, twofa_enabled_at = NULL, twofa_backup_codes_version = 0 WHERE id = $1 AND is_active = TRUE RETURNING twofa_enabled, twofa_enabled_at, twofa_backup_codes_version';
    const result = await client.query<AdminUserTwofaStateRow>(sql, [targetId]);

    if (result.rowCount === 0) {
        return null;
    }

    return result.rows[0];
};

export const revokeBackupCodesByVersion = async (
    client: PoolClient,
    targetId: number,
    version: number,
): Promise<number> => {
    const result = await client.query(
        'UPDATE user_backup_codes SET revoked_at = now() WHERE user_id = $1 AND version = $2 AND revoked_at IS NULL',
        [targetId, version],
    );
    return result.rowCount ?? 0;
};

export const revokeAllBackupCodes = async (
    client: PoolClient,
    targetId: number,
): Promise<number> => {
    const result = await client.query(
        'UPDATE user_backup_codes SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [targetId],
    );
    return result.rowCount ?? 0;
};

export const revokeRefreshTokensByUserId = async (
    client: PoolClient,
    targetId: number,
): Promise<number> => {
    const result = await client.query(
        'UPDATE refresh_token SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [targetId],
    );
    return result.rowCount ?? 0;
};

export const revokeSessionsByUserId = async (
    client: PoolClient,
    targetId: number,
    reason: string,
): Promise<number> => {
    const result = await client.query(
        'UPDATE session SET revoked_at = now(), reason = $1 WHERE user_id = $2 AND revoked_at IS NULL',
        [reason, targetId],
    );
    return result.rowCount ?? 0;
};

export const findActiveUserForDeactivateForUpdate = async (
    client: PoolClient,
    targetId: number,
): Promise<AdminUserDeactivateStateRow | null> => {
    const sql =
        'SELECT is_active, deleted_at, twofa_enabled, twofa_enabled_at, twofa_backup_codes_version FROM users WHERE id = $1 AND is_active = TRUE FOR UPDATE';
    const result = await client.query<AdminUserDeactivateStateRow>(sql, [targetId]);

    if (result.rowCount === 0) {
        return null;
    }

    return result.rows[0];
};

export const softDeleteActiveUser = async (
    client: PoolClient,
    targetId: number,
): Promise<AdminUserDeactivateStateRow | null> => {
    const sql =
        'UPDATE users SET deleted_at = now(), is_active = FALSE, twofa_enabled = FALSE, twofa_secret_encrypted = NULL, twofa_secret_iv = NULL, twofa_secret_auth_tag = NULL, twofa_enabled_at = NULL, twofa_backup_codes_version = 0 WHERE id = $1 AND is_active = TRUE RETURNING is_active, deleted_at, twofa_enabled, twofa_enabled_at, twofa_backup_codes_version';
    const result = await client.query<AdminUserDeactivateStateRow>(sql, [targetId]);

    if (result.rowCount === 0) {
        return null;
    }

    return result.rows[0];
};

export const findInactiveUserForRestoreForUpdate = async (
    client: PoolClient,
    targetId: number,
): Promise<AdminUserRestoreStateRow | null> => {
    const sql =
        'SELECT is_active, deleted_at, twofa_enabled FROM users WHERE id = $1 AND is_active = FALSE FOR UPDATE';
    const result = await client.query<AdminUserRestoreStateRow>(sql, [targetId]);

    if (result.rowCount === 0) {
        return null;
    }

    return result.rows[0];
};

export const restoreInactiveUser = async (
    client: PoolClient,
    targetId: number,
): Promise<AdminUserRestoreStateRow | null> => {
    const sql =
        'UPDATE users SET is_active = TRUE, deleted_at = NULL WHERE id = $1 AND is_active = FALSE RETURNING is_active, deleted_at, twofa_enabled';
    const result = await client.query<AdminUserRestoreStateRow>(sql, [targetId]);

    if (result.rowCount === 0) {
        return null;
    }

    return result.rows[0];
};
