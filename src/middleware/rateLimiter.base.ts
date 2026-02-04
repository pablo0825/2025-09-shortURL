import type { Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import redis from "../redis/redisClient";

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
        windowMs: options.windowMs,
        max: options.max,

        // 使用 redis store
        store: new RedisStore({
            sendCommand: (...args: string[]) => redis.sendCommand(args),
            prefix: options.prefix,
        }),

        // 如果有 email，用 IP+email 當 key；否則只用 IP
        keyGenerator(req: Request): string {
            const email = req.body?.email || "";
            const rawIp: string = req.ip ?? req.socket.remoteAddress ?? "unknown";
            const ipKey: string = ipKeyGenerator(rawIp);

            return email ? `${ipKey}:${email}` : ipKey;
        },

        // 是否跳過成功請求
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
