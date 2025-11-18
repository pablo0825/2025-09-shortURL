// auth.controllers.ts
import {Request, Response} from "express";
import type {PoolClient} from "pg";
import {pool} from "../pool";
import redis from "../redis/redisClient";
import {jwtProvider} from "../utils/jwtProvider";
import {redisProvider} from "../utils/redisProvider";
import {registerSchema} from "../zod/auth.schema";
import * as crypto from "node:crypto";

const jwtAuthTool = new jwtProvider();
const redisAuthTool = new redisProvider();

// [api] 登入功能
// [未完成]
export const register = async (req: Request, res: Response) => {
    // parse和safeParse的差別在於，是否信任資料來源
    // 信任的話，用parse; 不信任的話，用safeParse
    // parse，資料有效，就回傳驗證後的資烙; 資料無效，就拋出zodError
    // safeParse，資料有限，回傳{ success: true, data: T }; 資料無效，就回傳{ success: false, error: ZodError }
    // 這邊用safeParse，因為這筆資料是從使用者端傳入
    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
        // .issues 這個陣列中包含所有驗證失敗的資訊
        // ?.message 用?檢查issues[0]是否不存在，或是為null或undefined
        // ?? 運算式，左側為空的話，則回傳右側值
        const msg = result.error.issues[0]?.message ?? "無效的使用者登入資料"
        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }
    const {email, nickname, password} = result.data;
    // 檢查user table中的email是否有相同資料
    const emailExists = await pool.query<{email:string}>('SELECT email FROM users WHERE email = $1', [email]);
    if (emailExists.rowCount !== 0) {
        return res.status(409).json({
            ok: false,
            error: "Email 已經被註冊過!",
        })
    }
    // 檢查user table中的nickname是否有相同資料
    const nicknameExists = await pool.query<{nickname:string}>('SELECT nickname FROM users WHERE email = $1', [nickname]);
    if (nicknameExists.rowCount !== 0) {
        return res.status(409).json({
            ok: false,
            error: "暱稱已經被使用!"
        })
    }
    // 把password加密成16進制的64個字元
    const passwordHash = crypto.createHash("sha256").update(password).digest("hex");

}