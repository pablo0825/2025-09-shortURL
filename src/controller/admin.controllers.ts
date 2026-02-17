// admin.controllers.ts
import express, {Request, Response} from "express";
import type {PoolClient} from "pg";
import {pool} from "../pool";
import {writeAdminAuditLogToDb} from "../utils/writeAdminAuditLogToDb";
import {usersListSchema, userIdSchema, userRoleSchema, roleItemArraySchema, userRoleIdSchema} from "../zod/admin.schema";
import {AuditRequestMethod, AuditStatus, AuditTargetType}  from "../enum/audit";
import {PermissionTreeNode, RoleItem, SessionListItem} from "../type/types";
import multer from "multer";
import {handleAccessTokenBlackList} from "../utils/handleAccessTokenBlackList";
import {writeUserLogToDB} from "../utils/writeUserLogToDB";
import {UserLogActionEnum} from "../enum/userLogAction.enum";
import redis from "../redis/redisClient";

export const getUsers = async (req: Request, res: Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg:string = userIdParams.error.issues[0]?.message ?? "未登入";
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const userId:number = userIdParams.data;

    const userRoleParams = userRoleSchema.safeParse(req.user?.role);

    if(!userRoleParams.success) {
        const msg:string = userRoleParams.error.issues[0]?.message ?? "權限不足";
        return res.status(403).json({
            ok: false,
            error: msg,
        });
    }

    const userRole:"admin" | "assistant" = userRoleParams.data;

    const parsed = usersListSchema.safeParse(req.query);

    if (!parsed.success) {
        const msg:string = parsed.error.issues[0]?.message ?? "參數格式有誤";
        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }

    // 去掉 role 參數
    const {page, limit, sortBy, sortOrder, q, twofa_enabled, includeInactive} = parsed.data;

    // 決定要跳過幾筆資料，像是 (1-1=0)*30, (2-1=1)*30
    const offset:number = (page - 1) * limit;

    const conditions:string[] = [];
    const values: Array<string | number | boolean> = [];
    // sql 參數編號(動態)
    let idx = 1;

    if (twofa_enabled !== undefined) {
        conditions.push(`twofa_enabled = $${idx}`);
        values.push(twofa_enabled);
        idx++;
    }
    if (!includeInactive) conditions.push(`is_active = TRUE`);
    if (q) {
        conditions.push(`(email ILIKE $${idx} OR nickname ILIKE $${idx})`);
        values.push(`%${q}%`);
        idx++;
    }
    // [問題] 因為在查使用者資料，沒辦法順便查role，所以這個篩選條件變得有問題
    // if (role) {
    //     conditions.push(`role = $${idx}`);
    //     values.push(role);
    //     idx++;
    // }

    const whereSql:string =conditions.length ? `WHERE ${conditions.join(" AND ")}`: "";
    // 若要更安全，可用白名單
    // 這邊其實有點沒必要，因為在zod就有做過一次驗證了
    const sortBySafe:"created_at" | "last_login_at" | "email" | "nickname" = ["created_at", "last_login_at", "email",
        "nickname"].includes(sortBy)
            ? sortBy
            : "created_at";
    const sortOrderSafe:"ASC" | "DESC" = sortOrder === "asc" ? "ASC" : "DESC";

    let client: PoolClient | undefined;

    try {
        client = await pool.connect();
        // [Transaction] 開啟交易
        await client.query('BEGIN');

        // 1) 查總數
        const countSql = `SELECT COUNT(*)::int AS total FROM users ${whereSql}`;
        const countResult = await client.query<{ total: number }>(countSql, values);

        // 2) 查使用者資料
        // 為避免資料飄移，加上 id 作為定錨
        // 因為可能會有同個 created_at，這樣就沒辦法判斷誰先誰後
        // [問題] 在下面這段sql查詢中，沒辦法用join，可能是拼太多字串的關係
        // 需要再額外查詢一次，user role，然後再合併資料
        const usersSql = `SELECT u.id, u.email, u.nickname, u.is_active, u.last_login_at, u.twofa_enabled FROM users u ${whereSql} ORDER BY u.${sortBySafe} ${sortOrderSafe}, u.id ${sortOrderSafe} LIMIT $${idx} OFFSET $${idx + 1}`;

        const usersValues: Array<string | number | boolean> = [...values, limit, offset];

        const usersResult= await client.query<{
            id:number,
            email:string,
            nickname:string,
            is_active:boolean,
            last_login_at:string | null,
            twofa_enabled:boolean
        }>(usersSql, usersValues);

        const users = usersResult.rows;
        const userIds:number[] = users.map((u) => u.id);

        let roleMap = new Map<number, string[]>();

        // 3) 查角色
        if (userIds.length > 0) {
            //  ur.user_id = ANY() 表示 ur.user_id 等於陣列中的任一值
            // $1 佔位符
            // ::int[] 表示參數是 int陣列
            const roleSql = `SELECT ur.user_id, r.type FROM user_role ur JOIN role r ON r.id = ur.role_id WHERE ur.user_id = ANY($1::int[])`;

            const roleResult = await client.query<{ user_id: number; type: string }>(roleSql, [userIds]);

            roleMap = roleResult.rows.reduce((map, row) => {
                // 先拿已有的角色陣列(這個是為了處理多角色的情境)，沒有的話就用空陣列
                const current = map.get(row.user_id) ?? [];
                // 把 type 推到 current裡面
                current.push(row.type);
                // 把 id, type 存到 map中
                map.set(row.user_id, current);

                //  <1, "user">
                return map;
            }, new Map<number, string[]>())
        }

        // 4) 合併資料
        // 使用者列表資料
        // 箭頭函式 => {} 預設會被當成函式主體，而不是物件值
        // 但我這邊要的是，直接回傳一個物件，所以需要在加上()
        const data = users.map((u) => ({
            ...u,
            // 取 key 的值
            role: roleMap.get(u.id) ?? [],
        }));

        //  計算總數
        const total:number = countResult.rows[0]?.total ?? 0;
        // 計算有幾頁
        const totalPages:number =  Math.ceil(total / limit);

        // [Transaction] 交易成功
        await client.query("COMMIT");

        // 200 表示伺服器已完成請求。沒有改變伺服器的狀態
        res.status(200).json({
            ok: true,
            data: data,
            pagination: {
                page,
                limit,
                total,
                totalPages,
            }
        })

        const input = {
            actorUserId:userId,
            actorRole:userRole,
            action:"get_users",
            targetType:AuditTargetType.User,
            targetId: null,
            targetDisplay:"",
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.GET,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: {} // diff 檢查前後變化的物件，所以 getUsers 可以不用填
        }

        // 讀取使用者列表，不是重要操作，audit log 的寫入可以放在最後
        await writeAdminAuditLogToDb(input);

        return ;
    } catch (err) {
        if (client) {
            // 多包一層try catch是為了讓finally可以被執行
            // 如果沒有包的話，會停留在catch上
            // 這樣就不能釋放pool的連線資源
            try {
                await client.query('ROLLBACK');
            } catch {}
        }

        const msg = err instanceof Error ? err.message : String(err);

        console.error("[api:admin/getUsers] error:", msg, err);

        res.status(500).json({
            ok: false,
            error: "系統錯誤"
        })

        const input = {
            actorUserId:userId,
            actorRole:userRole,
            action:"get_users",
            targetType:AuditTargetType.User,
            targetId: null,
            targetDisplay:"",
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.GET,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: {}
        }

        // 讀取使用者列表，不是重要操作，audit log 的寫入可以放在最後
        await writeAdminAuditLogToDb(input);

        return ;
    } finally {
        if (client) client.release();
    }
}

