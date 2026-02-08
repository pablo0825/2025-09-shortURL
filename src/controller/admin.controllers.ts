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

    const {page, limit, sortBy, sortOrder, q, role, twofa_enabled, includeInactive} = parsed.data;

    // 決定要跳過幾筆資料，像是 (1-1=0)*30, (2-1=1)*30
    const offset:number = (page - 1) * limit;

    const conditions:string[] = [];
    const values: Array<string | number | boolean> = [];
    // sql 參數編號
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
    if (role) {
        conditions.push(`role = $${idx}`);
        values.push(role);
        idx++;
    }

    const whereSql:string =conditions.length ? `WHERE ${conditions.join(" AND ")}`: "";
    // 若要更安全，可用白名單
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

        // 先查總數
        const countSql = `SELECT COUNT(*)::int AS total FROM users ${whereSql}`;
        const countResult = await client.query<{ total: number }>(countSql, values);

        // 查分頁資料
        // 為避免資料飄移，加上 id 作為定錨
        // 因為可能會有同個 created_at，這樣就沒辦法判斷誰先誰後
        // [問題] 在下面這段sql查詢中，沒辦法用join，可能是拼太多字串的關係
        // 需要再額外查詢一次，user role，然後再合併資料
        const dataSql = `SELECT u.id, u.email, u.nickname, u.is_active, u.last_login_at, u.twofa_enabled FROM users u ${whereSql} ORDER BY u.${sortBySafe} ${sortOrderSafe}, u.id ${sortOrderSafe} LIMIT $${idx} OFFSET $${idx + 1}`;

        const dataValues: Array<string | number | boolean> = [...values, limit, offset];

        const dataResult= await client.query<{
            id:number,
            email:string,
            nickname:string,
            is_active:boolean,
            last_login_at:string | null,
            twofa_enabled:boolean
        }>(dataSql, dataValues);

        //  計算總數
        const total:number = countResult.rows[0]?.total ?? 0;
        // 計算有幾頁
        const totalPages:number =  Math.ceil(total / limit);

        // 參考程式碼
      //   const users = usersResult.rows;
      //   const userIds = users.map((u) => u.id);
      //
      //   // 3) 一次查這頁 users 的 roles（避免 N+1）
      //   let roleMap = new Map<number, string[]>();
      //
      //   if (userIds.length > 0) {
      //       const roleSql = `
      //     SELECT ur.user_id, r.type
      //     FROM user_role ur
      //     JOIN roles r ON r.id = ur.role_id
      //     WHERE ur.user_id = ANY($1::int[])
      // `;
      //
      //       const roleResult = await pool.query<{ user_id: number; type: string }>(roleSql,
      //               [userIds]);
      //
      //       roleMap = roleResult.rows.reduce((map, row) => {
      //           const current = map.get(row.user_id) ?? [];
      //           current.push(row.type);
      //           map.set(row.user_id, current);
      //           return map;
      //       }, new Map<number, string[]>());
      //   }
      //
      //   // 4) 合併資料
      //   const data = users.map((u) => ({
      //       ...u,
      //       roles: roleMap.get(u.id) ?? [],
      //   }));

        // [Transaction] 交易成功
        await client.query("COMMIT");

        // 200 表示伺服器已完成請求。沒有改變伺服器的狀態
        res.status(200).json({
            ok: true,
            data: dataResult.rows,
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
            action:"list_users",
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
            action:"list_users",
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