// link.controllers.ts
import { Request, Response } from "express";
import type { PoolClient} from "pg";
import { pool } from "../pool";
import { Base62 } from "../utils/base62";
import { Link } from "../type/types";
import { longUrlSchema } from "../zod/longUrl.schema";
import { writeLogToDB } from "../utils/witeLogToDB";
import redis from "../redis/redisClient";
import { isForbiddenTarget } from "../utils/isForbiddenTarget";
import * as crypto from "node:crypto";

const base62 = new Base62();
const SHORT_BASE_URL = process.env.SHORT_BASE_URL?.replace(/\/+$/, '') || "http://localhost:3001";

if (!SHORT_BASE_URL) {
    throw new Error("沒有正確的URL");
}

const LongUrlSchema = longUrlSchema({
    shortDomain: process.env.SHORT_BASE_URL, // e.g. "sho.rt"
    allowHash: true,
    stripTrackingParams: true,
    maxLength: 2048,
});

const MIN_LENGTH = 5;
const OFFSET = BigInt(62 ** (MIN_LENGTH - 1));

// [api] 新增短網址
// 建立shortUrl，同時把shortUrl的資料推到link_task中
export const createShortUrl = async (req: Request, res: Response) => {
    let client: PoolClient | undefined;
    try {
        // 驗證url是否存在
       const result = LongUrlSchema.safeParse(req.body?.longUrl);

       if (!result.success) {
           const msg = result.error.issues[0]?.message ?? "無效的URL";
           return res.status(400).json({
               ok: false,
               error: msg,
           });
       }

       const longUrl:string = result.data;
       const u:URL = new URL(longUrl);

        // 判斷hostname是否合法，不能本機或內網的url
        const verdict:boolean = await isForbiddenTarget(u.hostname);
        console.log(verdict);
        if (verdict) {
            return res.status(400).json({
                ok:false,
                error:"不允許的目標主機"
            });
        }

       const ip:string | null = req.ip ?? null;

       // 從pool中獲取一個獨立且連續的資料庫連線
        // 開始交易
        client = await pool.connect();
        await client.query('BEGIN');

        // 把longURL, ip插入到links，回傳id, long_url, expire_at
        const ins = await client.query<{
            id: string,
            long_url: string,
            expire_at: string | null
        }>(`INSERT INTO links (long_url, creator_ip) VALUES ($1, $2::INET) RETURNING id, long_url, expire_at`, [longUrl, ip ?? null]);

        const idStr:string = ins.rows[0].id;  // 用字串避免 JS number 精度
        const idBig:bigint = BigInt(idStr); // 把字串轉型為bigint
        const code:string = base62.encode10to62(idBig + OFFSET);

        // 把code, short_url, id更新到links，回傳code
        const upd = await client.query<{ code: string }>(
            `UPDATE links SET code = $1 WHERE id = $2::BIGINT RETURNING code`,
            [code, idStr]
        );

        // 把code, long_url, expire_at組成payload物件包
        const payloadObject = { code, long_url:ins.rows[0].long_url, expire_at:ins.rows[0].expire_at };

        // 把id, payload等資料插入到link_task
        await client.query('INSERT INTO link_task (link_id, payload, available_at) VALUES ($1::BIGINT, $2::jsonb, now())', [idBig, payloadObject]) ;

        // 提交交易 (成功寫入資料到資料庫)
        await client.query("COMMIT");

        // 組成shortURL
        const shortUrl:string = new URL(`/${code}`, SHORT_BASE_URL).toString();
        // 寫入log紀錄
        writeLogToDB(req, String(idStr), `新增link ${shortUrl}`);

        // 201 表示伺服器已完成請求，並建立一個新的資源。通常用於post, put，有改變伺服器狀態
        return res.status(201).json({
            ok: true,
            code: upd.rows[0].code,
            shortUrl:shortUrl
        });
    }  catch (err) {
        if (client) {
            // 多包一層try catch是為了讓finally可以被執行
            // 如果沒有包的話，會停留在catch上
            // 這樣就不能釋放pool的連線資源
            try {
                await client.query('ROLLBACK');
            } catch {}
        }
        // instanceof 檢查物件中是否存在實例
        // 不能用 typeof ，它會回傳object
        const msg = err instanceof Error ? err.message : String(err);
        return res.status(500).json({
            ok: false,
            error: msg
        });
    } finally {
        // 釋放連線資源
        if (client) client.release();
    }
}

