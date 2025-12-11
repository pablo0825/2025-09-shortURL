// rateLimiter.ts
import e, { Request, Response } from 'express';
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import redis from "../redis/redisClient";

interface RateLimitOptions {
    windowMs: number; // 時間窗口 (毫秒)
    max: number; // 最大請求數
    prefix:string; // Redis key 前輟
    message?:string; // 自訂錯誤訊息
    skipSuccessfulRequests?: boolean; // 是否跳過成功的請求
}

// 建立rate limiter的工廠函數
function createRedisRateLimiter (options: RateLimitOptions) {
    return rateLimit({
        windowMs: options.windowMs,
        max: options.max,

        // 使用 redis store
        store: new RedisStore({
            sendCommand: (...args: string[]) => redis.sendCommand(args),
            prefix: options.prefix,
        }),

        // 自訂 key 生成邏輯
        keyGenerator(req: e.Request):string {
            const email = req.body?.email || '';
            const ip = req.ip || req.socket.remoteAddress || 'unknown';

            return email ? `${ip}:${email}` : ip
        },

        // 是否跳過成功的請求
        skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,

        // 自訂錯誤處理
        handler: (_req: e.Request, res: e.Response) => {
            const minutes = Math.ceil(options.windowMs / 60000);

            res.status(429).json({
                ok: false,
                error: options.message || `請求過於頻繁，請 ${minutes} 分鐘後再試`,
                retryAfter: Math.ceil(options.windowMs / 1000), // 秒數
            })
        },

        // 標準化 headers
        standardHeaders: true,  // 使用 RateLimit-* headers
        legacyHeaders: false, // 停用傳統的http速率限制標頭
    })
}

// 忘記密碼 - 嚴格限制 (5分鐘最多3次)
export const forgotPasswordLimiter = createRedisRateLimiter({
   windowMs: 5 * 60 * 1000,
    max: 3,
    prefix: 'rl:forgot-password:',
    message: '密碼重設請求過於頻繁，請 5 分鐘後再試',
});

// 登入 - 中等限制（15分鐘內最多5次失敗）
export const loginLimiter = createRedisRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    prefix: 'rl:login:',
    message: '登入嘗試次數過多，請 15 分鐘後再試',
    skipSuccessfulRequests: true, // 登入成功不計入限制
});

// 註冊 - 嚴格限制（1小時內最多3次）
export const registerLimiter = createRedisRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 3,
    prefix: 'rl:register:',
    message: '註冊次數過多，請 1 小時後再試',
});

// 驗證碼發送 - 嚴格限制（1分鐘內最多1次）
export const sendVerificationLimiter = createRedisRateLimiter({
    windowMs: 60 * 1000,
    max: 1,
    prefix: 'rl:verification:',
    message: '驗證碼發送過於頻繁，請 1 分鐘後再試',
});

// 一般 API - 寬鬆限制（15分鐘內最多100次）
export const generalApiLimiter = createRedisRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 100,
    prefix: 'rl:api:',
    message: '請求過於頻繁，請稍後再試',
});

// 重設密碼 - 中等限制（15分鐘內最多5次失敗）
export const resetPasswordLimiter = createRedisRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    prefix: 'rl:reset-password:',
    message: '登入嘗試次數過多，請 15 分鐘後再試',
    skipSuccessfulRequests: true, // 登入成功不計入限制
})