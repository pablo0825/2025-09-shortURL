// rateLimiter.ts
import type { Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import redis from "../redis/redisClient";

interface RateLimitOptions {
    windowMs: number; // 時間窗口 (毫秒)
    max: number; // 最大請求數
    prefix:string; // Redis key 前輟
    message?:string; // 自訂錯誤訊息
    skipSuccessfulRequests?: boolean; // 是否跳過成功的請求
}

// ReturnType的作用是提取泛型參數T，也就是rateLimit函式會回傳的值
let forgotPasswordLimiter: ReturnType<typeof rateLimit> | null = null;
let loginLimiter: ReturnType<typeof rateLimit> | null = null;
let registerLimiter: ReturnType<typeof rateLimit> | null = null;
let sendVerificationLimiter: ReturnType<typeof rateLimit> | null = null;
let generalApiLimiter: ReturnType<typeof rateLimit> | null = null;
let resetPasswordLimiter: ReturnType<typeof rateLimit> | null = null;
let createLinkLimiter:ReturnType<typeof rateLimit> | null = null;
let updateAvatarLimiter: ReturnType<typeof rateLimit> | null = null;

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

        // [標註] 這邊有一個問題，就是如果email不同的話，那createLink的reatLimiter就沒有了，之後再來解決
        // 自訂 key 生成邏輯
        keyGenerator(req: Request):string {
            const email = req.body?.email || '';
            const rawIp:string = req.ip ?? req.socket.remoteAddress ?? "unknown";
            const ipKey:string = ipKeyGenerator(rawIp);

            return email ? `${ipKey}:${email}` : ipKey
        },

        // 是否跳過成功的請求
        skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,

        // 自訂錯誤處理
        handler: (_req: Request, res: Response) => {
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

// 在 Redis connect 完成後呼叫
export function initRedisRateLimiter():void {
    if (!redis.isOpen) {
        // 你也可以選擇不要 throw、改成 fallback MemoryStore
        throw new Error("Redis is not connected. Call initRedis() before initRateLimiters().");
    }

    // 忘記密碼 - 嚴格限制 (5分鐘最多3次)
    forgotPasswordLimiter = createRedisRateLimiter({
        windowMs: 5 * 60 * 1000,
        max: 3,
        prefix: "rl:forgot-password:",
        message: "密碼重設請求過於頻繁，請 5 分鐘後再試",
    });

    // 登入 - 中等限制（15分鐘內最多5次失敗）
    loginLimiter = createRedisRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 5,
        prefix: "rl:login:",
        message: "登入嘗試次數過多，請 15 分鐘後再試",
        skipSuccessfulRequests: true,
    });

    // 註冊 - 嚴格限制（1小時內最多3次）
    registerLimiter = createRedisRateLimiter({
        windowMs: 60 * 60 * 1000,
        max: 3,
        prefix: "rl:register:",
        message: "註冊次數過多，請 1 小時後再試",
    });

    // 驗證碼發送 - 嚴格限制（1分鐘內最多1次）
    sendVerificationLimiter = createRedisRateLimiter({
        windowMs: 60 * 1000,
        max: 1,
        prefix: "rl:verification:",
        message: "驗證碼發送過於頻繁，請 1 分鐘後再試",
    });

    // 一般 API - 寬鬆限制（15分鐘內最多100次）
    generalApiLimiter = createRedisRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 100,
        prefix: "rl:api:",
        message: "請求過於頻繁，請稍後再試",
    });

    // 重設密碼 - 中等限制（15分鐘內最多5次失敗）
    resetPasswordLimiter = createRedisRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 5,
        prefix: "rl:reset-password:",
        message: "重設密碼失敗次數過多，帳號已暫時鎖定 15 分鐘",
        skipSuccessfulRequests: true,
    });

    // 創建link - 相同ip一天只能創建100個link
    createLinkLimiter = createRedisRateLimiter({
        windowMs: 24 * 60 * 60 * 1000,
        max: 100,
        prefix: "rl:create-link:",
        message: "今日建立短網址已達上限（100 次），請明天再試",
    });

    // 上傳速度(圖片) - 1小時最多上傳10次
    updateAvatarLimiter = createRedisRateLimiter({
        windowMs: 60 * 60 * 1000,
        max: 10,
        prefix: "rl:update-avatar:",
        message: "上傳次數過多，請稍後再試（每小時最多 10 次）",
    });
}

// routes 用這個讀取limiter
export function getRateLimiters () {
    if (
            !forgotPasswordLimiter ||
            !loginLimiter ||
            !registerLimiter ||
            !sendVerificationLimiter ||
            !generalApiLimiter ||
            !resetPasswordLimiter ||
            !createLinkLimiter ||
            !updateAvatarLimiter
    ) {
        throw new Error("Rate limiters not initialized. Did you forget to call initRateLimiters()?");
    }

    return {
        forgotPasswordLimiter,
        loginLimiter,
        registerLimiter,
        sendVerificationLimiter,
        generalApiLimiter,
        resetPasswordLimiter,
        createLinkLimiter,
        updateAvatarLimiter,
    };
}
