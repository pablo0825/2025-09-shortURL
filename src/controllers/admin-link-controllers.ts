import { type NextFunction, type Request, type Response } from 'express';
import { AppError } from '../utils/app-error';
import {
    adminLinkIdParamSchema,
    adminLinksQuerySchema,
    userIdSchema,
    userRoleSchema,
} from '../schemas/admin-schema';
import {
    deactivateAdminLinkByIdService,
    getAdminLinkByIdService,
    getAdminLinksService,
} from '../services/admin/admin-link-service';
import { AuditRequestMethod, AuditStatus, AuditTargetType } from '../enum/audit';
import { recordAdminAuditLogService } from '../services/admin/admin-audit-log-service';
import { logger } from '../lib/logger';

const UNAUTHORIZED_MESSAGE = '未登入';
const FORBIDDEN_MESSAGE = '權限不足';
const INVALID_QUERY_MESSAGE = '參數格式有誤';
const NOT_FOUND_MESSAGE = '查無資料';
const LINK_DELETED_MESSAGE = '連結已刪除，無法停用';
const LINK_DISABLED_MESSAGE = '連結已停用';

const nextAppError = (next: NextFunction, statusCode: number, message: string): void => {
    next(new AppError(statusCode, message));
};

const parseActor = (
    req: Request,
    next: NextFunction,
): { userId: number; userRole: 'admin' | 'assistant' } | null => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);
    if (!userIdParams.success) {
        nextAppError(next, 401, UNAUTHORIZED_MESSAGE);
        return null;
    }

    const userRoleParams = userRoleSchema.safeParse(req.user?.role);
    if (!userRoleParams.success) {
        nextAppError(next, 403, FORBIDDEN_MESSAGE);
        return null;
    }

    return {
        userId: userIdParams.data,
        userRole: userRoleParams.data,
    };
};

export const getAdminLinks = async (
    req: Request,
    res: Response,
    next: NextFunction = () => undefined,
): Promise<void> => {
    const actor = parseActor(req, next);
    if (!actor) {
        return;
    }

    const parsed = adminLinksQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        nextAppError(next, 400, INVALID_QUERY_MESSAGE);
        return;
    }

    try {
        const result = await getAdminLinksService(parsed.data);

        void recordAdminAuditLogService({
            actorUserId: actor.userId,
            actorRole: actor.userRole,
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
            actorUserId: actor.userId,
            actorRole: actor.userRole,
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

export const getAdminLinkById = async (
    req: Request,
    res: Response,
    next: NextFunction = () => undefined,
): Promise<void> => {
    const actor = parseActor(req, next);
    if (!actor) {
        return;
    }

    const linkIdParams = adminLinkIdParamSchema.safeParse(req.params.id);
    if (!linkIdParams.success) {
        nextAppError(next, 400, INVALID_QUERY_MESSAGE);
        return;
    }

    const linkId = linkIdParams.data;

    try {
        const result = await getAdminLinkByIdService(linkId);

        void recordAdminAuditLogService({
            actorUserId: actor.userId,
            actorRole: actor.userRole,
            action: 'get_admin_link',
            targetType: AuditTargetType.Link,
            targetId: linkId,
            targetDisplay: result.code,
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
            data: result,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isNotFound = error instanceof AppError && error.statusCode === 404;

        void recordAdminAuditLogService({
            actorUserId: actor.userId,
            actorRole: actor.userRole,
            action: 'get_admin_link',
            targetType: AuditTargetType.Link,
            targetId: linkId,
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

        if (isNotFound) {
            nextAppError(next, 404, NOT_FOUND_MESSAGE);
            return;
        }

        next(error);
    }
};

export const deactivateAdminLinkById = async (
    req: Request,
    res: Response,
    next: NextFunction = () => undefined,
): Promise<void> => {
    const actor = parseActor(req, next);
    if (!actor) {
        return;
    }

    const linkIdParams = adminLinkIdParamSchema.safeParse(req.params.id);
    if (!linkIdParams.success) {
        nextAppError(next, 400, INVALID_QUERY_MESSAGE);
        return;
    }

    const linkId = linkIdParams.data;

    try {
        const result = await deactivateAdminLinkByIdService(linkId);

        void recordAdminAuditLogService({
            actorUserId: actor.userId,
            actorRole: actor.userRole,
            action: 'deactivate_admin_link',
            targetType: AuditTargetType.Link,
            targetId: linkId,
            targetDisplay: String(linkId),
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.PATCH,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: {
                before: result.before,
                after: result.after,
            },
        }).catch((error) => {
            logger.warn('[audit] write failed', error);
        });

        res.status(200).json({
            ok: true,
            data: result,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const statusCode = error instanceof AppError ? error.statusCode : 500;

        void recordAdminAuditLogService({
            actorUserId: actor.userId,
            actorRole: actor.userRole,
            action: 'deactivate_admin_link',
            targetType: AuditTargetType.Link,
            targetId: linkId,
            targetDisplay: null,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.PATCH,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Failed,
            errorMessage: message,
            diff: null,
        }).catch((auditError) => {
            logger.warn('[audit] write failed', auditError);
        });

        if (statusCode === 404) {
            nextAppError(next, 404, NOT_FOUND_MESSAGE);
            return;
        }

        if (statusCode === 409 && message.includes('刪除')) {
            nextAppError(next, 409, LINK_DELETED_MESSAGE);
            return;
        }

        if (statusCode === 409 && message.includes('停用')) {
            nextAppError(next, 409, LINK_DISABLED_MESSAGE);
            return;
        }

        next(error);
    }
};
