// auth.controllers.ts
import e, {Request, Response} from "express";
import type {PoolClient} from "pg";
import {pool} from "../pool";
import redis from "../redis/redisClient";
import {jwtProvider} from "../utils/jwtProvider";
import {redisProvider} from "../utils/redisProvider";
import {registerSchema, loginSchema} from "../zod/auth.schema";
import * as crypto from "node:crypto";
import bcrypt from "bcrypt";

const jwtAuthTool = new jwtProvider();
const redisAuthTool = new redisProvider();

// [api] 註冊功能
// 把email, password, nickname等資料存到user table中，建立使用者帳號，同時將user_id和role_id存到user_role table中，將使用者帳號與角色進行關聯，預設的角色是user
// 高併發: 在同一個時間下，有複數使用者用相同的email或nickname，會觸發unique唯一性的問題，然後會返回23505
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
        const msg = result.error.issues[0]?.message ?? "無效的註冊資料"
        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }
    const {email, nickname, password} = result.data;
    //
    let client: PoolClient | undefined;
    try {
        // 使用 bcrypt 產生密碼雜湊（約 60 字元長度）
        // 這邊不用sha-256雜湊的原因是，password通常比較短、好猜，所以要改用bcrypt加密
        // bcrypt計算速度較慢，因為要把password變成不好猜中的密文
        const passwordHash:string = await bcrypt.hash(password, 10);
        // 從pool中獲取一個獨立且連續的資料庫連線
        client = await pool.connect();
        // email, nickname的檢查，由資料庫負責，通過unique的唯一性
        // // 檢查user table中的email是否有相同資料
        // const emailExists = await client.query<{email:string}>('SELECT email FROM users WHERE email = $1', [email]);
        // if (emailExists.rowCount !== 0) {
        //     return res.status(409).json({
        //         ok: false,
        //         error: "Email 已經被註冊過!",
        //     })
        // }
        // // 檢查user table中的nickname是否有相同資料
        // const nicknameExists = await client.query<{nickname:string}>('SELECT nickname FROM users WHERE nickname = $1', [nickname]);
        // if (nicknameExists.rowCount !== 0) {
        //     return res.status(409).json({
        //         ok: false,
        //         error: "暱稱已經被使用!"
        //     })
        // }
        // 預設角色是user，所以這邊就是查user的id
        // [標註] 優化點: 可以把role的資料，寫入到redis中。這我覺得可以，之後來優化
        const role = await client.query<{id:number}>('SELECT id FROM role WHERE type = $1', ['user']);
        if (role.rowCount === 0) {
            return res.status(409).json({
                ok: false,
                error: "角色 user 尚未在role table建立"
            })
        }
        // [] 開始交易
        // 交易的特性是，如果過程失敗了，就直接結束
        await client.query('BEGIN');
        // 把email, password, nickname等資料存到user table
        const user = await client.query<{id:number, email:string, nickname:string}>('INSERT INTO users(email, password_hash, nickname) VALUES ($1, $2, $3) RETURNING id, email, nickname', [email, passwordHash, nickname]);
        const userId:number = user.rows[0].id;
        const roleId:number = role.rows[0].id;
        // 把user_id, role_id存到user_role table
        // 不需要接回傳值，可以直接這樣寫
        await client.query('INSERT INTO user_role(user_id, role_id) VALUES ($1, $2)', [userId, roleId]);
        // [] 交易結束
        await client.query('COMMIT')

        // 200 表示請求成功
        // 201 表示成功創建新資源
        // 所以這邊用201
        return res.status(201).json({
            ok: true,
            message: `${nickname} 使用者註冊成功`,
            user: user.rows[0] // 回傳user id, email, nickname
        })
    } catch (err:any) {
        if (client) {
            // 多包一層try catch是為了讓finally可以被執行
            // 如果沒有包的話，會停留在catch上
            // 這樣就不能釋放pool的連線資源
            try {
                await client.query('ROLLBACK');
            } catch {}
        }
        // 違反唯一鍵，會返回23505
        if (err && err.code === "23505") {
            // 通過constraint名稱決定是哪一種錯誤
            const constraint:string = err.constraint ?? "";
            if (constraint === "users_email_uk") {
                return res.status(409).json({ ok: false, error: "Email 已經被註冊過!" });
            }
            if (constraint === "users_nickname_uk") {
                return res.status(409).json({ ok: false, error: "暱稱已經被使用!" });
            }
            return res.status(409).json({ ok: false, error: "使用者資料已存在，請勿重複註冊!" });
        }
        // 把error轉成string
        const msg = err instanceof Error ? err.message : String(err);
        // 回傳錯誤訊息給伺服器
        // [標記] 日後改用logger，在替換掉就好
        console.error("[api:auth/register] error:", msg, err);
        return res.status(500).json({
            ok: false,
            error: "伺服器內部錯誤，註冊失敗，請重新註冊!"
        })
    } finally {
        // 釋放連線資源
        if (client) client.release();
    }
}

