import { logger } from '../../lib/logger';
import { insertLinkLog } from '../../repositories/link/link-repository';

export interface LinkLogPayload {
    ip: string | null;
    ua: string | null;
    referer: string | null;
    path: string;
    at: string;
}

export const recordLinkLogService = async (
    linkId: string,
    logInfo: LinkLogPayload,
    info: string,
): Promise<void> => {
    try {
        await insertLinkLog(linkId, logInfo);
    } catch (err) {
        logger.warn('[linkLogService.recordLinkLog] 寫入失敗', { err, linkId, info });
    }
};
