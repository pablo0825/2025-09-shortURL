import { pool } from '../../db/pool';

export interface DailyUserCountRow {
    date: string;
    count: number;
}

export interface LinkStatusSummaryRow {
    total_links: number;
    active_links: number;
    expired_links: number;
    disabled_links: number;
    deleted_links: number;
}

export interface TwoFaStatsRow {
    active_users: number;
    twofa_users: number;
}

export interface DailyClickCountRow {
    date: string;
    clicks: number;
}

export interface ClickCountByValueRow<TValue extends string> {
    value: TValue;
    clicks: number;
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

export const getLinkStatusSummary = async (): Promise<LinkStatusSummaryRow> => {
    const sql = `
        SELECT
            COUNT(*)::INT AS total_links,
            COUNT(*) FILTER (
                WHERE l.deleted_at IS NULL
                  AND l.is_active = TRUE
                  AND l.expire_at > now()
            )::INT AS active_links,
            COUNT(*) FILTER (
                WHERE l.deleted_at IS NULL
                  AND l.expire_at <= now()
            )::INT AS expired_links,
            COUNT(*) FILTER (
                WHERE l.deleted_at IS NULL
                  AND l.is_active = FALSE
                  AND l.expire_at > now()
            )::INT AS disabled_links,
            COUNT(*) FILTER (
                WHERE l.deleted_at IS NOT NULL
            )::INT AS deleted_links
        FROM links l
    `;

    const result = await pool.query<LinkStatusSummaryRow>(sql);
    return result.rows[0] ?? {
        total_links: 0,
        active_links: 0,
        expired_links: 0,
        disabled_links: 0,
        deleted_links: 0,
    };
};

export const getNewLinksCount = async (startAt: string, endAt: string): Promise<number> => {
    const sql = `
        SELECT COUNT(*)::INT AS count
        FROM links l
        WHERE l.created_at >= $1
          AND l.created_at < $2
    `;

    const result = await pool.query<{ count: number }>(sql, [startAt, endAt]);
    return result.rows[0]?.count ?? 0;
};

export const getDailyClicks = async (startAt: string, endAt: string): Promise<DailyClickCountRow[]> => {
    const sql = `
        SELECT
            TO_CHAR(DATE_TRUNC('day', e.clicked_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
            COUNT(*)::INT AS clicks
        FROM link_click_events e
        WHERE e.clicked_at >= $1
          AND e.clicked_at < $2
        GROUP BY 1
        ORDER BY 1 ASC
    `;

    const result = await pool.query<DailyClickCountRow>(sql, [startAt, endAt]);
    return result.rows;
};

export const getTopReferers = async (
    startAt: string,
    endAt: string,
): Promise<Array<ClickCountByValueRow<string>>> => {
    const sql = `
        SELECT
            LOWER(
                SPLIT_PART(
                    REGEXP_REPLACE(e.referer, '^[a-zA-Z]+://', ''),
                    '/',
                    1
                )
            ) AS value,
            COUNT(*)::INT AS clicks
        FROM link_click_events e
        WHERE e.clicked_at >= $1
          AND e.clicked_at < $2
          AND e.referer IS NOT NULL
          AND BTRIM(e.referer) <> ''
        GROUP BY 1
        ORDER BY clicks DESC, value ASC
        LIMIT 10
    `;

    const result = await pool.query<ClickCountByValueRow<string>>(sql, [startAt, endAt]);
    return result.rows.filter((row) => row.value.length > 0);
};

export const getClicksByDeviceType = async (
    startAt: string,
    endAt: string,
): Promise<Array<ClickCountByValueRow<'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown'>>> => {
    const sql = `
        SELECT
            e.device_type AS value,
            COUNT(*)::INT AS clicks
        FROM link_click_events e
        WHERE e.clicked_at >= $1
          AND e.clicked_at < $2
          AND e.device_type IS NOT NULL
        GROUP BY 1
        ORDER BY clicks DESC, value ASC
    `;

    const result = await pool.query<ClickCountByValueRow<'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown'>>(
        sql,
        [startAt, endAt],
    );
    return result.rows;
};

export const getClicksByCountry = async (
    startAt: string,
    endAt: string,
): Promise<Array<ClickCountByValueRow<string>>> => {
    const sql = `
        SELECT
            e.country_code AS value,
            COUNT(*)::INT AS clicks
        FROM link_click_events e
        WHERE e.clicked_at >= $1
          AND e.clicked_at < $2
          AND e.country_code IS NOT NULL
        GROUP BY 1
        ORDER BY clicks DESC, value ASC
        LIMIT 10
    `;

    const result = await pool.query<ClickCountByValueRow<string>>(sql, [startAt, endAt]);
    return result.rows;
};
