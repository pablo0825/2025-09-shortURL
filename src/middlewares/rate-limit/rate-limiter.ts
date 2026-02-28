// rate-limiter.ts
import { cacheIsOpen } from '../../lib/cache';
import {
    forgotPasswordLimiter,
    loginLimiter,
    registerLimiter,
    sendVerificationLimiter,
    generalApiLimiter,
    resetPasswordLimiter,
    initAuthRateLimiters,
} from './auth-rate-limiter';
import { createLinkLimiter, initLinkRateLimiters } from './link-rate-limiter';
import {
    updateAvatarLimiter,
    getMyProfileLimiter,
    updateMyProfileLimiter,
    deleteAvatarLimiter,
    updatePasswordLimiter,
    setup2faLimiter,
    enable2faLimiter,
    disable2faLimiter,
    softDeleteMyAccountLimiter,
    getMySessionsLimiter,
    logoutAllLimiter,
    logoutDeviceLimiter,
    initUserRateLimiters,
} from './user-rate-limiter';

// Redis connect 完成後呼叫
export function initRedisRateLimiter(): void {
    if (!cacheIsOpen()) {
        // 如果 Redis 未連線就拋錯，避免 fallback MemoryStore
        throw new Error('Redis is not connected. Call initRedis() before initRateLimiters().');
    }

    initAuthRateLimiters();
    initLinkRateLimiters();
    initUserRateLimiters();
}

// routes 使用的 limiter
export function getRateLimiters() {
    if (
        !forgotPasswordLimiter ||
        !loginLimiter ||
        !registerLimiter ||
        !sendVerificationLimiter ||
        !generalApiLimiter ||
        !resetPasswordLimiter ||
        !createLinkLimiter ||
        !updateAvatarLimiter ||
        !getMyProfileLimiter ||
        !updateMyProfileLimiter ||
        !deleteAvatarLimiter ||
        !updatePasswordLimiter ||
        !setup2faLimiter ||
        !enable2faLimiter ||
        !disable2faLimiter ||
        !softDeleteMyAccountLimiter ||
        !getMySessionsLimiter ||
        !logoutAllLimiter ||
        !logoutDeviceLimiter
    ) {
        throw new Error(
            'Rate limiters not initialized. Did you forget to call initRateLimiters()?',
        );
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
        getMyProfileLimiter,
        updateMyProfileLimiter,
        deleteAvatarLimiter,
        updatePasswordLimiter,
        setup2faLimiter,
        enable2faLimiter,
        disable2faLimiter,
        softDeleteMyAccountLimiter,
        getMySessionsLimiter,
        logoutAllLimiter,
        logoutDeviceLimiter,
    };
}
