import { Request } from 'express';
import { logger } from '../lib/logger';
import { insertLinkLog } from '../repositories/link-log-repository';

export function writeLogToDB(req: Request, id: string, info: string): void {
    const log = {
        ip: req.ip ?? null,
        ua: req.get('user-agent') ?? null, // 判斷使用者的瀏覽器、作業系統
        referer: req.get('referer') ?? null, // 判斷使用者從哪裡來
        path: req.originalUrl,
        at: new Date().toISOString(),
    };

    insertLinkLog(id, log).catch((err: unknown) => {
        logger.warn('[writeLogToDB] 寫入失敗', { err, id, info });
    });
}
