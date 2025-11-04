
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
        // select and lock(選取並鎖定)
        // 因為update無法直接鎖定，所以需要先建立臨時表
        // FOR UPDATE 行級鎖定，一但被鎖定後，其他work無法操作資料行，只有等資料行被提交或滾回．原子性
        // SKIP LOCKED 跳過鎖定，如果work發現資料行被鎖定的話，就跳過它，去執行其他資料行．高併發
        const query = await pool.query<{
            id:string,
            payload:any,
            attempts:number
        }>('WITH cte AS (SELECT id FROM link_task WHERE status = $1 AND available_at <= now() ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT $2) UPDATE link_task t SET status = $3, locked_at = now(), locked_by = $4, attempts = t.attempts + 1 FROM cte WHERE t.id = cte.id RETURNING t.id, t.payload, t.attempts', ["pending", BATCH_SIZE, "processing", WORKER_ID]);
        // 結束連線
        await client.query("COMMIT");

        if (query.rows.length === 0) {
            console.log("link_task is empty");
            return;
        }

        const rows = query.rows;

        for (const r of rows) {
            const id = r.id;
            const { code, long_url, expire_at } = r.payload;

            if (!code || !long_url) {
                // 連線開始
                await client.query("BEGIN");
                // 缺少code或long_url，更新status=pending, available_at=間隔時間, ...等等
                // make_interval 得到一個時間尖隔，如：0 years 0 months 0 days 0 hours 8 minutes 0 seconds
                // LEAST(上限時間, 計算出的時間)
                // GREATEST(X ,1) 取最大值
                // 60 * (2 ^ GREATEST($2 ,1)) = 60 * (2^3)
                await pool.query('UPDATE link_task SET status = $1, available_at = now() + make_interval(secs => LEAST(3600, 60 * (2 ^ GREATEST($2 ,1)))), last_error = $3, last_error_at = now(), locked_at = NULL, locked_by = Null WHERE id = $4 AND status = $5', ["pending", r.attempts, "payload缺少code/long_url", id, "processing"]);
                // 連線結束
                await client.query('COMMIT');
                // 繼續往下執行
                continue;
            }


            const key = `short:${code}`;
        }

    } catch (err) {

    } finally {
        //
        if (client) client.release();
    }

    // const query = await pool.query('UPDATE link_task SET status = $1 WHERE status = $2 AND processed_at IS NULL RETURNING payload', ["processing", "pending"]);
    // if (query.rowCount === 0) {
    //     console.log("link_task table，目前沒有待處理的資料");
    // }
    //
    // const rows = query.rows;
    //
    // for (const value of rows) {
    //     const id = value.id;
    //     const { code, long_url, expire_at } = value.payload;
    //
    //     const key = `short:${code}`;
    //     // expire_at被pg傳出來時是字串，需要轉換為時間
    //     const expireAt = new Date(expire_at);
    //
    //     // 轉換為秒，向上取整，確保ttl至少為1
    //     const ttl = Math.max(1, Math.ceil((expireAt.getTime() - Date.now()) / 1000));
    //
    //     try {
    //         // 寫入redis
    //         await redis.setEx(key, ttl, long_url);
    //
    //         const result = await pool.query('UPDATE link_task SET status = $1, processed_at = $2 WHERE status = $3 AND id = $4', ["done", Date.now(), "processing", id]);
    //     } catch (err) {
    //         const msg = err instanceof Error ? err.message : String(err);
    //
    //         const result = await pool.query('UPDATE link_task SET status = $1, last_error = $2, last_error_at = $3 WHERE status = $4 AND processed_at IS NULL AND id = $5', ["failed", msg, Date.now(), "processing", id]);
    //     }
    // }
}

main();





