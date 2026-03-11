import type { PoolClient } from 'pg';
import { pool } from '../../db/pool';
export { withTransaction } from '../../db/transaction';

export interface UserRegisterRow {
    id: number;
    email: string;
    nickname: string;
}

export interface LoginUserRow {
    id: number;
    email: string;
    password_hash: string;
    nickname: string;
    twofa_enabled: boolean;
}

export interface UserRoleRow {
    type: string;
}

export interface SessionRow {
    id: number;
}

export interface RefreshTokenRow {
    id: number;
    refresh_token_hash: string;
    session_id: number;
}

export interface ActiveUserRow {
    email: string;
    nickname: string;
}

export interface User2FaRow {
    id: number;
    email: string;
    nickname: string;
    twofa_enabled: boolean;
    twofa_backup_codes_version: number | null;
    twofa_secret_encrypted: Buffer | null;
    twofa_secret_iv: Buffer | null;
    twofa_secret_auth_tag: Buffer | null;
    role_type: string | null;
}

export interface UserByEmailRow {
    id: number;
    nickname: string;
}

export interface UserForResetRow {
    id: number;
    nickname: string;
    email: string;
    password_hash: string;
}

const queryWithClient = (client?: PoolClient): PoolClient | typeof pool => {
    return client ?? pool;
};

export const findRoleIdByType = async (
    type: string,
    client?: PoolClient,
): Promise<number | null> => {
    const db = queryWithClient(client);
    const result = await db.query<{ id: number }>('SELECT id FROM role WHERE type = $1', [type]);
    return result.rowCount ? result.rows[0].id : null;
};

export const insertUser = async (
    email: string,
    passwordHash: string,
    nickname: string,
    client?: PoolClient,
): Promise<UserRegisterRow> => {
    const db = queryWithClient(client);
    const result = await db.query<UserRegisterRow>(
        'INSERT INTO users(email, password_hash, nickname) VALUES ($1, $2, $3) RETURNING id, email, nickname',
        [email, passwordHash, nickname],
    );
    return result.rows[0];
};

export const insertUserRole = async (
    userId: number,
    roleId: number,
    client?: PoolClient,
): Promise<void> => {
    const db = queryWithClient(client);
    await db.query('INSERT INTO user_role(user_id, role_id) VALUES ($1, $2)', [userId, roleId]);
};

export const findActiveUserByEmail = async (email: string): Promise<LoginUserRow | null> => {
    const result = await pool.query<LoginUserRow>(
        'SELECT id, email, password_hash, nickname, twofa_enabled FROM users WHERE email = $1 AND is_active = TRUE',
        [email],
    );
    return result.rowCount ? result.rows[0] : null;
};

export const findRoleTypeByUserId = async (
    userId: number,
    client?: PoolClient,
): Promise<string | null> => {
    const db = queryWithClient(client);
    const result = await db.query<UserRoleRow>(
        'SELECT r.type FROM role r JOIN user_role ur ON r.id = ur.role_id WHERE ur.user_id = $1',
        [userId],
    );
    return result.rowCount ? result.rows[0].type : null;
};

export const insertSession = async (
    params: {
        userId: number;
        userAgent: string | null;
        userIp: string | undefined;
        lastUsedAt: Date;
        reason: string;
        expiresAt: Date;
        deviceInfoText: string;
    },
    client?: PoolClient,
): Promise<number> => {
    const db = queryWithClient(client);
    const result = await db.query<SessionRow>(
        'INSERT INTO session (user_id, user_agent, ip_address, last_seen_at, reason, expires_at, device_info) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [
            params.userId,
            params.userAgent,
            params.userIp,
            params.lastUsedAt,
            params.reason,
            params.expiresAt,
            params.deviceInfoText,
        ],
    );
    if (!result.rowCount) {
        throw new Error('建立 session 失敗');
    }
    return result.rows[0].id;
};

