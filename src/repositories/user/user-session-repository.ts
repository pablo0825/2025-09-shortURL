import { pool } from '../../db/pool';
import { withTransaction } from '../../db/transaction';

export interface SessionRow {
    id: number;
    last_seen_at: Date | null;
    expires_at: Date;
    user_agent: string | null;
    ip_address: string | null;
    device_info: string | null;
}

export interface RefreshTokenSessionRow {
    session_id: number;
    refresh_token_hash: string;
}

export const findActiveSessionsByUserId = async (userId: number): Promise<SessionRow[]> => {
    const result = await pool.query<SessionRow>(
        'SELECT id, last_seen_at, expires_at, user_agent, ip_address, device_info FROM session WHERE user_id = $1 AND revoked_at IS NULL ORDER BY last_seen_at DESC NULLS LAST, id DESC',
        [userId],
    );
    return result.rows;
};

export const findActiveRefreshTokenSessionsByUserId = async (
    userId: number,
): Promise<RefreshTokenSessionRow[]> => {
    const result = await pool.query<RefreshTokenSessionRow>(
        'SELECT refresh_token_hash, session_id FROM refresh_token WHERE user_id = $1 AND revoked_at IS NULL ORDER BY last_used_at DESC NULLS LAST, id DESC',
        [userId],
    );
    return result.rows;
};

export const revokeAllSessionsForUser = async (userId: number): Promise<number> => {
    const count = await withTransaction(async (client) => {
        await client.query(
            'UPDATE refresh_token SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
            [userId],
        );
        const result = await client.query<{ id: number }>(
            'UPDATE session SET revoked_at = now(), reason = $1 WHERE user_id = $2 AND revoked_at IS NULL RETURNING id',
            ['logout_all', userId],
        );
        return result.rowCount ?? 0;
    });

    return count;
};

export const revokeOneSessionForUser = async (
    userId: number,
    sessionId: number,
): Promise<{ revoked: boolean; tokenHashes: string[] }> => {
    return withTransaction(async (client) => {
        const tokenRows = await client.query<{ refresh_token_hash: string }>(
            'SELECT refresh_token_hash FROM refresh_token WHERE user_id = $1 AND session_id = $2',
            [userId, sessionId],
        );

        const sessionUpdate = await client.query(
            'UPDATE session SET revoked_at = now(), reason = $1 WHERE id = $2 AND user_id = $3 AND revoked_at IS NULL',
            ['logout_device', sessionId, userId],
        );

        if ((sessionUpdate.rowCount ?? 0) === 0) {
            return { revoked: false, tokenHashes: [] };
        }

        await client.query(
            'UPDATE refresh_token SET revoked_at = now() WHERE session_id = $1 AND user_id = $2 AND revoked_at IS NULL',
            [sessionId, userId],
        );

        return {
            revoked: true,
            tokenHashes: tokenRows.rows.map((row) => row.refresh_token_hash),
        };
    });
};
