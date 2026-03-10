import { type NextFunction, type Request, type Response } from 'express';
import { recordAdminAuditLogService } from '../services/admin/admin-audit-log-service';
import {
    assignUserRoleSchema,
    userIdSchema,
    userRoleSchema,
    usersListSchema,
} from '../schemas/admin-schema';
import { AuditRequestMethod, AuditStatus, AuditTargetType } from '../enum/audit';
import { logger } from '../lib/logger';
import { AppError } from '../utils/app-error';
import {
    addUserRoleService,
    deactivateUserService,
    getUserService,
    getUsersService,
    getUserSessionsService,
    resetUser2faService,
    restoreUserService,
} from '../services/admin/admin-user-service';

const nextAppError = (next: NextFunction, statusCode: number, message: string): void => {
    next(new AppError(statusCode, message));
};

export const getUsers = async (
    req: Request,
    res: Response,
    next: NextFunction = () => undefined,
): Promise<void> => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);
    if (!userIdParams.success) {
        nextAppError(next, 401, userIdParams.error.issues[0]?.message ?? '未登入');
        return;
    }

    const userRoleParams = userRoleSchema.safeParse(req.user?.role);
    if (!userRoleParams.success) {
        nextAppError(next, 403, userRoleParams.error.issues[0]?.message ?? '權限不足');
        return;
    }

    const parsed = usersListSchema.safeParse(req.query);
    if (!parsed.success) {
        nextAppError(next, 400, parsed.error.issues[0]?.message ?? '參數格式有誤');
        return;
    }

    const actorUserId = userIdParams.data;
    const actorRole = userRoleParams.data;

    try {
        const result = await getUsersService(parsed.data);

        void recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'get_users',
            targetType: AuditTargetType.User,
            targetId: null,
            targetDisplay: '',
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.GET,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: {},
        }).catch((err) => logger.warn('[audit] write failed', err));

        res.status(200).json({
            ok: true,
            data: result.data,
            pagination: result.pagination,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        void recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'get_users',
            targetType: AuditTargetType.User,
            targetId: null,
            targetDisplay: '',
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.GET,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: {},
        }).catch((auditErr) => logger.warn('[audit] write failed', auditErr));

        next(err);
    }
};

export const getUser = async (
    req: Request,
    res: Response,
    next: NextFunction = () => undefined,
): Promise<void> => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);
    if (!userIdParams.success) {
        nextAppError(next, 401, userIdParams.error.issues[0]?.message ?? '未登入');
        return;
    }

    const userRoleParams = userRoleSchema.safeParse(req.user?.role);
    if (!userRoleParams.success) {
        nextAppError(next, 403, userRoleParams.error.issues[0]?.message ?? '權限不足');
        return;
    }

    const targetIdParams = userIdSchema.safeParse(req.params.id);
    if (!targetIdParams.success) {
        nextAppError(next, 400, targetIdParams.error.issues[0]?.message ?? '非法id');
        return;
    }

    const actorUserId = userIdParams.data;
    const actorRole = userRoleParams.data;
    const targetId = targetIdParams.data;

    try {
        const userResult = await getUserService(targetId);

        void recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'get_user',
            targetType: AuditTargetType.User,
            targetId,
            targetDisplay: '',
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.GET,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: {},
        }).catch((err) => logger.warn('[audit] write failed', err));

        res.status(200).json({
            ok: true,
            data: userResult,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        void recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'get_user',
            targetType: AuditTargetType.User,
            targetId,
            targetDisplay: '',
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.GET,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: {},
        }).catch((auditErr) => logger.warn('[audit] write failed', auditErr));

        next(err);
    }
};

export const getUserSessions = async (
    req: Request,
    res: Response,
    next: NextFunction = () => undefined,
): Promise<void> => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);
    if (!userIdParams.success) {
        nextAppError(next, 401, userIdParams.error.issues[0]?.message ?? '未登入');
        return;
    }

    const userRoleParams = userRoleSchema.safeParse(req.user?.role);
    if (!userRoleParams.success) {
        nextAppError(next, 403, userRoleParams.error.issues[0]?.message ?? '權限不足');
        return;
    }

    const targetIdParams = userIdSchema.safeParse(req.params.id);
    if (!targetIdParams.success) {
        nextAppError(next, 400, targetIdParams.error.issues[0]?.message ?? '非法id');
        return;
    }

    const actorUserId = userIdParams.data;
    const actorRole = userRoleParams.data;
    const targetId = targetIdParams.data;

    try {
        const sessionResult = await getUserSessionsService(targetId);

        void recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'get_user_sessions',
            targetType: AuditTargetType.User,
            targetId,
            targetDisplay: '',
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.GET,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: {},
        }).catch((err) => logger.warn('[audit] write failed', err));

        res.status(200).json({
            ok: true,
            message: sessionResult.message,
            data: sessionResult.data,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        void recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'get_user_sessions',
            targetType: AuditTargetType.User,
            targetId,
            targetDisplay: '',
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.GET,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: {},
        }).catch((auditErr) => logger.warn('[audit] write failed', auditErr));

        next(err);
    }
};

