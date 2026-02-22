// admin-controllers.ts
import express, {Request, Response} from "express";
import {writeAdminAuditLogToDb} from "../utils/write-admin-audit-log-to-db";
import {
    usersListSchema,
    userIdSchema,
    userRoleSchema,
    userRoleIdSchema,
    replaceRolePermissionsSchema
} from "../schemas/admin-schema";
import {AuditRequestMethod, AuditStatus, AuditTargetType}  from "../enum/audit";
import {RoleItem} from "../types/types";
import multer from "multer";
import {handleAccessTokenBlackList} from "../utils/handle-access-token-black-list";
import {UserLogActionEnum} from "../enum/user-log-action-enum";
import {logger} from "../lib/logger";
import {
    deactivateUserService,
    getUserService,
    getUsersService,
    getUserSessionsService,
    resetUser2faService,
    restoreUserService
} from "../services/admin-user-service";
import {
    getRolePermissionsService,
    getRolePermissionsTreeService,
    getRolesService,
    manageRolePermissionsService
} from "../services/admin-role-service";

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

    const {page, limit, sortBy, sortOrder, q, twofa_enabled, includeInactive} = parsed.data;

    try {
        const result = await getUsersService({
            page,
            limit,
            sortBy,
            sortOrder,
            q,
            twofa_enabled,
            includeInactive,
        });

        // 200 表示伺服器已完成請求。沒有改變伺服器的狀態
        res.status(200).json({
            ok: true,
            data: result.data,
            pagination: result.pagination
        });

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

        await writeAdminAuditLogToDb(input);
        return;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

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

        await writeAdminAuditLogToDb(input);

        return res.status(500).json({
            ok: false,
            error: "系統錯誤"
        });
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
        const userResult = await getUserService(targetId);

        res.status(200).json({
            ok: true,
            data: userResult,
        });

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

        await writeAdminAuditLogToDb(input);
        return;
    } catch (err) {
        if (err instanceof Error && err.name === 'UserNotFoundError') {
            return res.status(404).json({
                ok: false,
                error:"使用者不存在或資料異常"
            });
        }

        const msg = err instanceof Error ? err.message : String(err);

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

        await writeAdminAuditLogToDb(input);

        return res.status(500).json({
            ok: false,
            error: "系統錯誤"
        });
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
        const sessionResult = await getUserSessionsService(targetId);

        res.status(200).json({
            ok: true,
            message: sessionResult.message,
            data: sessionResult.data
        });

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

        await writeAdminAuditLogToDb(input);

        return;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

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

        await writeAdminAuditLogToDb(input);

        return res.status(500).json({
            ok: false,
            error: "系統錯誤"
        });
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

    try {
        const result = await resetUser2faService(targetId);

        await writeAdminAuditLogToDb({
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
            diff: result
        });

        return  res.status(200).json({
            ok: true,
            message:`${targetId} 使用者的2fa驗證已停用`,
        });
    } catch (err) {
        if (err instanceof Error && err.name === 'UserNotFoundError') {
            return res.status(404).json({
                ok: false,
                error:"使用者不存在或資料異常"
            });
        }

        const msg = err instanceof Error ? err.message : String(err);

        await writeAdminAuditLogToDb({
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
        });

        return res.status(500).json({
            ok: false,
            error: "系統錯誤"
        });
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

    try {
        const result = await deactivateUserService(targetId);

        await writeAdminAuditLogToDb({
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
                ...result,
                meta: {
                    reason: "soft_delete"
                }
            }
        });

        return  res.status(200).json({
            ok: true,
            message:`${targetId} 使用者帳號已刪除`,
        });
    } catch (err) {
        if (err instanceof Error && err.name === 'UserNotFoundError') {
            return res.status(404).json({
                ok: false,
                error:"使用者不存在或資料異常"
            });
        }

        const msg = err instanceof Error ? err.message : String(err);

        await writeAdminAuditLogToDb({
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
        });

        return res.status(500).json({
            ok: false,
            error: "系統錯誤"
        });
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

    try {
        const result = await restoreUserService(targetId);

        await writeAdminAuditLogToDb({
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
                ...result,
                meta: {
                    reason: "restore_user"
                }
            }
        });

        return  res.status(200).json({
            ok: true,
            message:`${targetId} 使用者帳號已恢復`,
        });
    } catch (err) {
        if (err instanceof Error && err.name === 'UserNotFoundError') {
            return res.status(404).json({
                ok: false,
                error:"使用者不存在或資料異常"
            });
        }

        const msg = err instanceof Error ? err.message : String(err);

        await writeAdminAuditLogToDb({
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
            diff: {}
        });

        return res.status(500).json({
            ok: false,
            error: "系統錯誤"
        });
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

    try {
        const roles: RoleItem[] = await getRolesService();

        res.status(200).json({
            ok: true,
            message:`取得 ${roles.length} 個角色`,
            data: roles,
        });

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

        void writeAdminAuditLogToDb(input).catch((err) => {
            logger.warn('[audit] write failed', err);
        });

        return;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);


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
            logger.warn('[audit] write failed', err);
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
        const result = await getRolePermissionsService(userRoleId);
        if (!result.roleExists) {
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
                logger.warn('[audit] write failed', err);
            });

            return res.status(404).json({
                ok: false,
                error: "角色不存在"
            })
        }

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
            logger.warn('[audit] write failed', err);
        });

        return res.status(200).json({
            ok: true,
            message:`取得 ${result.permissions.length} 個權限`,
            data: result.permissions,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);


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
            logger.warn('[audit] write failed', err);
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
        const result = await getRolePermissionsTreeService(userRoleId);
        if (!result.roleExists) {
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
                logger.warn('[audit] write failed', err);
            });

            return res.status(404).json({
                ok: false,
                error: "角色不存在"
            })
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
            logger.warn('[audit] write failed', err);
        });

        return res.status(200).json({
            ok: true,
            data: result.data
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);


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
            logger.warn('[audit] write failed', err);
        });

        return res.status(500).json({
            ok: false,
            error: "系統錯誤"
        });
    }
}