// [api] 重定向長網址
// 運用快取加速URL轉跳的速度
// 用負向快取預防大量不存在的shortURL攻擊
// 單飛鎖：在多人重定向的情況下，確保只有一個人可以進到db，其他人進入等待模式
export const redirectToLongUrl = async (req: Request, res: Response) => {
    const raw = req.params.code ?? "";
    // .trim() 移除前後空字串
    const code = raw.trim();
    if(!code) {
        return res.status(400).send("short_code是必須的");
    }

    // 限制code的字串必須要在64位的字串中
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) {
        return res.status(400).send("short_code格式不正確");
    }

    const key = `short:${code}`;
    const tomb = `short404:${code}`;
    // 單飛鎖
    const lockKey = `lock:short:${code}`;
    // 傳入的參數，ms是秒數
    const sleep = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));

    // 建立一把鎖
    const token = crypto.randomUUID();
    // 把lockKey上鎖
    const locked = await redis.set(lockKey, token, { NX: true, PX: 3000 });
    // 當其他人先拿到上鎖的locked的話
    if (!locked) {
        // 沒有上鎖的話
        // 第一次嘗試
        // 暫停0.8秒，讓先行者去查db，建立cache
        await sleep(80);
        // 負向快取
        if(await redis.exists(tomb)) {
            return res.status(404).json({
                ok: false,
                error: "shortURL 不存在(redis)"
            });
        }
        // 正向快取
        const retry1 = await redis.get(key);
        // 有抓到快取的話，就進行重定向
        if (retry1) return res.redirect(302, retry1);
        //
        // 第二次嘗試，給網路速度較慢的使用者
        await sleep(80);
        // 負向快取
        if(await redis.exists(tomb)) {
            return res.status(404).json({
                ok: false,
                error: "shortURL 不存在(redis)"
            });
        }
        // 正向快取
        const retry2 = await redis.get(key);
        // 有抓到快取的話，就進行重定向
        if (retry2) return res.redirect(302, retry2);

        // 最後防線，如果上面都抓不到的話，就直接判定為不存在
        return res.status(404).json({
            ok: false,
            error: "shortURL 不存在(redis)"
        })
    }

    try {
        // 如果redis沒有的話，到db查
        const query = await pool.query<{
            id:string;
            long_url:string;
            is_active:boolean;
            expire_at: string;
        }>(`SELECT id::text, long_url, is_active, expire_at FROM links WHERE code = $1 AND is_active = TRUE AND expire_at > now() LIMIT 1`, [code]);

        // 回傳多少筆資料。按照上面的query，結果只能是0和1
        if(query.rowCount === 0) {
            // 寫入負向快取
            await redis.set(`short404:${code}`, JSON.stringify({ reason: "NOT_FOUND_OR_INACTIVE_OR_EXPIRED" }), { EX: 60 });
            return res.status(404).json({
                ok: false,
                error: "shortURL 不存在(db)",
            })
        }

        // 從query中解構出id, long_url, is_active, expire_at等資料
        const { id, long_url, expire_at } = query.rows[0];

        // expire_at被pg傳出來時是字串，需要轉換為時間
        const expireAt = new Date(expire_at);

        // 驗證url是否存在
        const result = LongUrlSchema.safeParse(long_url);
        if (!result.success) {
            const msg = result.error.issues[0]?.message ?? "無效的URL";
            return res.status(400).json({
                ok: false,
                error: msg,
            });
        }

        const longUrl:string = result.data;

        let u2:URL;
        try {
            u2 = new URL(longUrl);
        } catch (err) {
            return res.status(500).json({
                ok: false,
                error: "非法的URL"
            });
        }

        // 限制url不能為內網/本機端的url
        const verdict2:boolean = await isForbiddenTarget(u2.hostname);
        if (verdict2) {
            return res.status(400).json({
                ok:false,
                error:"不允許的目標主機(資料庫)"
            });
        }

        // 把log紀錄寫入到link_log中
        writeLogToDB(req, id, "link被使用");

        // 轉換為秒，向上取整，確保ttl至少為1
        const ttl = Math.max(1, Math.ceil((expireAt.getTime() - Date.now()) / 1000));

        // 寫入redis
        await redis.setEx(key, ttl, longUrl);

        // 302轉址
        return res.redirect(302, longUrl)
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        return res.status(500).json({
            ok: false,
            error: msg
        })
    } finally {
        // 安全解鎖：只有持有相同 token 的程式才能刪這把鎖
        const unlockScript = `if redis.call("GET", KEYS[1]) == ARGV[1] then
            return redis.call("DEL", KEYS[1])
            else
            return 0
            end`;
        try {
            await redis.eval(unlockScript, { keys: [lockKey], arguments: [token] });
        } catch { /* 忽略解鎖錯誤，不影響回應 */ }
    }
}

