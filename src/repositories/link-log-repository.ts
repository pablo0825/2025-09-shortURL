import { pool } from '../db/pool';

export interface LinkLogInfo {
    ip: string | null;
    ua: string | null;
    referer: string | null;
    path: string;
    at: string;
}

export const insertLinkLog = async (linkId: string, logInfo: LinkLogInfo): Promise<void> => {
    await pool.query(
        'INSERT INTO link_logs (link_id, log_info) VALUES ($1::BIGINT, $2::JSONB)',
        [linkId, logInfo],
    );
};