// [api] 登入功能
export const login = async (req: Request, res: Response) => {
    // 把res.body解包，送進去loginSchema檢查，有沒有符合規範
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
        const message = result.error.issues[0]?.message ?? "無效的登入資料";
        // 400 請求內容不正確
        return res.status(400).json({
            ok: false,
            error: message
        })
    }
    const {email, password} = result.data;
    //
    let expiresAt;
    let tokenMaxAge = 7 * 24 * 60 * 60 * 1000; // 預設 7 天（毫秒）
    try {
        // 查user
        const user = await pool.query('SELECT id, email, password_hash, nickname FROM users WHERE email = $1 AND is_active = TRUE', [email]);
        // 檢查user是否存在
        if (user.rowCount === 0) {
            return res.status(401).json({
                ok: false,
                error: `帳號不存在，請重新輸入帳號`
            })
        }
        // 把user的資料解包出來
        const {id, password_hash, nickname, email: userEmail } = user.rows[0];
        // 比對密碼
        const passwordCheck:boolean = await bcrypt.compare(password, password_hash);
        if (!passwordCheck) {
            return res.status(401).json({
                ok: false,
                error: "密碼錯誤，請重新輸入密碼"
            })
        }
        // 取得user的role
        const userRole = await pool.query<{type:string}>('SELECT r.type FROM role r JOIN user_role ur ON r.id = ur.role_id WHERE ur.user_id = $1', [id]);
        // 檢查user的role是否有設定
        if (userRole.rowCount === 0) {
            console.error(`[auth/login] user ${id} 找不到角色`);
            return res.status(401).json({
                ok: false,
                error: "系統錯誤，請稍後再試"
            })
        }
        // 拿出user的role_type
        const userRoleType:string = userRole.rows[0].type;
        // 發行jwt
        const accessToken = jwtAuthTool.generateAccessToken({
            id:id, name:nickname, email:userEmail, role:userRoleType
        });
        const refreshToken = jwtAuthTool.generateRefreshToken(id);
        // 把refreshToken加密
        const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
        // 解析refreshToken的exp
        const decode = jwtAuthTool.verifyToken(refreshToken, "refresh");
        const exp = decode.claims?.exp;
        //
        if (typeof exp === "number") {
            expiresAt = new Date(exp * 1000).toUTCString();
            //
            tokenMaxAge = exp * 1000 - Date.now();
        } else {
            console.error("[api:auth/login] 無法解析refreshToken中的exp", decode);
            return res.status(500).json({
                ok: false,
                error: "登入流程錯誤，請稍後再試",
            })
        }
        // 準備設備資料
        const userAgent = req.get("user-agent") ?? null;
        // [標註] 這個ip取得法，好像會有問題，但先暫時這樣
        const userIp = req.ip;
        const lastUsedAt = new Date();
        // [標註] 要了解user_agent的資料
        // console.log(userAgent);
        // [標註] 清理過期的refreshToken(有需要在登入做這件事情嗎?感覺做成背景任務更好)
        await pool.query('DELETE FROM refresh_token WHERE user_id = $1 AND expires_at < now()', [id]);
        // 把refreshTokenHash存到refresh_token table中
        await pool.query('INSERT INTO refresh_token(user_id, refresh_token_hash, user_agent, ip_address, expires_at, device_info, last_used_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [id, refreshTokenHash, userAgent, userIp, expiresAt, "", lastUsedAt]);
        // 更新最後登入時間
        await pool.query('UPDATE users SET last_login_at = $1 WHERE id = $2', [lastUsedAt, id]);
        // 8) 設置 cookie
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true, // 防止XSS攻擊
            secure: process.env.NODE_ENV === "production",
            maxAge: tokenMaxAge, // token過期時間
            sameSite: "lax", // 防止CSRF攻擊
            path: "/",
        });
        return res.status(200).json({
            ok: true,
            message: `${nickname} 使用者登入成功`,
            accessToken,
            user: {
                id:id,
                email: userEmail,
                name:nickname,
                role: userRoleType,
            },
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[api:auth/login] error:", msg, err);
        return res.status(500).json({
            ok: false,
            error: "伺服器內部錯誤，登入失敗，請稍後再試",
        });
    }
}