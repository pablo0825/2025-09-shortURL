import type { PoolClient } from 'pg';
import { pool } from '../../db/pool';

export const getUserAuthById = async (userId: number) => {
    const result = await pool.query<{
        email: string;
        password_hash: string;
        nickname: string;
    }>('SELECT email, password_hash, nickname FROM users WHERE id = $1 AND is_active = TRUE', [
        userId,
    ]);

    if (result.rowCount === 0) {
        return null;
    }

    return {
        email: result.rows[0].email,
        passwordHash: result.rows[0].password_hash,
        nickname: result.rows[0].nickname,
    };
};

export const updatePasswordWithCheck = async (
    client: PoolClient,
    userId: number,
    oldHash: string,
    newHash: string,
) => {
    const result = await client.query(
        'UPDATE users SET password_hash = $1, last_password_reset_at = now() WHERE id = $2 AND password_hash = $3 AND is_active = TRUE',
        [newHash, userId, oldHash],
    );

    const count: number = result.rowCount ?? 0;
    return count > 0;
};

export const revokeRefreshTokens = async (client: PoolClient, userId: number) => {
    await client.query(
        'UPDATE refresh_token SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
    );
};

export const revokeSessions = async (client: PoolClient, userId: number) => {
    await client.query(
        'UPDATE session SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
    );
};
