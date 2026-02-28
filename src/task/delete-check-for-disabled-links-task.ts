// delete-check-for-disabled-links-task.ts
import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { buildCacheKey, cacheDelMany } from '../lib/cache';

// [2025/11/09 解決] (1)把多餘的try catch移除 (2)unlink可以支援傳陣列
// [未完成] (1)v的型別問題，不知道怎麼解決，先放著
export async function deleteCheckForDisabledLinks() {
    // 查詢狀態是is_active = FALSE的code
    const query = await pool.query<{ code: string }>(
        'SELECT code FROM links WHERE is_active = FALSE',
    );
    // const { rowCount, rows } = query;

    if (query.rowCount === 0) {
        logger.info('[CRON-02] 沒有停用的 link，無需清理快取');
        return;
    }

    const keys: string[] = [];

    for (const row of query.rows) {
        const code = row.code;
        // 把全部的code push到keys中
        keys.push(buildCacheKey('short', code));
    }

    // 紀錄刪除check的數量
    let removed: number = 0;
    try {
        removed = await cacheDelMany(keys);
    } catch (err) {
        logger.error('[CRON-02] Redis 快取清理失敗', err);
    }
    logger.info(`[CRON-02] 刪除 check：${removed} 個`);
}
