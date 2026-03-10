import { logger } from '../../lib/logger';
import { parseDeviceType } from '../../lib/device-type';
import { fetchCountryCode } from '../../lib/geo-ip';
import { insertLinkClickEvent } from '../../repositories/link/link-click-event-repository';

export interface LinkClickPayload {
    ip: string | null;
    ua: string | null;
    referer: string | null;
    clickedAt: string;
}

export const recordLinkClickService = async (
    linkId: string,
    payload: LinkClickPayload,
): Promise<void> => {
    try {
        const [countryCode, deviceType] = await Promise.all([
            fetchCountryCode(payload.ip),
            Promise.resolve(parseDeviceType(payload.ua)),
        ]);

        await insertLinkClickEvent({
            linkId,
            clickedAt: payload.clickedAt,
            visitorIp: payload.ip,
            referer: payload.referer,
            userAgent: payload.ua,
            deviceType,
            countryCode,
        });
    } catch (err) {
        logger.warn('[linkClickService.recordLinkClick] 寫入失敗', { err, linkId });
    }
};
