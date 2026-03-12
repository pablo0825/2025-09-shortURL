// cacheShortUrl.ts
import type { Request, Response, NextFunction } from 'express';
import { buildCacheKey, cacheExists, cacheGet } from '../../lib/cache';

// 正向+負向快取
// 運用快取加速URL轉跳的速度
// 用負向快取預防大量不存在的shortURL攻擊
export async function cacheShortUrl(req: Request, res: Response, next: NextFunction) {
    const raw: string = req.params.code ?? '';
    // .trim() 移除前後空字串
    const code = raw.trim();
    if (!code) {
        return res.status(400).send('short_code是必須的');
    }

    // 限制code的字串必須要在64位的字串中
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) {
        return res.status(400).send('short_code格式不正確');
    }

    // 規範化字串，方便在redis中查詢
    // short:{code}
    const key = buildCacheKey('short', code);
    const tomb = buildCacheKey('short404', code);

    try {
        // 負向快取
        // 阻擋不存在的短碼瘋狂攻擊
        if (await cacheExists(tomb)) {
            return res.status(404).json({
                ok: false,
                error: 'shortURL 不存在(redis)',
            });
        }

        // 正向快取
        const cached: string | null = await cacheGet(key);
        // redis中查詢不到shortUrl的話，就往後傳給db查詢
        if (!cached) return next();

        // 快取命中，直接轉跳（快取寫入時已驗證過，不需重複驗證）
        return res.redirect(302, cached);
    } catch (err) {
        return next(err);
    }
}