export const getUser = async(req:Request, res:Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg:string = userIdParams.error.issues[0]?.message ?? "未登入";
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const userId:number = userIdParams.data;

    const userRoleParams = userRoleSchema.safeParse(req.user?.role);

    if(!userRoleParams.success) {
        const msg:string = userRoleParams.error.issues[0]?.message ?? "權限不足";
        return res.status(403).json({
            ok: false,
            error: msg,
        });
    }

    const userRole:"admin" | "assistant" = userRoleParams.data;

    const targetIdParams = userIdSchema.safeParse(req.params.id);

    if (!targetIdParams.success) {
        const msg:string = targetIdParams.error.issues[0]?.message ?? "非法id";
        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }

    const targetId = targetIdParams.data;

    try {
        // join 和 left join 的差別是，join 需要兩邊資料完全對上，才會顯示。left join則是不一定需要資料完全對上，也可以顯示
        // 有多筆 r.type 的話，需要把它們整理成陣列，也就是弄成同一筆
        // arrau_agg(r.type) 把同一個 user 的多筆 r.type 聚成陣列
        // FILTER (WHERE r.type IS NOT NULL) 只聚合非 null 的值
        // COALESCE(..., '{}') 前面的結果是null，就改用{}
        const userResult = await pool.query<{
            id:number,
            email:string,
            nickname:string,
            phone: string | null,
            unit:string | null,
            job_title:string | null,
            is_active:boolean,
            avatar_key:string | null,
            updated_at:string | null,
            last_login_at:string | null,
            twofa_enabled:boolean,
            twofa_enabled_at:string | null,
            deleted_at:string | null,
            role:string[]
        }>(`SELECT u.id, u.email, u.nickname, u.phone, u.unit, u.job_title, u.is_active, u.avatar_key, u.updated_at, u.last_login_at, u.twofa_enabled, u.twofa_enabled_at, u.deleted_at, COALESCE(array_agg(r.type) FILTER (WHERE r.type IS NOT NULL), '{}') AS role FROM users u LEFT JOIN user_role ur ON ur.user_id = u.id LEFT JOIN role r ON r.id = ur.role_id WHERE u.id = $1 GROUP BY u.id, u.email`, [targetId]);

        if (userResult.rowCount === 0) {
            return res.status(404).json({
                ok: false,
                error:"使用者不存在或資料異常"
            })
        }

        // 200 表示伺服器已完成請求。沒有改變伺服器的狀態
        res.status(200).json({
            ok: true,
            data: userResult.rows[0],
        })

        const input = {
            actorUserId:userId,
            actorRole:userRole,
            action:"get_user",
            targetType:AuditTargetType.User,
            targetId: targetId,
            targetDisplay:"",
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.GET,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: {} // diff 檢查前後變化的物件，所以 getUsers 可以不用填
        }

        // 讀取使用者列表，不是重要操作，audit log 的寫入可以放在最後
        await writeAdminAuditLogToDb(input);

        return;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        console.error("[api:admin/getUser] error:", msg, err);

        res.status(500).json({
            ok: false,
            error: "系統錯誤"
        })

        const input = {
            actorUserId:userId,
            actorRole:userRole,
            action:"get_user",
            targetType:AuditTargetType.User,
            targetId: targetId,
            targetDisplay:"",
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.GET,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: {}
        }

        // 讀取使用者列表，不是重要操作，audit log 的寫入可以放在最後
        await writeAdminAuditLogToDb(input);

        return;
    }
}