export const insertRefreshToken = async (
    params: {
        userId: number;
        jti: string;
        refreshTokenHash: string;
        userAgent: string | null;
        userIp: string | undefined;
        expiresAt: Date;
        deviceInfoText: string;
        lastUsedAt: Date;
        sessionId: number;
    },
    client?: PoolClient,
): Promise<void> => {
    const db = queryWithClient(client);
    await db.query(
        'INSERT INTO refresh_token (user_id, refresh_token_hash, user_agent, ip_address, expires_at, device_info, last_used_at, session_id, jti) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [
            params.userId,
            params.refreshTokenHash,
            params.userAgent,
            params.userIp,
            params.expiresAt,
            params.deviceInfoText,
            params.lastUsedAt,
            params.sessionId,
            params.jti,
        ],
    );
};

export const findActiveRefreshTokenByJti = async (
    jti: string,
    client?: PoolClient,
): Promise<RefreshTokenRow | null> => {
    const db = queryWithClient(client);
    const result = await db.query<RefreshTokenRow>(
        'SELECT id, refresh_token_hash, session_id FROM refresh_token WHERE jti = $1 AND expires_at > now() AND revoked_at IS NULL LIMIT 1',
        [jti],
    );
    return result.rowCount ? result.rows[0] : null;
};

export const updateUserLastLoginAt = async (
    userId: number,
    at: Date,
    client?: PoolClient,
): Promise<void> => {
    const db = queryWithClient(client);
    await db.query('UPDATE users SET last_login_at = $1 WHERE id = $2', [at, userId]);
};

export const findActiveRefreshTokensByUserId = async (
    userId: number,
    limit: number,
    client?: PoolClient,
): Promise<RefreshTokenRow[]> => {
    const db = queryWithClient(client);
    const result = await db.query<RefreshTokenRow>(
        'SELECT id, refresh_token_hash, session_id FROM refresh_token WHERE user_id = $1 AND expires_at > now() AND revoked_at IS NULL LIMIT $2',
        [userId, limit],
    );
    return result.rows;
};

export const revokeRefreshTokenById = async (
    tokenId: number,
    client?: PoolClient,
): Promise<void> => {
    const db = queryWithClient(client);
    await db.query('UPDATE refresh_token SET revoked_at = now() WHERE id = $1', [tokenId]);
};

export const findActiveUserById = async (
    userId: number,
    client?: PoolClient,
): Promise<ActiveUserRow | null> => {
    const db = queryWithClient(client);
    const result = await db.query<ActiveUserRow>(
        'SELECT email, nickname FROM users WHERE id = $1 AND is_active = TRUE',
        [userId],
    );
    return result.rowCount ? result.rows[0] : null;
};

export const updateSessionFromRefresh = async (
    params: {
        sessionId: number;
        lastUsedAt: Date;
        userAgent: string | null;
        userIp: string | undefined;
        expiresAt: Date;
        deviceInfoText: string;
    },
    client?: PoolClient,
): Promise<number | null> => {
    const db = queryWithClient(client);
    const result = await db.query<SessionRow>(
        'UPDATE session SET last_seen_at = $1, user_agent = $2, ip_address = $3, expires_at = $4, device_info = $5 WHERE id = $6 RETURNING id',
        [
            params.lastUsedAt,
            params.userAgent,
            params.userIp,
            params.expiresAt,
            params.deviceInfoText,
            params.sessionId,
        ],
    );
    return result.rowCount ? result.rows[0].id : null;
};

export const revokeSessionById = async (
    sessionId: number,
    reason: string,
    client?: PoolClient,
): Promise<void> => {
    const db = queryWithClient(client);
    await db.query(
        'UPDATE session SET revoked_at = now(), reason = $1 WHERE id = $2 AND revoked_at IS NULL',
        [reason, sessionId],
    );
};

