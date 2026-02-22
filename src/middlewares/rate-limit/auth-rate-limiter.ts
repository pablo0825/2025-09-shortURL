import rateLimit from "express-rate-limit";
import { createRedisRateLimiter } from "./rate-limiter-base";

// typeof rateLimit 取得 rateLimit 的函式型別
// ReturnType<typeof rateLimit> 取得這個函式的回傳型別
export let forgotPasswordLimiter: ReturnType<typeof rateLimit> | null = null;
export let loginLimiter: ReturnType<typeof rateLimit> | null = null;
export let registerLimiter: ReturnType<typeof rateLimit> | null = null;
export let sendVerificationLimiter: ReturnType<typeof rateLimit> | null = null;
export let generalApiLimiter: ReturnType<typeof rateLimit> | null = null;
export let resetPasswordLimiter: ReturnType<typeof rateLimit> | null = null;

export function initAuthRateLimiters(): void {
    // 忘記密碼 - 嚴格限制 (5 分鐘 3 次)
    forgotPasswordLimiter = createRedisRateLimiter({
        windowMs: 5 * 60 * 1000,
        max: 3,
        prefix: "rl:forgot-password:",
        message: "密碼重設請求過於頻繁，請 5 分鐘後再試",
    });

    // 登入 - 中度限制 (15 分鐘 5 次失敗)
    loginLimiter = createRedisRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 5,
        prefix: "rl:login:",
        message: "登入嘗試次數過多，請 15 分鐘後再試",
        skipSuccessfulRequests: true,
    });

    // 註冊 - 嚴格限制 (1 小時 3 次)
    registerLimiter = createRedisRateLimiter({
        windowMs: 60 * 60 * 1000,
        max: 3,
        prefix: "rl:register:",
        message: "註冊次數過多，請 1 小時後再試",
    });

    // 驗證碼發送 - 嚴格限制 (1 分鐘 1 次)
    sendVerificationLimiter = createRedisRateLimiter({
        windowMs: 60 * 1000,
        max: 1,
        prefix: "rl:verification:",
        message: "驗證碼發送過於頻繁，請 1 分鐘後再試",
    });

    // 一般 API - 寬鬆限制 (15 分鐘 100 次)
    generalApiLimiter = createRedisRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 100,
        prefix: "rl:api:",
        message: "請求過於頻繁，請稍後再試",
    });

    // 重設密碼 - 中度限制 (15 分鐘 5 次失敗)
    resetPasswordLimiter = createRedisRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 5,
        prefix: "rl:reset-password:",
        message: "重設密碼失敗次數過多，帳號已暫時鎖定 15 分鐘",
        skipSuccessfulRequests: true,
    });
}