export const manageRolePermissions = async (req:Request, res:Response) => {
    // 邊界：(1)這個操作只有admin可以做 (2)禁止管理員修改自己的權限
    // 在某個角色下
    // 刪除某個權限
    // 需要更新權限
    // 我是把權限寫入到redis中，只需要刪除key就好
    // role_permissions table 的角色和權限的關聯應該也要清除
    // 用整包去處理，剩下的就是這個角色有的權限
    // 策略就是整包更新，這包的權限，就是角色目前有的，不在這包裡面的，就清除掉
    // 所以需要做前後比較

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

    const parsed = replaceRolePermissionsSchema.safeParse(req.body);

    if (!parsed.success) {
        const msg:string = parsed.error.issues[0]?.message ?? "roleId 格式錯誤";
        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }

    const {permissions, reason, version} = parsed.data;

    try {
        const result = await manageRolePermissionsService({
            roleId: userRoleId,
            permissions,
            reason,
            version
        });

        void writeAdminAuditLogToDb({
            actorUserId:userId,
            actorRole:userRole,
            action:"manage_role_permissions",
            targetType:AuditTargetType.Role,
            targetId: userRoleId,
            targetDisplay: result.roleType,
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.PATCH,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: {
                before: {
                    version: result.beforeVersion
                },
                after: {
                    version: result.afterVersion
                },
                affected: result.affected,
                meta: {
                    reason: result.reason
                }
            }
        }).catch((err) => {
            logger.warn('[audit] write failed', err);
        });

        return res.status(200).json({
            ok: true,
            message: "角色權限已更新",
            data: {
                roleId: userRoleId,
                version: result.afterVersion,
                affected: result.affected
            }
        });
    } catch (err) {
        if (err instanceof Error && err.name === 'RoleNotFoundError') {
            return res.status(404).json({
                ok: false,
                error: "角色不存在"
            });
        }

        if (err instanceof Error && err.name === 'RoleVersionConflictError') {
            return res.status(409).json({
                ok: false,
                error: "版本號異常"
            });
        }

        if (err instanceof Error && err.name === 'PermissionNotFoundError') {
            return res.status(422).json({
                ok: false,
                error: "權限不存在"
            });
        }

        const msg = err instanceof Error ? err.message : String(err);

        void writeAdminAuditLogToDb({
            actorUserId:userId,
            actorRole:userRole,
            action:"manage_role_permissions",
            targetType:AuditTargetType.Role,
            targetId: userRoleId,
            targetDisplay:null,
            requestPath:req.originalUrl,
            requestMethod:AuditRequestMethod.PATCH,
            requestIp:req.ip,
            userAgent:req.get("user-agent") ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: null
        }).catch((auditErr) => {
            logger.warn('[audit] write failed', auditErr);
        });

        return res.status(500).json({
            ok: false,
            error: "系統錯誤"
        });
    }
}
