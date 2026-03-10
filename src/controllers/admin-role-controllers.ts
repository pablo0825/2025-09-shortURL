import { type NextFunction, type Request, type Response } from 'express';
import { replaceRolePermissionsSchema, userIdSchema, userRoleIdSchema, userRoleSchema } from '../schemas/admin-schema';
import { AuditRequestMethod, AuditStatus, AuditTargetType } from '../enum/audit';
import { type RoleItem } from '../types/types';
import { logger } from '../lib/logger';
import { AppError } from '../utils/app-error';
import {
    getRolePermissionsService,
    getRolePermissionsTreeService,
    getRolesService,
    manageRolePermissionsService,
} from '../services/admin/admin-role-service';
import { recordAdminAuditLogService } from '../services/admin/admin-audit-log-service';

const nextAppError = (next: NextFunction, statusCode: number, message: string): void => {
    next(new AppError(statusCode, message));
};

export const getRoles = async (
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

    const actorUserId = userIdParams.data;
    const actorRole = userRoleParams.data;

    try {
        const roles: RoleItem[] = await getRolesService();

        void recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'get_roles',
            targetType: AuditTargetType.Role,
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
            message: `取得 ${roles.length} 個角色`,
            data: roles,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        void recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'get_roles',
            targetType: AuditTargetType.Role,
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

export const getRolePermissions = async (
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

    const userRoleIdParams = userRoleIdSchema.safeParse(req.params.roleId);
    if (!userRoleIdParams.success) {
        nextAppError(next, 400, userRoleIdParams.error.issues[0]?.message ?? 'roleId 格式錯誤');
        return;
    }

    const actorUserId = userIdParams.data;
    const actorRole = userRoleParams.data;
    const userRoleId = userRoleIdParams.data;

    try {
        const result = await getRolePermissionsService(userRoleId);
        if (!result.roleExists) {
            void recordAdminAuditLogService({
                actorUserId,
                actorRole,
                action: 'get_role_permissions',
                targetType: AuditTargetType.Role,
                targetId: userRoleId,
                targetDisplay: null,
                requestPath: req.originalUrl,
                requestMethod: AuditRequestMethod.GET,
                requestIp: req.ip,
                userAgent: req.get('user-agent') ?? null,
                status: AuditStatus.Failed,
                errorMessage: '角色不存在',
                diff: null,
            }).catch((err) => logger.warn('[audit] write failed', err));

            nextAppError(next, 404, '角色不存在');
            return;
        }

        void recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'get_role_permissions',
            targetType: AuditTargetType.Role,
            targetId: userRoleId,
            targetDisplay: null,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.GET,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: null,
        }).catch((err) => logger.warn('[audit] write failed', err));

        res.status(200).json({
            ok: true,
            message: `取得 ${result.permissions.length} 個權限`,
            data: result.permissions,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        void recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'get_role_permissions',
            targetType: AuditTargetType.Role,
            targetId: userRoleId,
            targetDisplay: null,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.GET,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: null,
        }).catch((auditErr) => logger.warn('[audit] write failed', auditErr));

        next(err);
    }
};

export const getRolePermissionsTree = async (
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

    const userRoleIdParams = userRoleIdSchema.safeParse(req.params.roleId);
    if (!userRoleIdParams.success) {
        nextAppError(next, 400, userRoleIdParams.error.issues[0]?.message ?? 'roleId 格式錯誤');
        return;
    }

    const actorUserId = userIdParams.data;
    const actorRole = userRoleParams.data;
    const userRoleId = userRoleIdParams.data;

    try {
        const result = await getRolePermissionsTreeService(userRoleId);
        if (!result.roleExists) {
            void recordAdminAuditLogService({
                actorUserId,
                actorRole,
                action: 'get_role_permissions_tree',
                targetType: AuditTargetType.Role,
                targetId: userRoleId,
                targetDisplay: null,
                requestPath: req.originalUrl,
                requestMethod: AuditRequestMethod.GET,
                requestIp: req.ip,
                userAgent: req.get('user-agent') ?? null,
                status: AuditStatus.Failed,
                errorMessage: '角色不存在',
                diff: null,
            }).catch((err) => logger.warn('[audit] write failed', err));

            nextAppError(next, 404, '角色不存在');
            return;
        }

        void recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'get_role_permissions_tree',
            targetType: AuditTargetType.Role,
            targetId: userRoleId,
            targetDisplay: null,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.GET,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: null,
        }).catch((err) => logger.warn('[audit] write failed', err));

        res.status(200).json({
            ok: true,
            data: result.data,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        void recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'get_role_permissions_tree',
            targetType: AuditTargetType.Role,
            targetId: userRoleId,
            targetDisplay: null,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.GET,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: null,
        }).catch((auditErr) => logger.warn('[audit] write failed', auditErr));

        next(err);
    }
};

export const manageRolePermissions = async (
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

    const userRoleIdParams = userRoleIdSchema.safeParse(req.params.roleId);
    if (!userRoleIdParams.success) {
        nextAppError(next, 400, userRoleIdParams.error.issues[0]?.message ?? 'roleId 格式錯誤');
        return;
    }

    const parsed = replaceRolePermissionsSchema.safeParse(req.body);
    if (!parsed.success) {
        nextAppError(next, 400, parsed.error.issues[0]?.message ?? 'roleId 格式錯誤');
        return;
    }

    const actorUserId = userIdParams.data;
    const actorRole = userRoleParams.data;
    const userRoleId = userRoleIdParams.data;

    try {
        const result = await manageRolePermissionsService({
            roleId: userRoleId,
            permissions: parsed.data.permissions,
            reason: parsed.data.reason,
            version: parsed.data.version,
        });

        void recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'manage_role_permissions',
            targetType: AuditTargetType.Role,
            targetId: userRoleId,
            targetDisplay: result.roleType,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.PATCH,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: {
                before: {
                    version: result.beforeVersion,
                },
                after: {
                    version: result.afterVersion,
                },
                affected: result.affected,
                meta: {
                    reason: result.reason,
                },
            },
        }).catch((err) => logger.warn('[audit] write failed', err));

        res.status(200).json({
            ok: true,
            message: '角色權限已更新',
            data: {
                roleId: userRoleId,
                version: result.afterVersion,
                affected: result.affected,
            },
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        void recordAdminAuditLogService({
            actorUserId,
            actorRole,
            action: 'manage_role_permissions',
            targetType: AuditTargetType.Role,
            targetId: userRoleId,
            targetDisplay: null,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.PATCH,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Failed,
            errorMessage: msg,
            diff: null,
        }).catch((auditErr) => logger.warn('[audit] write failed', auditErr));

        next(err);
    }
};
