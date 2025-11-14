// redisProvider.ts
import redis from "../redis/redisClient";
import * as crypto from "node:crypto";

export class redisProvider {
    // [question] 這邊是直接引入，但比較適合的做法是用注入+建構函式。未來可以改一下
    private readonly redisClient = redis;

    // [功能1] token+hash
    // 固定輸出64個16進位字元
    private hashToken(token: string): string {
        // .createHash("sha256") 建立一個hash，用sha256演算法
        // .digest("hex") 計算最終的雜奏值，用16進制的結果返回
        return crypto.createHash("sha256").update(token).digest("hex");
    }

    // [功能2] 把refreshToken存到redis中，並設定7天過期
    public async saveRefreshToken (refreshToken: string, userName:string):Promise<void> {
        // 加料，把refreshToken變成亂碼
        const hashed:string = this.hashToken(refreshToken);
        const key:string = `refresh_token:${hashed}`;
        const ttl:number = 7 * 24 * 60 * 60; // 604800
        // 7天後過期
        // 用userName作為value
        await this.redisClient.setEx(key, ttl, userName);
    }

    // [功能3] 檢查refreshToken是否有效
    public async isRefreshTokenValid(refreshToken: string):Promise<boolean> {
        const hashed:string = this.hashToken(refreshToken);
        const key:string = `refresh_token:${hashed}`;
        const count:number = await this.redisClient.exists(key); // 0 or 1
        return count === 1;
    }

    // [功能4] 強制刪除refreshToken
    // 用於使用者登出或強制作廢
    public async deleteRefreshToken(refreshToken: string):Promise<void> {
        const hashed:string = this.hashToken(refreshToken);
        const key:string = `refresh_token:${hashed}`;
        await this.redisClient.del(key);
    }

    // [功能5] 將accessToken加入黑名單
    // expirationMa是accessToken的剩餘時間
    public async addToBlacklist(accessToken: string, expirationMs: number):Promise<void> {
        if(expirationMs <= 0) return;
        const hashed:string = this.hashToken(accessToken);
        const key:string = `blacklist:${hashed}`;
        await this.redisClient.setEx(key, expirationMs, "1");
    }

    // [功能6] 檢查accessToken是否有被加入黑名單
    public async isInBlacklist(accessToken: string):Promise<boolean>  {
        const hashed:string = this.hashToken(accessToken);
        const key:string = `blacklist:${hashed}`;
        const count = await this.redisClient.exists(key); // 0 or 1
        return count === 1;
    }
}