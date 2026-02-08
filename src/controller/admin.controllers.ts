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

    try {
        const sql = `SELECT id, email, nickname, is_active, last_login_at, twofa_enabled, COUNT(*) OVER() AS total_count FROM users ${whereSql} ORDER BY ${sortBySafe} ${sortOrderSafe} LIMIT $${idx} OFFSET $${idx + 1}`;

        values.push(limit, offset);

        const query= await pool.query<{
            id:number,
            email:string,
            nickname:string,
            is_active:boolean,
            last_login_at:string | null,
            twofa_enabled:boolean,
            total_count:number
        }>(sql, values);

        //  計算總數
        const total:number = query.rowCount ? Number(query.rows[0].total_count) : 0;
        // 計算有幾頁
        const totalPages:number =  Math.ceil(total / limit);

        const data = query.rows;

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
            diff: {} // diff 檢查前後變化的物件，所以 getUser 可以不用填
        }

        // 讀取使用者列表，不是重要操作，audit log 的寫入可以放在最後
        await writeAdminAuditLogToDb(input);

        return ;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        console.error("[api:admin/getUsers] error:", msg, err);

        res.status(500).json({
            ok: false,
            error: msg
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
    }
}