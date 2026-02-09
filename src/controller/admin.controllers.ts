// admin.controllers.ts
import {Request, Response} from "express";
import type {PoolClient} from "pg";
import {pool} from "../pool";
import {writeAdminAuditLogToDb} from "../utils/writeAdminAuditLogToDb";
import {usersListSchema, userIdSchema, userRoleSchema} from "../zod/admin.schema";
import {AuditRequestMethod, AuditStatus, AuditTargetType}  from "../enum/audit";

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

// 修改指定使用者資料