import type { Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { cacheSendCommand } from '../../lib/cache';

type RedisData = boolean | number | string;
type RedisReplyLike = RedisData | RedisData[];

export interface RateLimitOptions {
    windowMs: number; // 時間窗口（毫秒）
    max: number; // 最大請求數
    prefix: string; // Redis key 前綴
    message?: string; // 錯誤訊息
    skipSuccessfulRequests?: boolean; // 是否跳過成功請求
}

// 建立 rate limiter 的工廠函式
export function createRedisRateLimiter(options: RateLimitOptions) {
    return rateLimit({
        windowMs: options.windowMs, // 每次請求要等多久
        max: options.max,

        // 使用 redis store(儲存)
        store: new RedisStore({
            // 發送指令
            // args 是 redisStore 內部呼叫傳進來的
            // args 是不定參數，代表 redis 的指令與參數，如：['EXPIRE', 'key', '60']
            sendCommand: (...args: string[]) => cacheSendCommand(args) as Promise<RedisReplyLike>,
            prefix: options.prefix, // 設定 redis key 前綴，區分不同資料，如：rl:forgot-password:, rl:login:等等
        }),

        // 如果有 email，用 IP+email 當 key；否則只用 IP
        keyGenerator(req: Request): string {
            const email = req.body?.email || '';
            const rawIp: string = req.ip ?? req.socket.remoteAddress ?? 'unknown';
            const ipKey: string = ipKeyGenerator(rawIp);

            return email ? `${ipKey}:${email}` : ipKey;
        },

        // 預設是 false ，也就是成功請求也要算次數
        skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,

        // 錯誤回應
        handler: (_req: Request, res: Response) => {
            const minutes = Math.ceil(options.windowMs / 60000);

            res.status(429).json({
                ok: false,
                error: options.message || `請求過於頻繁，請 ${minutes} 分鐘後再試`,
                retryAfter: Math.ceil(options.windowMs / 1000), // 秒數
            });
        },

        // 標準化 headers
        standardHeaders: true, // 使用 RateLimit-* headers
        legacyHeaders: false, // 不使用舊版 http 限制標頭
    });
}