// 取得指定使用者的 sessions
export const getUserSessions = async(req:Request, res:Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg:string = userIdParams.error.issues[0]?.message ?? "未登入";
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const userId:number = userIdParams.data;

    const userRoleParams = userRoleSchema.safeParse(req.user?.role);

    if(!userRoleParams.success) {
        const msg:string = userRoleParams.error.issues[0]?.message ?? "權限不足";
        return res.status(403).json({
            ok: false,
            error: msg,
        });
    }

    const userRole:"admin" | "assistant" = userRoleParams.data;

    const targetIdParams = userIdSchema.safeParse(req.params.id);

    if (!targetIdParams.success) {
        const msg:string = targetIdParams.error.issues[0]?.message ?? "非法id";
        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }

    const targetId = targetIdParams.data;

    try {
        // 用 last_seen_at, id 穩定資料，讓每次回傳順序相同
        // nulls last 是指，把 last_seen_at 為 null 的值，放在最後
        const sessionResult = await pool.query<{
            id:number;
            last_seen_at:Date | null;
            expires_at:Date;
            user_agent:string | null;
            ip_address:string | null;
            device_info:string | null;
        }>('SELECT id, last_seen_at, expires_at, user_agent, ip_address, device_info FROM session WHERE user_id = $1 AND revoked_at IS NULL ORDER BY last_seen_at DESC NULLS LAST , id DESC ', [targetId]);

        if (sessionResult.rowCount === 0) {
            return res.status(200).json({
                ok: true,
                message:"尚無裝置紀錄",
                data:[]
            })
        }

        let sessionList:SessionListItem[] = [];

        // 30天
        const inactiveMs = 30 * 24 * 60 * 60 * 1000;
        // 現在的時間
        const now = Date.now();
        // 最後登入的時間

        for (const sessionRow of sessionResult.rows ) {
            // 過期時間
            // 過期時間小於現在，等於已過期
            const isExpired:boolean = sessionRow.expires_at.getTime() < now;

            let status:"expired" | "inactive" | "active";

            if (isExpired) {
                status = "expired";
            } else if (!sessionRow.last_seen_at) {
                // last_seen_at 不存在的話，就直接把 status 設成inactive
                status = "inactive";
            } else {
                // 最後登入的時間
                const lastSeenMs = sessionRow.last_seen_at.getTime();

                status = now - lastSeenMs > inactiveMs ? "inactive" : "active";
            }

            sessionList.push({
                id: sessionRow.id,
                last_seen_at: sessionRow.last_seen_at,
                userAgent:sessionRow.user_agent,
                ip_address:sessionRow.ip_address,
                device_info:sessionRow.device_info,
                status: status,
            });
        }

        res.status(200).json({
            ok: true,
            message: `讀取 ${sessionList.length} 個裝置`,
            data: sessionList
        })

        const input = {
            actorUserId:userId,
            actorRole:userRole,
            action:"get_user_sessions",
            targetType:AuditTargetType.User,
            targetId: targetId,
            targetDisplay:"",
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.GET,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: {} // diff 檢查前後變化的物件，所以 getUsers 可以不用填
        }

        // 讀取使用者列表，不是重要操作，audit log 的寫入可以放在最後
        await writeAdminAuditLogToDb(input);

        return;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        console.error("[api:admin/getUserSessions] error:", msg, err);

        res.status(500).json({
            ok: false,
            error: "系統錯誤"
        })

        const input = {
            actorUserId:userId,
            actorRole:userRole,
            action:"get_user_sessions",
            targetType:AuditTargetType.User,
            targetId: targetId,
            targetDisplay:"",
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.GET,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: {}
        }

        // 讀取使用者列表，不是重要操作，audit log 的寫入可以放在最後
        await writeAdminAuditLogToDb(input);

        return;
    }
}

