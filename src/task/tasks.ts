import cron from "node-cron";
import { pool } from "../pool";

// 每天中午12點執行停用過期的link
cron.schedule("0 12 * * *", async () => {
    try {
        const result = await pool.query('UPDATE links SET is_active = FALSE WHERE expire_at < now() AND is_active = TRUE;');

        console.log(`[CRON] 已停用過期 links：${result.rowCount} 筆`);
    } catch (err) {
        console.error("[CRON] 更新過期 link 失敗:", err);
    }
}, {
    timezone: "Asia/Taipei" // 指定台灣台北時區
});

// 每10分鐘，從link_task中拿pending的資料，來建立快取
cron.schedule("0 12 * * *", async () => {
    try {
        const query = await pool.query('SELECT * FROM link_task');
        if (query.rowCount === 0) {
            console.log("link_task table，目前沒有待處理的資料");
        }




    } catch (err) {

    } finally {

    }
}, {
    timezone: "Asia/Taipei" // 指定台灣台北時區
})
