import { type NextFunction, type Request, type Response } from 'express';
import { AppError } from '../utils/app-error';
import { adminLinksQuerySchema, userIdSchema, userRoleSchema } from '../schemas/admin-schema';
import { getAdminLinksService } from '../services/admin/admin-link-service';
import { AuditRequestMethod, AuditStatus, AuditTargetType } from '../enum/audit';
import { recordAdminAuditLogService } from '../services/admin/admin-audit-log-service';
import { logger } from '../lib/logger';

const UNAUTHORIZED_MESSAGE = '未登入';
const FORBIDDEN_MESSAGE = '權限不足';
const INVALID_QUERY_MESSAGE = '參數格式有誤';

const nextAppError = (next: NextFunction, statusCode: number, message: string): void => {
    next(new AppError(statusCode, message));
};

export const getAdminLinks = async (
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

    const parsed = adminLinksQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        nextAppError(next, 400, INVALID_QUERY_MESSAGE);
        return;
    }

    const userId:number = userIdParams.data;
    const userRole: "admin" | "assistant" = userRoleParams.data;

    try {
        const result = await getAdminLinksService(parsed.data);

        void recordAdminAuditLogService({
            actorUserId: userId,
            actorRole: userRole,
            action: 'get_admin_links',
            targetType: AuditTargetType.Link,
            targetId: null,
            targetDisplay: null,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.GET,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: null,
        }).catch((error) => {
            logger.warn('[audit] write failed', error);
        });

        res.status(200).json({
            ok: true,
            data: result.data,
            pagination: result.pagination,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        void recordAdminAuditLogService({
            actorUserId: userId,
            actorRole: userRole,
            action: 'get_admin_links',
            targetType: AuditTargetType.Link,
            targetId: null,
            targetDisplay: null,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.GET,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Failed,
            errorMessage: message,
            diff: null,
        }).catch((auditError) => {
            logger.warn('[audit] write failed', auditError);
        });

        next(error);
    }
};
