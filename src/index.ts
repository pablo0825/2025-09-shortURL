import 'dotenv/config';
import { Server } from 'http';
import { buildApp } from './app';
import { pool } from './db/pool';
import { initRedis, redisClient } from './lib/redis-client';
import { loadRbacFromDb } from './rbac/load-rbac-from-db';
import { verifyEmailConnection } from './lib/email';
import { initRedisRateLimiter } from './middlewares/rate-limit/rate-limiter';
import { logger } from './lib/logger';

const port = Number(process.env.PORT ?? 3001);

let server: Server;

async function bootstrap(): Promise<void> {
  try {
    logger.info('[1/4] 檢查資料庫連線...');
    // select now() 跟資料庫拿目前時間
    await pool.query('SELECT NOW()');
    logger.info('資料庫連線成功');

    logger.info('[2/4] 初始化 Redis...');
    await initRedis();
    initRedisRateLimiter();
    logger.info('RateLimiters 初始化完成');

    // 動態匯入
      // 執行到這行，才開始載入 route
      // 概念上跟這個相同，如：import { linkRouter } from './routes/link-route';
      // 但這個是靜態載入，在程式啟動時就會載入
    const { linkRouter } = await import('./routes/link-route');
    const { authRouter } = await import('./routes/auth-route');
    const { userRouter } = await import('./routes/user-route');

    logger.info('[3/4] 載入 RBAC 權限...');
    await loadRbacFromDb();

    logger.info('[4/4] 檢查 SMTP 連線...');
    await verifyEmailConnection();

    const app = buildApp({
      linkRouter,
      authRouter,
      userRouter,
    });

    server = app.listen(port, () => {
      logger.info(`Server is running on http://localhost:${port}`);
    });
  } catch (err) {
    logger.error('啟動失敗', err);
    process.exit(1);
  }
}

bootstrap().catch((err: unknown) => {
  logger.error('未預期的啟動錯誤', err);
  process.exit(1);
});

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`收到 ${signal} 信號，正在關閉伺服器...`);

  const shutdownTimeout = setTimeout(() => {
    logger.error('關閉超時（3秒），強制退出');
    process.exit(1);
  }, 3000);

  try {
    if (server) {
      logger.info('正在關閉 HTTP Server...');
      await new Promise<void>((resolve, reject) => {
        server.close((err?: Error) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
      logger.info('HTTP Server 已關閉');
    }

    if (redisClient.isOpen) {
      await redisClient.quit();
      logger.info('Redis 已關閉');
    }

    await pool.end();
    logger.info('資料庫連線已關閉');

    clearTimeout(shutdownTimeout);
    process.exit(0);
  } catch (err) {
    logger.error('關閉時發生錯誤', err);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});
