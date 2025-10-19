// middleware/limitCreateByIp.ts
import type { NextFunction, Request, Response } from "express";
import redis from "../redis/redisClient";

const LIMIT = 100;

// 每天相同ip的請求次數限制在100次，每天晚上11點59分重置
export async function limitCreateByIp (req: Request, res: Response, next:NextFunction) {
    const ipRaw: string = req.ip ?? "";
    const ip: string = ipRaw.replace(/^::ffff:/, ""); // 把ip規範化
    const today = new Date().toISOString().slice(0, 10); // 把當下時間轉換為ISO格式，然後只取前10個字串
    // ip+today，這可以實現每天重置的功能，因為日期的不同，所以key就不會重複
    const key = `rl:create:${ip}:${today}`;

    // incr 是原子操作，接收到a, b請求，會先確保a的要求，在開始執行b的要求
    // 將原有的key值加1，如果key值不存在的話就初始化為0
    // rl:create:ip:today: 1
    // 這邊操作的是鍵值，而不是key
    const count:number = await redis.incr(key);

    // 過期機制，當ip第一次訪問時執行
    if (count === 1) {
        const midnight = new Date(); // 建立當前時間的實例
        midnight.setUTCHours(23, 59, 59, 999); // 將時間設定為午夜的前一秒
        // 到午夜前的剩餘時間
        // 午夜時間 - 當前時間 = 剩餘時間
        const ttl = Math.ceil((midnight.getTime() - Date.now()) / 1000);

        // 幫計時器設定一個過期時間
        // (對向, 過期時間)
        // 經過ttl秒後，key的紀錄被重置，開始新的一天的紀錄
        // 所以redis會在key上面加上一個ttl屬性，當作是過期時間
        await redis.expire(key, ttl);
    }

    // 該ip當日請求超過100次進行阻擋
    if(count > LIMIT) {
        return res.status(429).json({
            ok: false,
            error: "Rate limit exceeded. Try again tomorrow.",
        });
    }

    return next();
}