// [api] 查詢所有短網址
export const getAllLinks = async (req: Request, res: Response) => {
    try {
        // 保底數字
        const rawPage:number = Number(req.query.page ?? 1);
        const rawPageSize:number = Number(req.query.pageSize ?? 30);

        // .isFinite 判斷是否為有限值
        const page:number = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
        const clamped:number =
            Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.floor(rawPageSize) : 30;
        const pageSize:number = Math.min(Math.max(1, clamped), 200);

        // 參數同於true，才是true，不等於的話，就是false
        const includeExpired:boolean = req.query.inCludeExoired === "true";
        const includeInactive:boolean = req.query.inActive === "true";

        const offset:number = (page - 1) * pageSize;

        // 動態條件
        const condition:string[] = [];
        if(!includeExpired) {
            // 過濾掉過期的link
            condition.push(`expire_at > now()`);
        }
        if(!includeInactive) {
            // 過濾掉停用的link
            condition.push(`is_active = TRUE`);
        }

        const whereSql:string = condition.length ? `WHERE ${condition.join(" AND ")}` : "";
        const sql = `SELECT id::text, code, long_url, created_at, expire_at, is_active, COUNT(*) OVER() AS total_count FROM links ${whereSql} ORDER BY created_at DESC LIMIT $1 OFFSET $2;`;

        const query = await pool.query<Link>(sql, [pageSize, offset]);

        // 計算總數
        const total = query.rowCount ? Number(query.rows[0].total_count) : 0;

        // 因為是要回傳新陣列(api回應)，所以用map，而不是forEach
        const data = query.rows.map((r:Link) => {
            const code = r.code;
            // 組成shortURL
            const shortUrl:string = new URL(`/${code}`, SHORT_BASE_URL).toString();

            return {
                id:r.id,
                shortUrl:shortUrl,
                longUrl: r.long_url,
                createdAt: r.created_at,
                expireAt: r.expire_at,
                isActive: r.is_active as boolean,
            }
        });
        // 200 表示伺服器已完成請求。沒有改變伺服器的狀態
        return res.status(200).json({
            ok: true,
            page: page,
            pageSize: pageSize,
            total: total,
            hasMore: page * pageSize < total, // 判斷是否有更多資料
            data: data
        })
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        return res.status(500).json({
            ok: false,
            error: msg
        })
    }
}

// [api] 刪除link
export const deleteLink = async (req: Request, res: Response) => {
    try {
        // const id:number = Number(req.params.id);
        // // isFinite 判斷是否為有限數
        // // infinity 正無限
        // // -infinity 負無限
        // // Nan 非數字
        // if (!Number.isFinite(id) || id <= 0) {
        //     // 400 表示伺服器無法理解client的請求，因為請求的格式、內容有問題
        //     return res.status(400).json({
        //         ok: false,
        //         error: "id 必須是正整數"
        //     });
        // }

        // trim 前掉字串的前後空白
        // 改用字串取得參數，避免字串長度超過number
        const id = (req.params.id ?? "").trim();
        // 檢查id是否為正整數
        if (!/^\d+$/.test(id)) {
            return res.status(400).json({
                ok: false,
                error: "id 必須是正整數"
            });
        }

        // id::BIGINT 把字串的型別強制轉成bigint
        const query = await pool.query(`DELETE FROM links WHERE id = $1::BIGINT`, [id]);
        // rowCount會返回0或1。1表示有查詢到該筆資料，而0則表示沒有找到資料
        // 檢驗數據是否真的有被刪除
        if(query.rowCount === 0) {
            return res.status(404).json({
                ok: false,
                err:`${id} 不存在`
            })
        }

        // 寫入log紀錄
        writeLogToDB(req, String(id), `已刪除 ${id}`);

        // 204 表示請求已處理成功，但不會回傳任何資料
        // 但這邊還是改回 200
        return res.status(200).json({
            ok: true,
            msg:`已刪除 ${id}`
        })
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // 500 表示伺服器遇到錯誤，無法完成請求，是通用的錯誤處理代碼
        return res.status(500).json({
            ok: false,
            err: msg
        })
    }
}

// [api] 停用link
// [2025/11/06完成] 補上停用link時，要刪掉redis中的快取紀錄
export const deactivateLink = async (req: Request, res: Response) => {
    try {
        const id = (req.params.id ?? "").trim();

        if (!/^\d+$/.test(id)) {
            return res.status(400).json({
                ok: false,
                err: "id 必須是正整數"
            })
        }

        const query = await pool.query<{ code:string }>(`UPDATE links SET is_active = FALSE WHERE id = $1::BIGINT AND expire_at > now() AND is_active = TRUE RETURNING code;`, [id]);
        // 成功更新
        if(query.rowCount === 1) {
            // 寫入log紀錄
            writeLogToDB(req, id, `${id} link停用`);
            // 刪除快取
            await redis.del(`short:${query.rows[0].code}`);
            return res.status(200).json({
                ok: true,
                msg: `${id} 已停用`
            })
        }

        // 出現錯誤，開始第二段查詢，找出錯誤原因，並回傳正確的錯誤訊息
        const query_2 = await pool.query<{ is_active: boolean; expire_at: string }>(`SELECT is_active, expire_at FROM links WHERE id = $1::BIGINT LIMIT 1;`, [id]);

        // 不存在
        if(query_2.rowCount === 0) {
            return res.status(404).json({
                ok: false,
                err:`${id} 不存在`
            })
        }

        const { is_active, expire_at } = query_2.rows[0];

        // 已停用
        if (!is_active) {
            return res.status(409).json({
                ok: false,
                err: `id=${id} 已是停用狀態`
            });
        }

        // 已過期
        if (new Date(expire_at) <= new Date()) {
            return res.status(410).json({
                ok: false,
                err: `id=${id} 已過期`
            });
        }

        return res.status(409).json({
            ok: false,
            msg: `${id} 無法停用`
        })
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return res.status(500).json({
            ok: false,
            err: msg
        })
    }
}
