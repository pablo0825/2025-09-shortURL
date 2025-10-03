// controllers.ts
import { Request, Response } from "express";
import type { PoolClient} from "pg";
import { pool } from "../pool";
import { Base62 } from "../utils/base62";
import { Link } from "../type/types";
import { longUrlSchema } from "../zod/longUrl.schema";
import { writeLogToDB } from "../utils/witeLogToDB";

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

       const ip:string | null = req.ip ?? null;

       // 從pool中獲取一個獨立且連續的資料庫連線
        // 開始交易
        client = await pool.connect();
        await client.query('BEGIN');

        // 一次性寫法，但遇到不知道怎麼解決的bug
        // // 查詢links中的id欄位，並將回傳值取名為seq
        // // 查詢序列名稱
        // const seqNameResult = await client.query(`SELECT pg_get_serial_sequence('links', 'id') AS seq`);
        // // ??運算式，左側為null，則給右值；左側有值，則給左值
        // const seqName = seqNameResult.rows[0]?.seq ?? "links_id_seq";
        //
        // // 用序列名稱產生唯一值
        // const rSeq = await client.query<{ id: string }>(`SELECT nextval($1) AS id`, [seqName]);
        // const id = BigInt(rSeq.rows[0].id);
        // const code = base62.encode10to62(id);
        //
        // // 將資料插入到links，然後回傳code值
        // const r2 = await client.query<{ code: string }>(
        //     `INSERT INTO links (id, code, long_url, creator_ip) OVERRIDING SYSTEM VALUE
        //      VALUES ($1::BIGINT, $2, $3, $4::INET)
        //      RETURNING code`,
        //     [id.toString(), code, longUrl, ip ?? null]
        // );

        // 把longURL, ip插入到links，回傳id
        const ins = await client.query<{ id:string }>(`INSERT INTO links (long_url, creator_ip) VALUES ($1, $2::INET) RETURNING id`, [result.data, ip ?? null]);

        const id = BigInt(ins.rows[0].id);
        const code = base62.encode10to62(id);

        // 把code, short_url, id更新到links，回傳code
        const upd = await client.query<{ code: string }>(
            `UPDATE links SET code = $1 WHERE id = $2::BIGINT RETURNING code`,
            [code, id.toString()]
        );

        // 提交交易 (成功寫入資料到資料庫)
        await client.query("COMMIT");

        // 組成shortURL
        const shortUrl:string = new URL(`/${code}`, SHORT_BASE_URL).toString();
        // 寫入log紀錄
        writeLogToDB(req, String(id), `新增link ${shortUrl}`);


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

export const redirectToLongUrl = async (req: Request, res: Response) => {
    const code = req.params.code ?? "";
    if(!code) {
        return res.status(400).send("short_code是必須的");
    }

    try {
        const query = await pool.query<{
            id:string;
            long_trl:string;
            is_active:boolean;
            expire_at: Date;
        }>(`SELECT id::text, long_url, is_active, expire_at FROM links WHERE code = $1 AND is_active = TRUE AND expire_at > now() LIMIT 1`, [code]);

        // 回傳多少筆資料。按照上面的query，結果只能是0和1
        if(query.rowCount === 0) {
            return res.status(404).json({
                ok: false,
                error: "shortURL 不存在",
            })
        }

        const { id, long_trl, is_active, expire_at } = query.rows[0];

        if(!is_active) {
            return res.status(403).json({
                ok: false,
                error:"shortURL 已停用"
            })
        }
        if(new Date(expire_at) <= new Date()) {
            return res.status(410).json({
                ok: false,
                error:"shortURL 已過期"
            })
        }

        // 把log紀錄寫入到link_log中
        writeLogToDB(req, id, "link被使用");

        // 302轉址
        return res.redirect(302, long_trl)
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        return res.status(500).json({
            ok: false,
            error: msg
        })
    }
}

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

export const deactivateLink = async (req: Request, res: Response) => {
    try {
        const id = (req.params.id ?? "").trim();
        if (!/^\d+$/.test(id)) {
            return res.status(400).json({
                ok: false,
                err: "id 必須是正整數"
            })
        }

        const query = await pool.query(`UPDATE links SET is_active = FALSE WHERE id = $1::BIGINT AND expire_at > now();`, [id]);
        // 成功更新
        if(query.rowCount === 1) {
            // 寫入log紀錄
            writeLogToDB(req, id, `${id} link停用`);

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
