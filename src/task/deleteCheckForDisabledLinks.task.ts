// deleteCheckForDisabledLinks.task.ts
import {pool} from "../pool";
import redis from "../redis/redisClient";

// [2025/11/09 解決] (1)把多餘的try catch移除 (2)unlink可以支援傳陣列
// [未完成] (1)v的型別問題，不知道怎麼解決，先放著
export async function deleteCheckForDisabledLinks () {
    // 查詢狀態是is_active = FALSE的code
    const query = await pool.query<{ code:string }>('SELECT code FROM links WHERE is_active = FALSE');
    const { rowCount, rows } = query;

    if (rowCount === 0) {
        console.log("[CRON-02] 沒有停用的 link，無需清理快取");
        return;
    }

    const keys: string[] = [];
    for (const row of rows) {
        const code = row.code;
        // 把全部的code push到keys中
        keys.push(`short:${code}`);
    }

    // 紀錄刪除check的數量
    let removed:number = 0;
    try {
        // redis支援unlink方法
        // 用typeof檢查redis中是否有unlink function
        if (typeof redis.unlink === "function") {
            // redis.unlink是批量刪除的方法
            // 非阻塞刪除，將keys的刪除請求送到執行緒(非同步刪除)，並立即返回，不會讓redis主執行緒暫停
            // redis.del是單次刪除的方法，也是阻塞刪除方法，只有同步刪除指定的key，才能返回redis的主執行緒
            removed = await redis.unlink(keys);
        } else {
            // 把全部del命令寫進pipeline中，一次執行
            // 啟動 redis pipeline(管道) 事務
            const multi = redis.multi();
            // 歷遍所有key，將del(key)的命令，加入到multi
            for (const key of keys) multi.del(key);
            // 執行pipeline中的所有命令
            const res = await multi.exec();
            removed = (res ?? []).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
        }
    } catch (err) {
        console.error("[CRON-02] Redis 快取清理失敗", err);
    }
    console.log(`[CRON-02] 刪除 check：${removed} 個`);
}