export const resetUser2FA = async (req:Request, res:Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg:string = userIdParams.error.issues[0]?.message ?? "未登入";
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const userId:number = userIdParams.data;

    const userRoleParams = userRoleSchema.safeParse(req.user?.role);

    if(!userRoleParams.success) {
        const msg:string = userRoleParams.error.issues[0]?.message ?? "權限不足";
        return res.status(403).json({
            ok: false,
            error: msg,
        });
    }

    const userRole:"admin" | "assistant" = userRoleParams.data;

    const targetIdParams = userIdSchema.safeParse(req.params.id);

    if (!targetIdParams.success) {
        const msg:string = targetIdParams.error.issues[0]?.message ?? "非法id";
        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }

    const targetId = targetIdParams.data;

    let client: PoolClient | undefined;

    try {
        client = await pool.connect();
        // [Transaction] 開啟交易
        await client.query('BEGIN');

        // 上鎖
        // 查詢 users table 中的 version
        const usersResult = await client.query<{
            twofa_backup_codes_version:number,
            twofa_enabled:boolean,
            twofa_enabled_at:string | null,
        }>('SELECT twofa_backup_codes_version, twofa_enabled, twofa_enabled_at FROM users WHERE id = $1 AND is_active = TRUE FOR UPDATE', [targetId]);

        const count:number = usersResult.rowCount ?? 0;

        if (count === 0) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                ok: false,
                error:"使用者不存在或資料異常"
            })
        }

        const oldVersion:number = usersResult.rows[0].twofa_backup_codes_version;

        // 更新 users table 中跟 2fa 有關的欄位
        const usersUpdate = await client.query<{
            twofa_backup_codes_version:number,
            twofa_enabled:boolean,
            twofa_enabled_at:string | null,
        }>('UPDATE users SET twofa_enabled = FALSE, twofa_secret_encrypted = NULL, twofa_secret_iv = NULL, twofa_secret_auth_tag = NULL, twofa_enabled_at = NULL, twofa_backup_codes_version = 0 WHERE id = $1 AND is_active = TRUE RETURNING twofa_enabled, twofa_enabled_at, twofa_backup_codes_version', [targetId]);

        const count2:number = usersUpdate.rowCount ?? 0;

        if (count2 === 0) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                ok: false,
                error:"使用者不存在或資料異常"
            })
        }

        // 撤銷所有 backup codes
        const backupCodeResult = await client.query('UPDATE user_backup_codes SET revoked_at = now() WHERE user_id = $1 AND version =$2 AND revoked_at IS NULL', [targetId, oldVersion]);

        // 撤銷所有 refresh token
        const refreshTokenResult = await client.query('UPDATE refresh_token SET revoked_at = now() WHERE user_id =$1 AND revoked_at IS NULL', [targetId]);

        // 撤銷所有 session
        const sessionResult = await client.query('UPDATE session SET revoked_at = now(), reason = $1 WHERE user_id = $2 AND revoked_at IS NULL', ["reset_user_2fa", targetId]);

        const oldTwofaEnabled:boolean = usersResult.rows[0].twofa_enabled;
        const oldTwofaEnabledAt:string | null = usersResult.rows[0].twofa_enabled_at;

        const newTwofaEnabled:boolean = usersUpdate.rows[0].twofa_enabled;
        const newTwofaEnabledAt:string | null = usersUpdate.rows[0].twofa_enabled_at
        const newVersion:number = usersUpdate.rows[0].twofa_backup_codes_version

        const input = {
            actorUserId:userId,
            actorRole:userRole,
            action:"reset_user_2fa",
            targetType:AuditTargetType.User,
            targetId: targetId,
            targetDisplay:"",
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.PATCH,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: {
                before: {
                    twofa_enabled: oldTwofaEnabled,
                    twofa_enabled_at: oldTwofaEnabledAt,
                    twofa_backup_codes_version: oldVersion
                },
                after: {
                    twofa_enabled: newTwofaEnabled,
                    twofa_enabled_at: newTwofaEnabledAt,
                    twofa_backup_codes_version: newVersion
                },
                affected: {
                    user_backup_codes_revoked: backupCodeResult.rowCount,
                    refresh_tokens_revoked: refreshTokenResult.rowCount,
                    sessions_revoked: sessionResult.rowCount
                }
            }
        }

        await writeAdminAuditLogToDb(input, client);

        // [Transaction] 交易成功
        await client.query("COMMIT");

        return  res.status(200).json({
            ok: true,
            message:`${targetId} 使用者的2fa驗證已停用`,
        })
    } catch (err) {
        if (client) {
            // 多包一層try catch是為了讓finally可以被執行
            // 如果沒有包的話，會停留在catch上
            // 這樣就不能釋放pool的連線資源
            try {
                await client.query('ROLLBACK');
            } catch {}
        }

        const msg = err instanceof Error ? err.message : String(err);

        console.error("[api:admin/resetUser2FA] error:", msg, err);

        res.status(500).json({
            ok: false,
            error: "系統錯誤"
        })

        const input = {
            actorUserId:userId,
            actorRole:userRole,
            action:"reset_user_2fa",
            targetType:AuditTargetType.User,
            targetId: targetId,
            targetDisplay:"",
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.PATCH,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: {}
        }

        // 讀取使用者列表，不是重要操作，audit log 的寫入可以放在最後
        await writeAdminAuditLogToDb(input);

        return ;
    } finally {
        if (client) client.release();
    }
}

