// admin.controllers.ts
import {Request, Response} from "express";
import type {PoolClient} from "pg";
import {pool} from "../pool";
import {writeAdminAuditLogToDb} from "../utils/writeAdminAuditLogToDb";
import {usersListSchema, userIdSchema} from "../zod/admin.schema";

export const getUsers = async (req: Request, res: Response) => {
    // return id, email, nickname, role, is_action, last_login_at, twofa_enabled, created_at
    // action: users_list
    // type:users
    // path: /admin/users
    // httpMethod: get
    // pagination / filter / sort
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg:string = userIdParams.error.issues[0]?.message ?? "未登入";
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const userId:number = userIdParams.data;

    const parsed = usersListSchema.safeParse(req.query);

    if (!parsed.success) {
        const msg:string = parsed.error.issues[0]?.message ?? "參數格式有誤";
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const {page, limit, sortBy, sortOrder, q, role, twofa_enabled, includeInactive} = parsed.data;

    // 決定要跳過幾筆資料，像是 (1-1=0)*30, (2-1=1)*30
    const offset:number = (page - 1) * limit;

    let conditions:string[] = [];
    if (!twofa_enabled) conditions.push(`twofa_enabled = FALSE`)
    if (!includeInactive) conditions.push(`is_active = TRUE`)
}