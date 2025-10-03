import { Request } from "express";
import { pool} from "../pool";

export function writeLogToDB (req:Request, id:string, info:string):void {
    const log = {
        ip:req.ip ?? null,
        ua:req.get("user-agent") ?? null, // 判斷使用者的瀏覽器、作業系統
        referer:req.get("referer") ?? null, // 判斷使用者從哪裡來
        path: req.originalUrl,
        at: new Date().toISOString(),
    };

    pool.query(`INSERT INTO link_logs (link_id, log_info) VALUES ($1::BIGINT, $2::JSONB)`, [id, log]).catch(() => {});
}