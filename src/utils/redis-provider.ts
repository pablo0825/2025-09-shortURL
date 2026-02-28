// redisProvider.ts
import * as crypto from 'node:crypto';
import { buildCacheKey, cacheDel, cacheExists, cacheSet } from '../lib/cache';

export class redisProvider {
    // [功能1] token+hash
    // 固定輸出64個16進位字元
    private hashToken(token: string): string {
        // .createHash("sha256") 建立一個hash，用sha256演算法
        // .digest("hex") 計算最終的雜奏值，用16進制的結果返回
        // 這邊的加密方式是適合的，因為refreshToken的字串長度本來就很長，所以經過加密後的字串，就會更難破解
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    // [功能2] 把refreshToken存到redis中，並設定7天過期
    public async saveRefreshToken(refreshToken: string, userName: string): Promise<void> {
        // 加料，把refreshToken變成亂碼
        const hashed: string = this.hashToken(refreshToken);
        const key: string = buildCacheKey('refresh_token', hashed);
        const ttl: number = 7 * 24 * 60 * 60; // 604800
        await cacheSet(key, userName, ttl);
    }

    // [功能3] 檢查refreshToken是否有效
    public async isRefreshTokenValid(refreshToken: string): Promise<boolean> {
        const hashed: string = this.hashToken(refreshToken);
        const key: string = buildCacheKey('refresh_token', hashed);
        return cacheExists(key);
    }

    // [功能4] 強制刪除refreshToken
    // 用於使用者登出或強制作廢
    public async deleteRefreshToken(refreshToken: string): Promise<void> {
        const hashed: string = this.hashToken(refreshToken);
        const key: string = buildCacheKey('refresh_token', hashed);
        await cacheDel(key);
    }

    // [功能5] 將accessToken加入黑名單
    // expirationMa是accessToken的剩餘時間
    public async addToBlacklist(accessToken: string, expirationMs: number): Promise<void> {
        // 計算現在的時間
        const nowSec: number = Math.floor(Date.now() / 1000);
        // 過期時間 = token過期時間 - 現在時間
        const ttlSec: number = Math.max(0, expirationMs - nowSec);
        if (ttlSec <= 0) return;
        const hashed: string = this.hashToken(accessToken);
        const key: string = buildCacheKey('blacklist', hashed);
        await cacheSet(key, '1', ttlSec);
    }

    // [功能6] 檢查accessToken是否有被加入黑名單
    public async isInBlacklist(accessToken: string): Promise<boolean> {
        const hashed: string = this.hashToken(accessToken);
        const key: string = buildCacheKey('blacklist', hashed);
        return cacheExists(key);
    }
}
