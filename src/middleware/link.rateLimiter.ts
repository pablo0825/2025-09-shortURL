import rateLimit from "express-rate-limit";
import { createRedisRateLimiter } from "./rateLimiter.base";

export let createLinkLimiter: ReturnType<typeof rateLimit> | null = null;

export function initLinkRateLimiters(): void {
    // 建立 link - 每個 IP 一天最多 100 次
    createLinkLimiter = createRedisRateLimiter({
        windowMs: 24 * 60 * 60 * 1000,
        max: 100,
        prefix: "rl:create-link:",
        message: "今日建立短網址已達上限 100 次，請明天再試",
    });
}
