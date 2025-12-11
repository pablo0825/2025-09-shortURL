// middleware/limitCreateByIp.ts
import type { NextFunction, Request, Response } from "express";
import redis from "../redis/redisClient";

interface DailyRateLimitConfig {
    max: number;
    keyPrefix: string;
    message?: string;
}

// 每天相同ip的請求次數限制在100次，每天晚上11點59分重置
function createRedisRateLimiter (config: DailyRateLimitConfig) {
    return async (req: Request, res: Response, next:NextFunction) => {
        try {
            const ipRaw: string = req.ip || req.socket.remoteAddress || "unknown";
            const ip: string = ipRaw.replace(/^::ffff:/, ""); // 把ip規範化
            // YYYY-MM-DD
            const today = new Date().toISOString().split('T')[0];
            // ip+today，這可以實現每天重置的功能，因為日期的不同，所以key就不會重複
            const key = `${config.keyPrefix}${today}:${ip}`;

            // 計算到今天 23:59:59 的秒數
            const now = new Date();
            // 今天的最後一毫秒
            const endOfDay = new Date(
                    // now.getFullYear(), now.getMonth(), now.getDate() 確保新日期與當日相同
                    now.getFullYear(),
                    now.getMonth(),
                    now.getDate(),
                    23, 59, 59, 999
            );
            // .getTime() 是取得豪秒數
            // Math.ceil 向上取整數
            const ttlSeconds:number = Math.ceil((endOfDay.getTime() - now.getTime()) / 1000);

            // 啟動redis事務
            // pipeline會暫存redis命令
            const pipeline = redis.multi();
            // incr 將指定的key的值，加1，如:key:1
            pipeline.incr(key);
            // .expire 將指定的key，加上過期時間
            pipeline.expire(key, ttlSeconds);

            // 將暫存在pipelin中的redis命令，一次性發送出去
            const results = await pipeline.exec();

            if (!results || results.length < 2) {
                throw new Error("redis pipeline 失敗");
            }

            // 先斷言為 unknown，然後在斷言為我們希望的元結構 [Error | null, number]
            // incrResult是一個元組，第一個元素是錯誤，第二個元素是數字(也是我們實際需要的值)
            const incrResult = results[0] as unknown as [Error | null, number];

            if (incrResult[0]) {
                // 如果 incr 命令有錯誤，拋出錯誤
                throw incrResult[0];
            }

            // incrResult[1] 是 incr 命令的實際返回值 (新的計數)
            const currentCount = incrResult[1];

            // results[0][1] 該命令的實際回傳值，這邊是key的值增加後的新值
            const remaining:number = Math.max(0, config.max - currentCount);

            // 設定 response headers
            res.setHeader('X-RateLimit-Limit', config.max.toString());
            res.setHeader('X-RateLimit-Remaining', remaining.toString());
            res.setHeader('X-RateLimit-Reset', endOfDay.toISOString());

            if (currentCount > config.max) {
                return res.status(429).json({
                    ok: false,
                    error: config.message || '今日請求次數已達上限',
                    resetAt: endOfDay.toISOString(),
                });
            }

            next();
        } catch (err) {
            console.error('[DailyRateLimiter] Error:', err);
            // 發生錯誤時讓請求通過，避免影響服務
            next();
        }
    }
    // const ipRaw: string = req.ip || req.socket.remoteAddress || "unknown";
    // const ip: string = ipRaw.replace(/^::ffff:/, ""); // 把ip規範化
    // const today = new Date().toISOString().slice(0, 10); // 把當下時間轉換為ISO格式，然後只取前10個字串
    // // ip+today，這可以實現每天重置的功能，因為日期的不同，所以key就不會重複
    // const key = `rl:create:${ip}:${today}`;
    //
    // // incr 是原子操作，接收到a, b請求，會先確保a的要求，在開始執行b的要求
    // // 將原有的key值加1，如果key值不存在的話就初始化為0
    // // rl:create:ip:today: 1
    // // 這邊操作的是鍵值，而不是key
    // const count:number = await redis.incr(key);
    //
    // // 過期機制，當ip第一次訪問時執行
    // if (count === 1) {
    //     const midnight = new Date(); // 建立當前時間的實例
    //     midnight.setUTCHours(23, 59, 59, 999); // 將時間設定為午夜的前一秒
    //     // 到午夜前的剩餘時間
    //     // 午夜時間 - 當前時間 = 剩餘時間
    //     const ttl = Math.ceil((midnight.getTime() - Date.now()) / 1000);
    //
    //     // 幫計時器設定一個過期時間
    //     // (對向, 過期時間)
    //     // 經過ttl秒後，key的紀錄被重置，開始新的一天的紀錄
    //     // 所以redis會在key上面加上一個ttl屬性，當作是過期時間
    //     await redis.expire(key, ttl);
    // }
    //
    // // 該ip當日請求超過100次進行阻擋
    // if(count > LIMIT) {
    //     return res.status(429).json({
    //         ok: false,
    //         error: "Rate limit exceeded. Try again tomorrow.",
    //     });
    // }
    //
    // return next();
}

export const createLinkLimiter = createRedisRateLimiter({
    max: 100,
    keyPrefix: 'rl:create-link:',
    message: '今日建立短網址次數已達上限（100次），請明天 00:00 後再試',
});