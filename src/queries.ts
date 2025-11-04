
import { pool } from "./pool";
import redis from "./redis/redisClient";
import type { PoolClient } from "pg";

const WORKER_ID = process.env.HOSTNAME ?? "worker-1";
const BATCH_SIZE = 100; // 每次限制100筆
const VISIBILITY_TIMEOUT_MINUTES = 5; //

let client: PoolClient | undefined;

async function main() {
    //
    client = await pool.connect();

    try {
        // 開始連線
        await client.query("BEGIN");
        // 所以上面語法的意思是，先建立一個臨時表格，篩選條件是status=pending且available_at的時間小於現在，通過的話，就返回最多到100筆的id。
        // 接著，開始更新表格，要更新的欄位有status, locked_at等等，篩選條件是link_task id = cte id，通過的話，就返回id, payload, attempts等資料。
        const query = await pool.query<{
            id:string,
            payload:object,
            attempts:number
        }>('WITH cte AS (SELECT id FROM link_task WHERE status = $1 AND available_at <= now() ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT $2) UPDATE link_task t SET status = $3, locked_at = now(), locked_by = $4, attempts = t.attempts + 1 FROM cte WHERE t.id = cte.id RETURNING t.id, t.payload, t.attempts', ["pending", BATCH_SIZE, "processing", WORKER_ID]);
        // 結束連線
        await client.query("COMMIT");


    } catch (err) {

    } finally {
        //
        if (client) client.release();
    }

    const query = await pool.query('UPDATE link_task SET status = $1 WHERE status = $2 AND processed_at IS NULL RETURNING payload', ["processing", "pending"]);
    if (query.rowCount === 0) {
        console.log("link_task table，目前沒有待處理的資料");
    }

    const rows = query.rows;

    for (const value of rows) {
        const id = value.id;
        const { code, long_url, expire_at } = value.payload;

        const key = `short:${code}`;
        // expire_at被pg傳出來時是字串，需要轉換為時間
        const expireAt = new Date(expire_at);

        // 轉換為秒，向上取整，確保ttl至少為1
        const ttl = Math.max(1, Math.ceil((expireAt.getTime() - Date.now()) / 1000));

        try {
            // 寫入redis
            await redis.setEx(key, ttl, long_url);

            const result = await pool.query('UPDATE link_task SET status = $1, processed_at = $2 WHERE status = $3 AND id = $4', ["done", Date.now(), "processing", id]);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);

            const result = await pool.query('UPDATE link_task SET status = $1, last_error = $2, last_error_at = $3 WHERE status = $4 AND processed_at IS NULL AND id = $5', ["failed", msg, Date.now(), "processing", id]);
        }
    }
}

main();