export const deactivateUser = async(req: express.Request, res: express.Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg:string = userIdParams.error.issues[0]?.message ?? "未登入";
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const userId:number = userIdParams.data;

    const userRoleParams = userRoleSchema.safeParse(req.user?.role);

    if(!userRoleParams.success) {
        const msg:string = userRoleParams.error.issues[0]?.message ?? "權限不足";
        return res.status(403).json({
            ok: false,
            error: msg,
        });
    }

    const userRole:"admin" | "assistant" = userRoleParams.data;

    const targetIdParams = userIdSchema.safeParse(req.params.id);

    if (!targetIdParams.success) {
        const msg:string = targetIdParams.error.issues[0]?.message ?? "非法id";
        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }

    const targetId:number = targetIdParams.data;

    // 自我保護
    if (targetId === userId) {
        return res.status(403).json({
            ok: false,
            error: "admin 不能停用自己",
        });
    }

    let client: PoolClient | undefined;

    try {
        client = await pool.connect();
        // [Transaction] 開啟交易
        await client.query('BEGIN');

        // 更新 users table
        // 清除 users 底下的 2fa 欄位資料

        const userQuery = await client.query<{
            is_active:boolean,
            deleted_at:string | null,
            twofa_enabled:boolean,
            twofa_enabled_at:string | null,
            twofa_backup_codes_version:number,
        }>('SELECT is_active, deleted_at, twofa_enabled, twofa_enabled_at, twofa_backup_codes_version FROM users  WHERE id = $1 AND is_active = TRUE FOR UPDATE', [targetId]);

        const count:number = userQuery.rowCount ?? 0;

        if (count === 0) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                ok: false,
                error:"使用者不存在或資料異常"
            })
        }

        const userUpdate = await client.query<{
            is_active:boolean,
            deleted_at:string | null,
            twofa_enabled:boolean,
            twofa_enabled_at:string | null,
            twofa_backup_codes_version:number,
        }>('UPDATE users SET deleted_at = now(), is_active = FALSE, twofa_enabled = FALSE, twofa_secret_encrypted = NULL, twofa_secret_iv = NULL, twofa_secret_auth_tag = NULL, twofa_enabled_at = NULL, twofa_backup_codes_version = 0 WHERE id = $1 AND is_active = TRUE RETURNING is_active, deleted_at, twofa_enabled, twofa_enabled_at, twofa_backup_codes_version', [targetId]);

        const count2:number = userUpdate.rowCount ?? 0;

        if (count2 === 0) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                ok: false,
                error:"使用者不存在或資料異常"
            })
        }

        // 撤銷所有 backup codes
        // 不鎖定特定的 version ，在 user_id 底下的 backup code 全部強制撤銷
        const backupCodesResult = await client.query('UPDATE user_backup_codes SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [targetId]);

        // 撤銷所有 refresh token
        const refreshTokenResult = await client.query('UPDATE refresh_token SET revoked_at = now() WHERE user_id =$1 AND revoked_at IS NULL', [targetId]);

        // 撤銷所有 session
        const sessionResult = await client.query('UPDATE session SET revoked_at = now(), reason = $1 WHERE user_id = $2 AND revoked_at IS NULL', ["soft_delete", targetId]);

        const {is_active:oldIsActive, deleted_at:oldDeletedAt, twofa_backup_codes_version:oldBackupCodesVersion, twofa_enabled_at:oldTwofaEnabledAt, twofa_enabled:oldTwofaEnabled} = userQuery.rows[0];

        const {is_active:newIsActive, deleted_at:newDeletedAt, twofa_backup_codes_version:newBackupCodesVersion, twofa_enabled_at:newTwofaEnabledAt, twofa_enabled:newTwofaEnabled} = userUpdate.rows[0];

        const input = {
            actorUserId:userId,
            actorRole:userRole,
            action:"soft_delete_user",
            targetType:AuditTargetType.User,
            targetId: targetId,
            targetDisplay:"",
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.PATCH,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: {
                before: {
                    is_active: oldIsActive,
                    deleted_at: oldDeletedAt,
                    twofa_enabled: oldTwofaEnabled,
                    twofa_enabled_at: oldTwofaEnabledAt,
                    twofa_backup_codes_version: oldBackupCodesVersion
                },
                after: {
                    is_active: newIsActive,
                    deleted_at: newDeletedAt,
                    twofa_enabled: newTwofaEnabled,
                    twofa_enabled_at: newTwofaEnabledAt,
                    twofa_backup_codes_version: newBackupCodesVersion
                },
                affected: {
                    user_backup_codes_revoked: backupCodesResult.rowCount,
                    refresh_tokens_revoked: refreshTokenResult.rowCount,
                    sessions_revoked: sessionResult.rowCount
                },
                meta: {
                    reason: "soft_delete"
                }
            }
        }

        await writeAdminAuditLogToDb(input, client);

        // [Transaction] 交易成功
        await client.query("COMMIT");

        return  res.status(200).json({
            ok: true,
            message:`${targetId} 使用者帳號已刪除`,
        })
    } catch (err) {
        if (client) {
            // 多包一層try catch是為了讓finally可以被執行
            // 如果沒有包的話，會停留在catch上
            // 這樣就不能釋放pool的連線資源
            try {
                await client.query('ROLLBACK');
            } catch {}
        }

        const msg = err instanceof Error ? err.message : String(err);

        console.error("[api:admin/deactivateUser] error:", msg, err);

        res.status(500).json({
            ok: false,
            error: "系統錯誤"
        })

        const input = {
            actorUserId:userId,
            actorRole:userRole,
            action:"soft_delete_user",
            targetType:AuditTargetType.User,
            targetId: targetId,
            targetDisplay:"",
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.PATCH,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: {}
        }

        // 讀取使用者列表，不是重要操作，audit log 的寫入可以放在最後
        await writeAdminAuditLogToDb(input);

        return;
    } finally {
        if (client) client.release();
    }
}

