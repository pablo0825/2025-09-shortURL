import type { NextFunction, Request, Response } from 'express';
import { logger } from '../../lib/logger';
import { isAppError } from '../../utils/app-error';

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

    const rawMessage = err instanceof Error ? err.message : 'Internal Server Error';
    // replace(搜尋條件, 替換內容)
    // 所以這邊的意思是，找出符合正規表達式的字串，並替換成空字串
    // 清理上下文標記，如：[userService.create] something went wrong
    // 變成：something went wrong
    const message = rawMessage.replace(/^(\[[^\]]+]\s*)+/, '');
    const statusCode = isAppError(err) ? err.statusCode : 500;

    res.status(statusCode).json({
        ok: false,
        error: message,
    });
};
