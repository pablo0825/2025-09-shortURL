import type { NextFunction, Request, Response } from 'express';
import { logger } from '../../lib/logger';

export const notFoundHandler = (_req: Request, res: Response): void => {
    res.status(404).json({
        ok: false,
        error: 'Not Found',
    });
};

export const errorHandler = (
        err: unknown,
        req: Request,
        res: Response,
        next: NextFunction,
): void => {
    // 檢查回應是否送出
    if (res.headersSent) {
        next(err);
        return;
    }

    // 紀錄錯誤資訊
    logger.error('[errorHandler] request failed', {
        err,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
    });

    // error 真的是 error 物件，就用  err.message
    const message = err instanceof Error ? err.message : 'Internal Server Error';

    res.status(500).json({
        ok: false,
        error: message,
    });
};
