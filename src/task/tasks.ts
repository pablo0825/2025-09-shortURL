import cron from "node-cron";
import {pool} from "../pool";
import {linkTasksToCheckTask} from "./linkTasksToCheck.task";
import redis from "../redis/redisClient";

// [定時任務] 每天中午12點把過期的link停用
// [未完成] 要補上停用的link，它的redis的快取紀錄也要刪掉
cron.schedule("0 12 * * *", async () => {
    try {
        const result = await pool.query<{ code:string }>('UPDATE links SET is_active = FALSE WHERE expire_at < now() AND is_active = TRUE RETURNING code;');

        await redis.del(`short404:${result.rows[0].code}`);

        console.log(`[CRON] 已停用過期 links：${result.rowCount} 筆`);
    } catch (err) {
        console.error("[CRON] 更新過期 link 失敗:", err);
    }
}, {
    timezone: "Asia/Taipei" // 指定台灣台北時區
});

// [定時任務] 每10分鐘把link_task的link寫入到check
cron.schedule("*/10 * * * *", async () => {
    try {
        console.log(`[${new Date().toISOString()}] Running linkTasksToCheck()...`);
        await linkTasksToCheckTask();
    } catch (err) {
        console.error("linkTasksToCheckTask failed:", err);
    }
}, {
    timezone: "Asia/Taipei" // 指定台灣台北時區
});