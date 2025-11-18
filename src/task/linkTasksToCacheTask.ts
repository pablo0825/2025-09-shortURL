
// linkTasksToCacheTask.task.ts
import {pool} from "../pool";
import redis from "../redis/redisClient";
import type { PoolClient } from "pg";

const WORKER_ID = process.env.HOSTNAME ?? "worker-1";
const BATCH_SIZE = 100; // 每次限制100筆
const VISIBILITY_TIMEOUT_MINUTES = 5; // 逾時時間

let client: PoolClient | undefined;

function computeTtlSeconds(expireAt: string | null): number | null {
    if (!expireAt) return null; // 沒有過期時間 → 可選擇不設 TTL（改用 set/setEX）
    // new Date 把字串轉為時間型別
    // getTime 獲得該時間的毫秒
    // Date.now() 獲得現在的時間毫秒
    const ms = new Date(expireAt).getTime() - Date.now();
    // isNaN 判斷輸入的變數是否為數字
    if (Number.isNaN(ms)) return null;
    // Math.ceil 向上取整數，例如12.3會變成13
    const sec = Math.ceil(ms / 1000);
    // 判斷計算出來的過期時間是否小於0
    if (sec <= 0) return 0;      // 已過期
    return sec;
}

export async function linkTasksToCacheTask() {
    // 從pool中獲取一個獨立且連續的資料庫連線
    client = await pool.connect();

    try {
        // 逾時回收
        await client.query('UPDATE link_task SET status = $1, available_at = now(), locked_at = NULL, locked_by = NULL WHERE status = $2 AND locked_at < now() - make_interval(mins => $3)', ["pending", "processing", VISIBILITY_TIMEOUT_MINUTES]);

        // 這裡用BEGIN/COMMIT的原因是，希望rowLock(行鎖)只在本次交易中有效。這邊有高併發的考量
        // 本次交易後，lock馬上被釋放，可以被其他works使用
        // 開始連線
        await client.query("BEGIN");
        // select and lock(選取並鎖定)
        // 因為update無法直接鎖定，所以需要先建立臨時表
        // FOR UPDATE 行級鎖定，一但被鎖定後，其他work無法操作資料行，只有等資料行被提交或滾回．原子性
        // SKIP LOCKED 跳過鎖定，如果work發現資料行被鎖定的話，就跳過它，去執行其他資料行．高併發
        const query = await client.query<{
            id: string,
            payload: any,
            attempts: number
        }>('WITH cte AS (SELECT id FROM link_task WHERE status = $1 AND available_at <= now() ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT $2) UPDATE link_task t SET status = $3, locked_at = now(), locked_by = $4, attempts = t.attempts + 1 FROM cte WHERE t.id = cte.id RETURNING t.id, t.payload, t.attempts', ["pending", BATCH_SIZE, "processing", WORKER_ID]);
        // 結束連線
        await client.query("COMMIT");

        if (query.rows.length === 0) {
            console.log("link_task: no pending items.");
            return;
        }

        const rows = query.rows;

        for (const r of rows) {
            const id = r.id;
            const {code, long_url, expire_at} = r.payload ?? {};
            const attempts:number = r.attempts;
            // 基本防呆
            if (!code || !long_url) {
                // 處理錯誤
                // 缺少code或long_url，更新status=failed, available_at=間隔時間, ...等等
                await client.query('UPDATE link_task SET status = $1, last_error = $3, last_error_at = now(), locked_at = NULL, locked_by = NULL WHERE id = $4 AND status = $5', ["failed", "payload缺少code/long_url", id, "processing"]);
                // 繼續往下執行
                continue;
            }
            // 檢查嘗試次數的上限
            // 超過5次的話，就把status更新為failed
            if (attempts >= 5) {
                // 把資料的status更新為failed
                await client.query('UPDATE link_task SET status = $1, processed_at = now(), last_error = $2, last_error_at = now(), locked_at = NULL, locked_by = NULL WHERE id = $3 AND status = $4', ["failed", "attempts exhausted", id, "processing"]);
                // 繼續往下執行
                continue;
            }

            const key = `short:${code}`;
            const ttl: number | null = computeTtlSeconds(expire_at);

            try {
                // 已過期
                if (ttl === 0) {
                    await redis.del(key);
                    // 把資料的status更新為done
                    // 資料過期不是錯誤，所以用done會比較適合
                    await client.query('UPDATE link_task SET status = $1, processed_at = now(), locked_at = NULL, locked_by = NULL WHERE id = $2 AND status = $3', ["done", id, "processing"]);
                }
                // [風險] 沒有檢驗url是否合法，如果有人竄改link_task的資料，就無法防禦有問題的url
                const url = String(long_url);
                //
                if (ttl === null) {
                    // 無 expire_at：不設 TTL，直接 set 覆蓋
                    await redis.set(key, url); // 無 TTL 覆蓋
                } else {
                    // 有 TTL：用 setEX（或 setEx）
                    await redis.setEx(key, ttl, url);
                }
                // redis寫入成功後，把資料的status為done
                await client.query('UPDATE link_task SET status = $1, processed_at = now(), locked_at = NULL, locked_by = NULL WHERE id = $2 AND status = $3', ["done", id, "processing"]);
            } catch (err) {
                // Redis 寫入失敗
                //
                const msg = err instanceof Error ? err.message : String(err);
                // 缺少code或long_url，更新status=pending, available_at=間隔時間, ...等等
                // make_interval 得到一個時間尖隔，如：0 years 0 months 0 days 0 hours 8 minutes 0 seconds
                // LEAST(上限時間, 計算出的時間)
                // GREATEST(X ,1) 取最大值
                // 間隔時間：60 * (2 ^ GREATEST($2 ,1)) = 60 * (2^3)
                // power(2, 3) 計算次方，2^3=8
                await client.query('UPDATE link_task SET status = $1, available_at = now() + make_interval(secs => LEAST(3600, 60 * power(2, GREATEST($2 ,1)))), last_error = $3, last_error_at = now(), locked_at = NULL, locked_by = NULL WHERE id = $4 AND status = $5', ["pending", attempts, msg, id, "processing"]);
            }
        }
    } catch (err) {
        if (client) {
            // 多包一層try catch是為了讓finally可以被執行
            // 如果沒有包的話，會停留在catch上
            // 這樣就不能釋放pool的連線資源
            try {
                await client.query('ROLLBACK');
            } catch {}
        }
        throw err;
    } finally {
        // 釋放連線資源
        if (client) client.release();
    }
}