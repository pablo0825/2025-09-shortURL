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
  if (res.headersSent) {
    next(err);
    return;
  }

  logger.error('[errorHandler] request failed', {
    err,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
  });

  const message = err instanceof Error ? err.message : 'Internal Server Error';
  res.status(500).json({
    ok: false,
    error: message,
  });
};