export const restoreUser = async (req: express.Request, res: express.Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg:string = userIdParams.error.issues[0]?.message ?? "未登入";
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const userId:number = userIdParams.data;

    const userRoleParams = userRoleSchema.safeParse(req.user?.role);

    if(!userRoleParams.success) {
        const msg:string = userRoleParams.error.issues[0]?.message ?? "權限不足";
        return res.status(403).json({
            ok: false,
            error: msg,
        });
    }

    const userRole:"admin" | "assistant" = userRoleParams.data;

    const targetIdParams = userIdSchema.safeParse(req.params.id);

    if (!targetIdParams.success) {
        const msg:string = targetIdParams.error.issues[0]?.message ?? "非法id";
        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }

    const targetId:number = targetIdParams.data;

    let client: PoolClient | undefined;

    let errorStage:string | null = null;

    try {
        errorStage = "connect_db";
        client = await pool.connect();

        errorStage = "begin_transaction"
        // [Transaction] 開啟交易
        await client.query('BEGIN');


        errorStage = "select_before";
        const userQuery = await client.query<{
            is_active:boolean,
            deleted_at:string | null,
            twofa_enabled:boolean
        }>('SELECT is_active, deleted_at, twofa_enabled FROM users WHERE id = $1 AND is_active = FALSE FOR UPDATE', [targetId]);

        const count:number = userQuery.rowCount ?? 0;

        if (count === 0) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                ok: false,
                error:"使用者不存在或資料異常"
            })
        }

        errorStage = "update_users";
        const userUpdate = await client.query<{
            is_active:boolean,
            deleted_at:string | null,
            twofa_enabled:boolean
        }>('UPDATE users SET is_active = TRUE, deleted_at = NULL WHERE id = $1 AND is_active = FALSE RETURNING is_active, deleted_at, twofa_enabled', [targetId]);

        const count2:number = userUpdate.rowCount ?? 0;

        if (count2 === 0) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                ok: false,
                error:"使用者不存在或資料異常"
            })
        }

        const {is_active:oldIsActive, deleted_at:oldDeletedAt, twofa_enabled:oldTwofaEnabled} = userQuery.rows[0];
        const {is_active:newIsActive, deleted_at:newDeletedAt, twofa_enabled:newTwofaEnabled} = userUpdate.rows[0];

        const input = {
            actorUserId:userId,
            actorRole:userRole,
            action:"restore_user",
            targetType:AuditTargetType.User,
            targetId: targetId,
            targetDisplay:"",
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.PATCH,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: {
                before: {
                    is_active: oldIsActive,
                    deleted_at: oldDeletedAt,
                    twofa_enabled: oldTwofaEnabled
                },
                after: {
                    is_active: newIsActive,
                    deleted_at: newDeletedAt,
                    twofa_enabled: newTwofaEnabled
                },
                affected: {
                    users_updated: count2
                },
                meta: {
                    reason: "restore_user"
                }
            }
        }

        errorStage = "write_audit_success";
        await writeAdminAuditLogToDb(input, client);

        errorStage = "commit_transaction";
        // [Transaction] 交易成功
        await client.query("COMMIT");

        return  res.status(200).json({
            ok: true,
            message:`${targetId} 使用者帳號已恢復`,
        })
    } catch (err) {
        if (client) {
            // 多包一層try catch是為了讓finally可以被執行
            // 如果沒有包的話，會停留在catch上
            // 這樣就不能釋放pool的連線資源
            try {
                errorStage = "rollback_transaction";
                await client.query('ROLLBACK');
            } catch (rollbackErr) {
                errorStage = "rollback_failed";
                console.error("[api:admin/restoreUser] rollback failed:", rollbackErr);
            }
        }

        const msg = err instanceof Error ? err.message : String(err);

        console.error("[api:admin/restoreUser] error:", msg, err);

        res.status(500).json({
            ok: false,
            error: "系統錯誤"
        })

        const input = {
            actorUserId:userId,
            actorRole:userRole,
            action:"restore_user",
            targetType:AuditTargetType.User,
            targetId: targetId,
            targetDisplay:"",
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.PATCH,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: {
                meta: {
                    error_stage: errorStage
                }
            }
        }

        // 讀取使用者列表，不是重要操作，audit log 的寫入可以放在最後
        await writeAdminAuditLogToDb(input);

        return;
    } finally {
        if (client) client.release();
    }
}

export const getRoles = async (req: Request, res: Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg:string = userIdParams.error.issues[0]?.message ?? "未登入";
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const userId:number = userIdParams.data;

    const userRoleParams = userRoleSchema.safeParse(req.user?.role);

    if(!userRoleParams.success) {
        const msg:string = userRoleParams.error.issues[0]?.message ?? "權限不足";
        return res.status(403).json({
            ok: false,
            error: msg,
        });
    }

    const userRole:"admin" | "assistant" = userRoleParams.data;

    // 角色固定，加入快取
    const key = "admin:roles:list:v1";
    // 5分鐘過期
    const ttlSeconds = 300;

    let roles:RoleItem[] | null = null;

    try {
        const cached = await redis.get(key);

        if (cached) {
            try {
                const parsed = roleItemArraySchema.safeParse(JSON.parse(cached));

                if (parsed.success) {
                    roles = parsed.data;
                } else {
                    await redis.del(key);
                }
            } catch (_err) {
                await redis.del(key);
            }
        }

        if (!roles) {
            // 查DB
            // return id, type
            const roleQuery = await pool.query<{
                id:number,
                type:string,
            }>('SELECT id, type FROM role ORDER BY id DESC ');

            const count:number = roleQuery.rowCount ?? 0;

            if (count === 0) {
                return res.status(200).json({
                    ok: true,
                    data:[]
                })
            }

            roles = roleQuery.rows ?? [];

            // 快取寫入
            // 第三個參數，不能直接放陣列，需要經過序列化後，才能夠放入
            await redis.setEx(key, ttlSeconds, JSON.stringify(roles));
        }

        res.status(200).json({
            ok: true,
            message:`取得 ${roles.length} 個角色`,
            data: roles,
        })

        const input = {
            actorUserId:userId,
            actorRole:userRole,
            action:"get_roles",
            targetType:AuditTargetType.Role,
            targetId: null,
            targetDisplay:"",
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.GET,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: {}
        }

        // 讀取使用者列表，不是重要操作，audit log 的寫入可以放在最後
        void writeAdminAuditLogToDb(input).catch((err) => {
            console.error("[audit] write failed:", err);
        });

        return;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        console.error("[api:admin/getRoles] error:", msg, err);

        if (!res.headersSent) {
            res.status(500).json({
                ok: false,
                error: "系統錯誤"
            })
        }

        const input = {
            actorUserId:userId,
            actorRole:userRole,
            action:"get_roles",
            targetType:AuditTargetType.Role,
            targetId: null,
            targetDisplay:"",
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.GET,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: {}
        }

        // 讀取使用者列表，不是重要操作，audit log 的寫入可以放在最後
        void writeAdminAuditLogToDb(input).catch((err) => {
            console.error("[audit] write failed:", err);
        });

        return;
    }
}


