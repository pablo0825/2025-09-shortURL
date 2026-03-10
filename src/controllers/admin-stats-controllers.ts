import { type NextFunction, type Request, type Response } from 'express';
import { AuditRequestMethod, AuditStatus, AuditTargetType } from '../enum/audit';
import { logger } from '../lib/logger';
import { userIdSchema, userRoleSchema } from '../schemas/admin-schema';
import { recordAdminAuditLogService } from '../services/admin/admin-audit-log-service';
import { getAdminStatsLinksService, getAdminStatsUsersService } from '../services/admin/admin-stats-service';
import { AppError } from '../utils/app-error';

const UNAUTHORIZED_MESSAGE = '未登入';
const FORBIDDEN_MESSAGE = '權限不足';

const nextAppError = (next: NextFunction, statusCode: number, message: string): void => {
    next(new AppError(statusCode, message));
};

const writeAuditLog = (input: {
    actorUserId: number;
    actorRole: 'admin' | 'assistant';
    action: 'get_admin_stats_users' | 'get_admin_stats_links';
    requestPath: string;
    requestIp: string | undefined;
    userAgent: string | null;
    status: AuditStatus;
    errorMessage: string | null;
}): void => {
    void recordAdminAuditLogService({
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        action: input.action,
        targetType: AuditTargetType.Stats,
        targetId: null,
        targetDisplay: null,
        requestPath: input.requestPath,
        requestMethod: AuditRequestMethod.GET,
        requestIp: input.requestIp,
        userAgent: input.userAgent,
        status: input.status,
        errorMessage: input.errorMessage,
        diff: null,
    }).catch((error) => {
        logger.warn('[audit] write failed', error);
    });
};

export const getAdminStatsUsers = async (
    req: Request,
    res: Response,
    next: NextFunction = () => undefined,
): Promise<void> => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);
    if (!userIdParams.success) {
        nextAppError(next, 401, UNAUTHORIZED_MESSAGE);
        return;
    }

    const userRoleParams = userRoleSchema.safeParse(req.user?.role);
    if (!userRoleParams.success) {
        nextAppError(next, 403, FORBIDDEN_MESSAGE);
        return;
    }

    const actorUserId = userIdParams.data;
    const actorRole = userRoleParams.data;

    try {
        const result = await getAdminStatsUsersService();

        writeAuditLog({
            actorUserId,
            actorRole,
            action: 'get_admin_stats_users',
            requestPath: req.originalUrl,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
        });

        res.status(200).json({
            ok: true,
            data: result,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        writeAuditLog({
            actorUserId,
            actorRole,
            action: 'get_admin_stats_users',
            requestPath: req.originalUrl,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Failed,
            errorMessage: message,
        });

        next(error);
    }
};

export const getAdminStatsLinks = async (
    req: Request,
    res: Response,
    next: NextFunction = () => undefined,
): Promise<void> => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);
    if (!userIdParams.success) {
        nextAppError(next, 401, UNAUTHORIZED_MESSAGE);
        return;
    }

    const userRoleParams = userRoleSchema.safeParse(req.user?.role);
    if (!userRoleParams.success) {
        nextAppError(next, 403, FORBIDDEN_MESSAGE);
        return;
    }

    const actorUserId = userIdParams.data;
    const actorRole = userRoleParams.data;

    try {
        const result = await getAdminStatsLinksService();

        writeAuditLog({
            actorUserId,
            actorRole,
            action: 'get_admin_stats_links',
            requestPath: req.originalUrl,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
        });

        res.status(200).json({
            ok: true,
            data: result,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        writeAuditLog({
            actorUserId,
            actorRole,
            action: 'get_admin_stats_links',
            requestPath: req.originalUrl,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Failed,
            errorMessage: message,
        });

        next(error);
    }
};
