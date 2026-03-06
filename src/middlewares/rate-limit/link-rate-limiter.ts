import type rateLimit from 'express-rate-limit';
import { createRedisRateLimiter } from './rate-limiter-base';

export let createLinkLimiter: ReturnType<typeof rateLimit> | null = null;
export let redirectLinkLimiter: ReturnType<typeof rateLimit> | null = null;

export function initLinkRateLimiters(): void {
    // 建立 link - 每個 IP 一天最多 100 次
    createLinkLimiter = createRedisRateLimiter({
        windowMs: 24 * 60 * 60 * 1000,
        max: 100,
        prefix: 'rl:create-link:',
        message: '今日建立短網址已達上限 100 次，請明天再試',
    });

    // short code redirect - 每個 IP 每分鐘最多 120 次
    redirectLinkLimiter = createRedisRateLimiter({
        windowMs: 60 * 1000,
        max: 120,
        prefix: 'rl:redirect-link:',
        message: '短網址跳轉請求過於頻繁，請稍後再試',
    });
}
