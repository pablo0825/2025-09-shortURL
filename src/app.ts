import express, { type Request, type Response, type Router } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import { pool } from './db/pool';
import { redirectToLongUrl } from './controllers/link-controllers';
import { errorHandler, notFoundHandler } from './middlewares/error/error-handler';
import { cacheShortUrl } from './middlewares/redirect/cache-short-url';
import { logger } from './lib/logger';

interface AppRouters {
  authRouter: Router;
  linkRouter: Router;
  userRouter: Router;
}

const getAllowedOrigins = (): string[] => {
  const origins = process.env.CORS_ORIGINS ?? '';
  return origins
    .split(',')
    .map((origin: string): string => origin.trim())
    .filter((origin: string): boolean => origin.length > 0);
};

const attachCors = (app: ReturnType<typeof express>): void => {
  const allowOrigins = getAllowedOrigins();

  app.use((req: Request, res: Response, next): void => {
    const origin = req.headers.origin;
    const isAllowedOrigin =
      !origin || allowOrigins.length === 0 || allowOrigins.includes(origin);

    if (!isAllowedOrigin) {
      res.status(403).json({
        ok: false,
        error: 'CORS origin not allowed',
      });
      return;
    }

    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    );
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    );

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }

    next();
  });
};

export const buildApp = (routers: AppRouters): ReturnType<typeof express> => {
  const app = express();

  app.use(helmet());
  app.use(express.json());
  app.use(cookieParser());
  attachCors(app);

  app.use('/static', express.static(path.join(process.cwd(), 'uploads')));

  app.get('/health', async (_req: Request, res: Response) => {
    try {
      await pool.query('SELECT 1');
      res.status(200).json({
        ok: true,
        db: '連接成功',
        uptime: process.uptime(),
      });
    } catch (err) {
      logger.error('[health] DB connect error', err);
      res.status(500).json({
        ok: false,
        error: '資料庫沒有連接到',
      });
    }
  });

  app.use('/api/link', routers.linkRouter);
  app.use('/api/auth', routers.authRouter);
  app.use('/api/user', routers.userRouter);

  app.get('/:code', cacheShortUrl, redirectToLongUrl);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
