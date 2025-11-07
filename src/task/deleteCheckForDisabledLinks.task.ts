// deleteCheckForDisabledLinks.task.ts
import {pool} from "../pool";
import redis from "../redis/redisClient";

// [未完成] (1)try catch多包了一層有點冗 (2)unlink是可變參數，不是陣列?但這個沒報錯，可能要看一下 (3)v的型別問題
export async function deleteCheckForDisabledLinks () {
    try {
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
        console.log(`[CRON-02] 停用 links：${rowCount} 筆，已嘗試清理快取鍵：${keys.length} 個；實際刪除：約 ${removed} 個`);
    } catch (err) {
        console.error("[CRON-02] 查詢/清理流程失敗：", err);
    }
}