export const findUser2FaById = async (
    userId: number,
    client?: PoolClient,
): Promise<User2FaRow | null> => {
    const db = queryWithClient(client);
    const result = await db.query<User2FaRow>(
        `SELECT
      u.id,
      u.email,
      u.nickname,
      u.twofa_enabled,
      u.twofa_backup_codes_version,
      u.twofa_secret_encrypted,
      u.twofa_secret_iv,
      u.twofa_secret_auth_tag,
      r.type AS role_type
    FROM users u
    LEFT JOIN user_role ur ON ur.user_id = u.id
    LEFT JOIN role r ON r.id = ur.role_id
    WHERE u.id = $1 AND u.is_active = TRUE
    LIMIT 1`,
        [userId],
    );
    return result.rowCount ? result.rows[0] : null;
};

export const findAvailableBackupCodeHashes = async (
    userId: number,
    version: number,
    client?: PoolClient,
): Promise<string[]> => {
    const db = queryWithClient(client);
    const result = await db.query<{ code_hash: string }>(
        'SELECT code_hash FROM user_backup_codes WHERE user_id = $1 AND version = $2 AND used_at IS NULL',
        [userId, version],
    );
    return result.rows.map((row) => row.code_hash);
};

export const consumeBackupCode = async (
    params: {
        userId: number;
        codeHash: string;
        userIp: string | undefined;
        userAgent: string | null;
        sessionId: number;
    },
    client?: PoolClient,
): Promise<boolean> => {
    const db = queryWithClient(client);
    const result = await db.query(
        `UPDATE user_backup_codes
     SET used_at = NOW(), used_by_ip = $1, used_by_user_agent = $2, used_by_session_id = $3
     WHERE user_id = $4 AND code_hash = $5 AND used_at IS NULL`,
        [params.userIp, params.userAgent, params.sessionId, params.userId, params.codeHash],
    );
    return (result.rowCount ?? 0) > 0;
};

export const findUserByEmail = async (
    email: string,
    client?: PoolClient,
): Promise<UserByEmailRow | null> => {
    const db = queryWithClient(client);
    const result = await db.query<UserByEmailRow>(
        'SELECT id, nickname FROM users WHERE email = $1',
        [email],
    );
    return result.rowCount ? result.rows[0] : null;
};

export const countRecentUserAction = async (
    userId: number,
    action: string,
    intervalMinutes: number,
    client?: PoolClient,
): Promise<number> => {
    const db = queryWithClient(client);
    const result = await db.query<{ count: string }>(
        `SELECT COUNT(*) AS count
     FROM user_log
     WHERE action = $1
       AND user_id = $2
       AND created_at > now() - ($3::text || ' minutes')::interval`,
        [action, userId, intervalMinutes],
    );
    return Number(result.rows[0]?.count ?? 0);
};

export const updateResetPasswordToken = async (
    userId: number,
    tokenHash: string,
    expiresAt: Date,
    client?: PoolClient,
): Promise<void> => {
    const db = queryWithClient(client);
    await db.query(
        'UPDATE users SET reset_password_token = $1, reset_password_expires_at = $2 WHERE id = $3',
        [tokenHash, expiresAt, userId],
    );
};

export const findUserForPasswordReset = async (
    tokenHash: string,
    client?: PoolClient,
): Promise<UserForResetRow | null> => {
    const db = queryWithClient(client);
    const result = await db.query<UserForResetRow>(
        `SELECT id, nickname, email, password_hash
     FROM users
     WHERE reset_password_token = $1
       AND reset_password_expires_at > now()
     LIMIT 1
     FOR UPDATE`,
        [tokenHash],
    );
    return result.rowCount ? result.rows[0] : null;
};

export const updateUserPasswordAfterReset = async (
    userId: number,
    newPasswordHash: string,
    client?: PoolClient,
): Promise<void> => {
    const db = queryWithClient(client);
    await db.query(
        'UPDATE users SET password_hash = $1, last_password_reset_at = now(), reset_password_token = NULL, reset_password_expires_at = NULL WHERE id = $2',
        [newPasswordHash, userId],
    );
};

export const revokeAllRefreshTokensByUserId = async (
    userId: number,
    client?: PoolClient,
): Promise<void> => {
    const db = queryWithClient(client);
    await db.query(
        'UPDATE refresh_token SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
    );
};
