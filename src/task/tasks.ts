import cron from "node-cron";
import {pool} from "../pool";
import {linkTasksToCacheTask} from "./linkTasksToCacheTask";
import redis from "../redis/redisClient";
import {deleteCheckForDisabledLinks} from "./deleteCheckForDisabledLinks.task";

// [定時任務] 每天中午12點把過期的link停用
cron.schedule("0 12 * * *", async () => {
    try {
        console.log(`[CRON-01] 運行把過期的link停用的任務...`);
        const result = await pool.query('UPDATE links SET is_active = FALSE WHERE expire_at < now() AND is_active = TRUE;');
        console.log(`[CRON-01] 已停用過期 links：${result.rowCount} 筆`);
    } catch (err) {
        console.error("[CRON-01] 更新過期 link 失敗:", err);
    }
}, {
    timezone: "Asia/Taipei" // 指定台灣台北時區
});

// [定時任務] 每天中午1點把停用的link的check紀錄刪除
cron.schedule("*/30 * * * *", async () => {
    try {
        console.log(`[CRON-02] 運行把停用link的check紀錄刪除的任務...`);
        await deleteCheckForDisabledLinks()
    } catch (err) {
        console.error("[CRON-02] 停用link的快取刪除失敗：", err);
    }
}, {
    timezone: "Asia/Taipei" // 指定台灣台北時區
})

// [定時任務-03] 每10分鐘把link_task的link寫入到check
cron.schedule("*/10 * * * *", async () => {
    try {
        console.log(`[CRON-03] 運行link寫入check的任務...`);
        await linkTasksToCacheTask();
    } catch (err) {
        console.error("[CRON-03] link寫入check失敗:", err);
    }
}, {
    timezone: "Asia/Taipei" // 指定台灣台北時區
});