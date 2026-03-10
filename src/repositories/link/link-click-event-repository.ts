import { pool } from '../../db/pool';
import type { DeviceType } from '../../lib/device-type';

export interface InsertLinkClickEventInput {
    linkId: string;
    clickedAt: string;
    visitorIp: string | null;
    referer: string | null;
    userAgent: string | null;
    deviceType: DeviceType;
    countryCode: string | null;
}

export const insertLinkClickEvent = async (input: InsertLinkClickEventInput): Promise<void> => {
    await pool.query(
        `INSERT INTO link_click_events
            (link_id, clicked_at, visitor_ip, referer, user_agent, device_type, country_code)
         VALUES ($1::BIGINT, $2::TIMESTAMPTZ, $3::INET, $4, $5, $6, $7)`,
        [
            input.linkId,
            input.clickedAt,
            input.visitorIp,
            input.referer,
            input.userAgent,
            input.deviceType,
            input.countryCode,
        ],
    );
};
