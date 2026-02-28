import type rateLimit from 'express-rate-limit';
import { createRedisRateLimiter } from './rate-limiter-base';

export let updateAvatarLimiter: ReturnType<typeof rateLimit> | null = null;
export let getMyProfileLimiter: ReturnType<typeof rateLimit> | null = null;
export let updateMyProfileLimiter: ReturnType<typeof rateLimit> | null = null;
export let deleteAvatarLimiter: ReturnType<typeof rateLimit> | null = null;
export let updatePasswordLimiter: ReturnType<typeof rateLimit> | null = null;
export let setup2faLimiter: ReturnType<typeof rateLimit> | null = null;
export let enable2faLimiter: ReturnType<typeof rateLimit> | null = null;
export let disable2faLimiter: ReturnType<typeof rateLimit> | null = null;
export let softDeleteMyAccountLimiter: ReturnType<typeof rateLimit> | null = null;
export let getMySessionsLimiter: ReturnType<typeof rateLimit> | null = null;
export let logoutAllLimiter: ReturnType<typeof rateLimit> | null = null;
export let logoutDeviceLimiter: ReturnType<typeof rateLimit> | null = null;

export function initUserRateLimiters(): void {
    // 上傳頭像 - 1 小時最多 10 次
    updateAvatarLimiter = createRedisRateLimiter({
        windowMs: 60 * 60 * 1000,
        max: 10,
        prefix: 'rl:update-avatar:',
        message: '上傳次數過多，請稍後再試（每小時最多 10 次）',
    });

    // 讀取個人資料 - 15 分鐘 60 次
    getMyProfileLimiter = createRedisRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 60,
        prefix: 'rl:user:me:',
        message: '讀取資料過於頻繁，請稍後再試',
    });

    // 更新個人資料 - 15 分鐘 20 次
    updateMyProfileLimiter = createRedisRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 20,
        prefix: 'rl:user:update-profile:',
        message: '更新過於頻繁，請稍後再試',
    });

    // 刪除頭像 - 1 小時 20 次
    deleteAvatarLimiter = createRedisRateLimiter({
        windowMs: 60 * 60 * 1000,
        max: 20,
        prefix: 'rl:user:delete-avatar:',
        message: '刪除頭像過於頻繁，請稍後再試',
    });

    // 修改密碼 - 15 分鐘 5 次
    updatePasswordLimiter = createRedisRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 5,
        prefix: 'rl:user:update-password:',
        message: '修改密碼過於頻繁，請 15 分鐘後再試',
    });

    // 2FA 設定 - 15 分鐘 5 次
    setup2faLimiter = createRedisRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 5,
        prefix: 'rl:user:2fa-setup:',
        message: '2FA 設定過於頻繁，請稍後再試',
    });

    // 2FA 啟用 - 15 分鐘 5 次
    enable2faLimiter = createRedisRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 5,
        prefix: 'rl:user:2fa-enable:',
        message: '2FA 啟用過於頻繁，請稍後再試',
    });

    // 2FA 關閉 - 15 分鐘 5 次
    disable2faLimiter = createRedisRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 5,
        prefix: 'rl:user:2fa-disable:',
        message: '2FA 關閉過於頻繁，請稍後再試',
    });

    // 軟刪除帳號 - 24 小時 3 次
    softDeleteMyAccountLimiter = createRedisRateLimiter({
        windowMs: 24 * 60 * 60 * 1000,
        max: 3,
        prefix: 'rl:user:soft-delete:',
        message: '操作過於頻繁，請稍後再試',
    });

    // 讀取登入紀錄 - 15 分鐘 30 次
    getMySessionsLimiter = createRedisRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 30,
        prefix: 'rl:user:sessions:',
        message: '查詢過於頻繁，請稍後再試',
    });

    // 登出所有裝置 - 15 分鐘 5 次
    logoutAllLimiter = createRedisRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 5,
        prefix: 'rl:user:logout-all:',
        message: '登出操作過於頻繁，請稍後再試',
    });

    // 登出單一裝置 - 15 分鐘 10 次
    logoutDeviceLimiter = createRedisRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 10,
        prefix: 'rl:user:logout-device:',
        message: '登出操作過於頻繁，請稍後再試',
    });
}
