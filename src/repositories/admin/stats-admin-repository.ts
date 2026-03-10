import { pool } from '../../db/pool';

export interface DailyUserCountRow {
    date: string;
    count: number;
}

export interface TwoFaStatsRow {
    active_users: number;
    twofa_users: number;
}

export const getDailyActiveUsers = async (
    startAt: string,
    endAt: string,
): Promise<DailyUserCountRow[]> => {
    const sql = `
        SELECT
            TO_CHAR(DATE_TRUNC('day', s.last_seen_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
            COUNT(DISTINCT s.user_id)::INT AS count
        FROM session s
        WHERE s.last_seen_at >= $1
          AND s.last_seen_at < $2
        GROUP BY 1
        ORDER BY 1 ASC
    `;

    const result = await pool.query<DailyUserCountRow>(sql, [startAt, endAt]);
    return result.rows;
};

export const getDailyNewUsers = async (
    startAt: string,
    endAt: string,
): Promise<DailyUserCountRow[]> => {
    const sql = `
        SELECT
            TO_CHAR(DATE_TRUNC('day', u.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
            COUNT(*)::INT AS count
        FROM users u
        WHERE u.created_at >= $1
          AND u.created_at < $2
        GROUP BY 1
        ORDER BY 1 ASC
    `;

    const result = await pool.query<DailyUserCountRow>(sql, [startAt, endAt]);
    return result.rows;
};

export const getDailyLinkCreators = async (
    startAt: string,
    endAt: string,
): Promise<DailyUserCountRow[]> => {
    const sql = `
        SELECT
            TO_CHAR(DATE_TRUNC('day', l.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
            COUNT(DISTINCT l.creator_user_id)::INT AS count
        FROM links l
        WHERE l.created_at >= $1
          AND l.created_at < $2
          AND l.creator_user_id IS NOT NULL
        GROUP BY 1
        ORDER BY 1 ASC
    `;

    const result = await pool.query<DailyUserCountRow>(sql, [startAt, endAt]);
    return result.rows;
};

export const getWeeklyActiveUsers = async (startAt: string, endAt: string): Promise<number> => {
    const sql = `
        SELECT COUNT(DISTINCT s.user_id)::INT AS count
        FROM session s
        WHERE s.last_seen_at >= $1
          AND s.last_seen_at < $2
    `;

    const result = await pool.query<{ count: number }>(sql, [startAt, endAt]);
    return result.rows[0]?.count ?? 0;
};

export const getActiveUsersTwoFaStats = async (): Promise<TwoFaStatsRow> => {
    const sql = `
        SELECT
            COUNT(*)::INT AS active_users,
            COUNT(*) FILTER (WHERE u.twofa_enabled = TRUE)::INT AS twofa_users
        FROM users u
        WHERE u.is_active = TRUE
          AND u.deleted_at IS NULL
    `;

    const result = await pool.query<TwoFaStatsRow>(sql);
    return result.rows[0] ?? { active_users: 0, twofa_users: 0 };
};

export const getWeeklyDeactivatedUsers = async (startAt: string, endAt: string): Promise<number> => {
    const sql = `
        SELECT COUNT(DISTINCT a.target_id)::INT AS count
        FROM admin_audit_logs a
        WHERE a.target_type = 'user'
          AND a.action IN ('soft_delete_user')
          AND a.created_at >= $1
          AND a.created_at < $2
    `;

    const result = await pool.query<{ count: number }>(sql, [startAt, endAt]);
    return result.rows[0]?.count ?? 0;
};
