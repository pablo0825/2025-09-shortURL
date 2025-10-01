// controllers.ts
import { Request, Response } from "express";
import type { PoolClient} from "pg";
import { pool } from "../pool";
import { Base62 } from "../utils/base62";
import { Link, LinkLog } from "../type/types";
import { longUrlSchema } from "../zod/longUrl.schema";

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

export const handleCreateShortUrl = async (req: Request, res: Response) => {
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
        const ins = await client.query<{ id:string }>(`INSERT INTO links (long_url, creator_ip) VALUES ($1, $2::INET) RETURNING id`, [result, ip ?? null]);

        const id = BigInt(ins.rows[0].id);
        const code = base62.encode10to62(id);

        // 把code, id更新到links，回傳code
        const upd = await client.query<{ code: string }>(
            `UPDATE links SET code = $1 WHERE id = $2::BIGINT RETURNING code`,
            [code, id.toString()]
        );

        // 提交交易 (成功寫入資料到資料庫)
        await client.query("COMMIT");

        // 組成shortURL
        const shortUrl:string = new URL(`/${code}`, SHORT_BASE_URL).toString();

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