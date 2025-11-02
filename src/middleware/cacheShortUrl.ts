// cacheShortUrl.ts
import type { Request, Response, NextFunction } from "express";
import redis from "../redis/redisClient";
import { longUrlSchema } from "../zod/longUrl.schema";
import { isForbiddenTarget } from "../utils/isForbiddenTarget";
import { writeLogToDB } from "../utils/witeLogToDB";

const LongUrlSchema = longUrlSchema({
    shortDomain: process.env.SHORT_BASE_URL, // e.g. "sho.rt"
    allowHash: true,
    stripTrackingParams: true,
    maxLength: 2048,
});

// 正向+負向快取
// 運用快取加速URL轉跳的速度
// 用負向快取預防大量不存在的shortURL攻擊
export async function cacheShortUrl (req: Request, res: Response, next: NextFunction) {
    const raw:string = req.params.code ?? "";
    // .trim() 移除前後空字串
    const code = raw.trim();
    if(!code) {
        return res.status(400).send("short_code是必須的");
    }

    // 限制code的字串必須要在64位的字串中
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) {
        return res.status(400).send("short_code格式不正確");
    }

    // 規範化字串，方便在redis中查詢
    const key = `short:${code}`;
    const tomb = `short404:${code}`;

    try {
        // 負向快取
        // 阻擋不存在的短碼瘋狂攻擊
        if (await redis.exists(tomb)) {
            writeLogToDB(req, "null", "link不存在(負向快取命中)");
            return res.status(404).json({
                ok: false,
                error: "shortURL 不存在(redis)"
            });
        }
        // 正向快取
        const cached:string | null = await redis.get(key);
        // redis中查詢不到shortUrl的話，就往後傳給db查詢
        if (!cached) return next();

        // 驗證url是否合法
        const result = LongUrlSchema.safeParse(cached);
        if (!result.success) {
            // 刪掉髒key，因為result建立失敗，所以redis中的key也沒必要留著了
            await redis.del(key);
            return next();
        }

        const longUrl:string = result.data;
        let u1:URL;
        try {
            u1 = new URL(longUrl);
        } catch (err) {
            // 刪掉髒key，因為result建立失敗，所以redis中的key也沒必要留著了
            await redis.del(key);
            return next();
        }

        // 判斷hostname是否合法，不能本機或內網的url
        const verdict:boolean = await isForbiddenTarget(u1.hostname);
        if (verdict) {
            return res.status(400).json({
                ok:false,
                error:"不允許的目標主機(快取)"
            });
        }

        // 把log紀錄寫入到link_log中
        writeLogToDB(req, "null", "link被使用(快取命中)")

        return res.redirect(302, longUrl);
    } catch (err) {
        return next();
    }
}