export const resetUser2FA = async (
    req: Request,
    res: Response,
    next: NextFunction = () => undefined,
): Promise<void> => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);
    if (!userIdParams.success) {
        nextAppError(next, 401, userIdParams.error.issues[0]?.message ?? '未登入');
        return;
    }

    const userRoleParams = userRoleSchema.safeParse(req.user?.role);
    if (!userRoleParams.success) {
        nextAppError(next, 403, userRoleParams.error.issues[0]?.message ?? '權限不足');
        return;
    }

    const targetIdParams = userIdSchema.safeParse(req.params.id);
    if (!targetIdParams.success) {
        nextAppError(next, 400, targetIdParams.error.issues[0]?.message ?? '非法id');
        return;
    }

    const actorUserId = userIdParams.data;
    const actorRole = userRoleParams.data;
    const targetId = targetIdParams.data;

    try {
        const result = await resetUser2faService(targetId);

        await recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'reset_user_2fa',
            targetType: AuditTargetType.User,
            targetId,
            targetDisplay: '',
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.PATCH,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: result,
        });

        res.status(200).json({
            ok: true,
            message: `${targetId} 使用者的2fa驗證已停用`,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        await recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'reset_user_2fa',
            targetType: AuditTargetType.User,
            targetId,
            targetDisplay: '',
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.PATCH,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: {},
        });

        next(err);
    }
};

export const deactivateUser = async (
    req: Request,
    res: Response,
    next: NextFunction = () => undefined,
): Promise<void> => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);
    if (!userIdParams.success) {
        nextAppError(next, 401, userIdParams.error.issues[0]?.message ?? '未登入');
        return;
    }

    const userRoleParams = userRoleSchema.safeParse(req.user?.role);
    if (!userRoleParams.success) {
        nextAppError(next, 403, userRoleParams.error.issues[0]?.message ?? '權限不足');
        return;
    }

    const targetIdParams = userIdSchema.safeParse(req.params.id);
    if (!targetIdParams.success) {
        nextAppError(next, 400, targetIdParams.error.issues[0]?.message ?? '非法id');
        return;
    }

    const actorUserId = userIdParams.data;
    const actorRole = userRoleParams.data;
    const targetId = targetIdParams.data;

    if (targetId === actorUserId) {
        nextAppError(next, 403, 'admin 不能停用自己');
        return;
    }

    try {
        const result = await deactivateUserService(targetId);

        await recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'soft_delete_user',
            targetType: AuditTargetType.User,
            targetId,
            targetDisplay: '',
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.PATCH,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: {
                ...result,
                meta: {
                    reason: 'soft_delete',
                },
            },
        });

        res.status(200).json({
            ok: true,
            message: `${targetId} 使用者帳號已刪除`,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        await recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'soft_delete_user',
            targetType: AuditTargetType.User,
            targetId,
            targetDisplay: '',
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.PATCH,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: {},
        });

        next(err);
    }
};

export const restoreUser = async (
    req: Request,
    res: Response,
    next: NextFunction = () => undefined,
): Promise<void> => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);
    if (!userIdParams.success) {
        nextAppError(next, 401, userIdParams.error.issues[0]?.message ?? '未登入');
        return;
    }

    const userRoleParams = userRoleSchema.safeParse(req.user?.role);
    if (!userRoleParams.success) {
        nextAppError(next, 403, userRoleParams.error.issues[0]?.message ?? '權限不足');
        return;
    }

    const targetIdParams = userIdSchema.safeParse(req.params.id);
    if (!targetIdParams.success) {
        nextAppError(next, 400, targetIdParams.error.issues[0]?.message ?? '非法id');
        return;
    }

    const actorUserId = userIdParams.data;
    const actorRole = userRoleParams.data;
    const targetId = targetIdParams.data;

    try {
        const result = await restoreUserService(targetId);

        await recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'restore_user',
            targetType: AuditTargetType.User,
            targetId,
            targetDisplay: '',
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.PATCH,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: {
                ...result,
                meta: {
                    reason: 'restore_user',
                },
            },
        });

        res.status(200).json({
            ok: true,
            message: `${targetId} 使用者帳號已恢復`,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        await recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'restore_user',
            targetType: AuditTargetType.User,
            targetId,
            targetDisplay: '',
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.PATCH,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: {},
        });

        next(err);
    }
};

export const setUserRole = async (
    req: Request,
    res: Response,
    next: NextFunction = () => undefined,
): Promise<void> => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);
    if (!userIdParams.success) {
        nextAppError(next, 401, userIdParams.error.issues[0]?.message ?? '未登入');
        return;
    }

    const userRoleParams = userRoleSchema.safeParse(req.user?.role);
    if (!userRoleParams.success) {
        nextAppError(next, 403, userRoleParams.error.issues[0]?.message ?? '權限不足');
        return;
    }

    if (userRoleParams.data !== 'admin') {
        nextAppError(next, 403, '權限不足');
        return;
    }

    const targetIdParams = userIdSchema.safeParse(req.params.id);
    if (!targetIdParams.success) {
        nextAppError(next, 400, targetIdParams.error.issues[0]?.message ?? '非法 id');
        return;
    }

    const assignableRolesParams = assignUserRoleSchema.safeParse(req.body);
    if (!assignableRolesParams.success) {
        nextAppError(next, 400, assignableRolesParams.error.issues[0]?.message ?? '資料格式錯誤');
        return;
    }

    const actorUserId = userIdParams.data;
    const actorRole = userRoleParams.data;
    const targetId = targetIdParams.data;

    try {
        const result = await addUserRoleService(targetId, assignableRolesParams.data.role);

        void recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'set_user_role',
            targetType: AuditTargetType.Role,
            targetId,
            targetDisplay: result.addedRole,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.PUT,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: {
                before: {
                    roles: result.before.roles,
                },
                after: {
                    roles: result.after.roles,
                },
                affected: result.affected,
                meta: {
                    addedRole: result.addedRole,
                },
            },
        }).catch((err) => logger.warn('[audit] write failed', err));

        res.status(200).json({
            ok: true,
            message: '角色新增成功',
            data: {
                addedRole: result.addedRole,
                roles: result.after.roles,
            },
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        void recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'set_user_role',
            targetType: AuditTargetType.Role,
            targetId,
            targetDisplay: null,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.PUT,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: null,
        }).catch((auditErr) => logger.warn('[audit] write failed', auditErr));

        next(err);
    }
};