export const getRolePermissions = async (req: Request, res: Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg:string = userIdParams.error.issues[0]?.message ?? "未登入";
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const userId:number = userIdParams.data;

    const userRoleParams = userRoleSchema.safeParse(req.user?.role);

    if(!userRoleParams.success) {
        const msg:string = userRoleParams.error.issues[0]?.message ?? "權限不足";
        return res.status(403).json({
            ok: false,
            error: msg,
        });
    }

    const userRole:"admin" | "assistant" = userRoleParams.data;

    // 這邊的思考點是，assistant 的邊界在哪裡？
    // 因為我的預想是只有 admin 可以操作這個 api ，但是如果不做下面防護的話，有機率會讓 assistant 也可以操作這個api
    // 我有想過，可以讓 assistant 操作權限，但這樣感覺沒必要
    if (userRole !== "admin") {
        return res.status(403).json({
            ok: false,
            error: "權限不足"
        });
    }

    const userRoleIdParams = userRoleIdSchema.safeParse(req.params.roleId);

    if (!userRoleIdParams.success) {
        const msg:string = userRoleIdParams.error.issues[0]?.message ?? "roleId 格式錯誤";
        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }
    
    const userRoleId:number = userRoleIdParams.data;
    
    try {
        const roleExists = await pool.query('SELECT 1 FROM role WHERE id = $1 LIMIT 1', [userRoleId]);

        const count = roleExists.rowCount ?? 0;

        if (count === 0) {
            const input = {
                actorUserId: userId,
                actorRole: userRole,
                action: "get_role_permissions",
                targetType: AuditTargetType.Role,
                targetId: userRoleId,
                targetDisplay:null,
                requestPath: req.originalUrl,
                requestMethod: AuditRequestMethod.GET,
                requestIp: req.ip,
                userAgent: req.get("user-agent") ?? null,
                status: AuditStatus.Failed, // 或你定義的 NotFound
                errorMessage: "角色不存在",
                diff: null
            };

            void writeAdminAuditLogToDb(input).catch((err) => {
                console.error("[audit] write failed:", err);
            });

            return res.status(404).json({
                ok: false,
                error: "角色不存在"
            })
        }

        const permissionsQuery = await pool.query<{
            id: number;
            name: string;
            module: string;
            type: string;
            description: string | null;
            parent_id: number | null;
        }>('SELECT p.id, p.name, p.module, p.type, p.description, p.parent_id FROM role_permissions rp JOIN permissions p ON p.id = rp.permissions_id WHERE rp.role_id = $1 ORDER BY p.module ASC , p.type ASC ,p.id ASC', [userRoleId]);

        const input = {
            actorUserId:userId,
            actorRole:userRole,
            action:"get_role_permissions",
            targetType:AuditTargetType.Role,
            targetId: userRoleId,
            targetDisplay:null,
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.GET,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: null
        }

        // 讀取使用者列表，不是重要操作，audit log 的寫入可以放在最後
        void writeAdminAuditLogToDb(input).catch((err) => {
            console.error("[audit] write failed:", err);
        });

        return res.status(200).json({
            ok: true,
            message:`取得 ${permissionsQuery.rowCount ?? 0} 個權限`,
            data: permissionsQuery.rows ?? [],
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        console.error("[api:admin/getRolePermissions] error:", msg, err);

        const input = {
            actorUserId:userId,
            actorRole:userRole,
            action:"get_role_permissions",
            targetType:AuditTargetType.Role,
            targetId: userRoleId,
            targetDisplay:null,
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.GET,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: null
        }

        // 讀取使用者列表，不是重要操作，audit log 的寫入可以放在最後
        void writeAdminAuditLogToDb(input).catch((err) => {
            console.error("[audit] write failed:", err);
        });

        return res.status(500).json({
            ok: false,
            error: "系統錯誤"
        });
    }
}

export const getRolePermissionsTree = async (req:Request, res:Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg:string = userIdParams.error.issues[0]?.message ?? "未登入";
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const userId:number = userIdParams.data;

    const userRoleParams = userRoleSchema.safeParse(req.user?.role);

    if(!userRoleParams.success) {
        const msg:string = userRoleParams.error.issues[0]?.message ?? "權限不足";
        return res.status(403).json({
            ok: false,
            error: msg,
        });
    }

    const userRole:"admin" | "assistant" = userRoleParams.data;

    // 這邊的思考點是，assistant 的邊界在哪裡？
    // 因為我的預想是只有 admin 可以操作這個 api ，但是如果不做下面防護的話，有機率會讓 assistant 也可以操作這個api
    // 我有想過，可以讓 assistant 操作權限，但這樣感覺沒必要
    if (userRole !== "admin") {
        return res.status(403).json({
            ok: false,
            error: "權限不足"
        });
    }

    const userRoleIdParams = userRoleIdSchema.safeParse(req.params.roleId);

    if (!userRoleIdParams.success) {
        const msg:string = userRoleIdParams.error.issues[0]?.message ?? "roleId 格式錯誤";
        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }

    const userRoleId:number = userRoleIdParams.data;

    try {
        const roleExists = await pool.query('SELECT 1 FROM role WHERE id = $1 LIMIT 1', [userRoleId]);

        const count = roleExists.rowCount ?? 0;

        if (count === 0) {
            const input = {
                actorUserId: userId,
                actorRole: userRole,
                action: "get_role_permissions_tree",
                targetType: AuditTargetType.Role,
                targetId: userRoleId,
                targetDisplay:null,
                requestPath: req.originalUrl,
                requestMethod: AuditRequestMethod.GET,
                requestIp: req.ip,
                userAgent: req.get("user-agent") ?? null,
                status: AuditStatus.Failed, // 或你定義的 NotFound
                errorMessage: "角色不存在",
                diff: null
            };

            void writeAdminAuditLogToDb(input).catch((err) => {
                console.error("[audit] write failed:", err);
            });

            return res.status(404).json({
                ok: false,
                error: "角色不存在"
            })
        }

        // selected_perms 先抓出角色有的全部權限
        // permission 的 id, parent_id (父)
        // ancestors 遞迴處理
        // 第一段，把 selected_perms 的 id, parent_id 放到資料中
        // union 的功能是，把兩個查詢合併，並去除相同資料
        // 往上找父節點，直到最上層 a.parent_id = p.id
        // all_needed 去掉重複 id ，只取出 id 欄位
        // exists 判斷權限是否有角色有的，true 角色有的; false 父節點
        const result = await pool.query<{
            id: number;
            name: string;
            module: string;
            type: string;
            description: string | null;
            parent_id: number | null;
            selected: boolean;
        }>('WITH RECURSIVE selected_perms AS (SELECT p.id, p.parent_id FROM role_permissions rp JOIN permissions p ON p.id = rp.permissions_id WHERE rp.role_id = $1), ancestors AS (SELECT id, parent_id FROM selected_perms UNION SELECT p.id, p.parent_id FROM permissions p JOIN ancestors a ON a.parent_id = p.id), all_needed AS (SELECT DISTINCT id FROM ancestors) SELECT p.id, p.name, p.module, p.type, p.description, p.parent_id, EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_id = $1 AND  rp.permissions_id = p.id) AS selected FROM permissions p JOIN all_needed n ON n.id = p.id ORDER BY p.module ASC, p.type ASC, p.id ASC', [userRoleId]);

        const rows = result.rows ?? [];

        // 建立節點表
        const nodeMap = new Map<number, PermissionTreeNode>();

        for (const r of rows) {
            nodeMap.set(r.id, {
                id: r.id,
                name: r.name,
                module: r.module,
                type: r.type,
                description: r.description,
                parentId: r.parent_id,
                selected: r.selected, // 角色是否有權限
                inherited: !r.selected, // 是否為父節點
                children: [] // 空子節點陣列
            });
        }

        // 樹
        const roots: PermissionTreeNode[] = [];

        for (const node of nodeMap.values()) {
            // 檢查有沒有 parentId ，而且 nodeMap 中真的有 parentId
            if (node.parentId !== null && nodeMap.has(node.parentId)) {
                // 把 node 放到父節點的 children 子陣列中
                // 然後父節點在被放到 roots
                nodeMap.get(node.parentId)!.children.push(node);
            } else {
                // 沒有父節點(本身就是父節點)，就存到 roots 陣列中
                roots.push(node);
            }
        }

        const input = {
            actorUserId:userId,
            actorRole:userRole,
            action:"get_role_permissions_tree",
            targetType:AuditTargetType.Role,
            targetId: userRoleId,
            targetDisplay:null,
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.GET,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: null
        }

        // 讀取使用者列表，不是重要操作，audit log 的寫入可以放在最後
        void writeAdminAuditLogToDb(input).catch((err) => {
            console.error("[audit] write failed:", err);
        });

        return res.status(200).json({
            ok: true,
            data: roots
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        console.error("[api:admin/getRolePermissionsTree] error:", msg, err);

        const input = {
            actorUserId:userId,
            actorRole:userRole,
            action:"get_role_permissions_tree",
            targetType:AuditTargetType.Role,
            targetId: userRoleId,
            targetDisplay:null,
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.GET,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: null
        }

        // 讀取使用者列表，不是重要操作，audit log 的寫入可以放在最後
        void writeAdminAuditLogToDb(input).catch((err) => {
            console.error("[audit] write failed:", err);
        });

        return res.status(500).json({
            ok: false,
            error: "系統錯誤"
        });
    }
}