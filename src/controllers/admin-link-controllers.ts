import { type NextFunction, type Request, type Response } from 'express';
import { AppError } from '../utils/app-error';
import {
    adminLinkIdParamSchema,
    deactivateAdminLinksBodySchema,
    deleteAdminLinksBodySchema,
    adminLinksQuerySchema,
    restoreAdminLinksBodySchema,
    userIdSchema,
    userRoleSchema,
} from '../schemas/admin-schema';
import {
    deactivateAdminLinksService,
    deleteAdminLinksService,
    getAdminLinkByIdService,
    getAdminLinksService,
    restoreAdminLinksService,
} from '../services/admin/admin-link-service';
import { AuditRequestMethod, AuditStatus, AuditTargetType } from '../enum/audit';
import { recordAdminAuditLogService } from '../services/admin/admin-audit-log-service';
import { logger } from '../lib/logger';

const UNAUTHORIZED_MESSAGE = '未登入';
const FORBIDDEN_MESSAGE = '權限不足';
const INVALID_QUERY_MESSAGE = '參數格式有誤';
const NOT_FOUND_MESSAGE = '查無資料';
const ALL_LINKS_DELETE_FAILED_MESSAGE = '所有連結皆無法刪除';

const ALL_LINKS_RESTORE_FAILED_MESSAGE = 'All links failed to restore';
const ALL_LINKS_DEACTIVATE_FAILED_MESSAGE = '所有連結皆無法停用';

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

const parseLinkId = (req: Request, next: NextFunction): number | null => {
    const linkIdParams = adminLinkIdParamSchema.safeParse(req.params.id);
    if (!linkIdParams.success) {
        nextAppError(next, 400, INVALID_QUERY_MESSAGE);
        return null;
    }

    return linkIdParams.data;
};

const writeAuditLog = (input: {
    actorUserId: number;
    actorRole: 'admin' | 'assistant';
    action: string;
    targetId: number | null;
    targetDisplay: string | null;
    requestPath: string;
    requestMethod: AuditRequestMethod;
    requestIp: string | undefined;
    userAgent: string | null;
    status: AuditStatus;
    errorMessage: string | null;
    diff: Record<string, unknown> | null;
}): void => {
    void recordAdminAuditLogService({
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        action: input.action,
        targetType: AuditTargetType.Link,
        targetId: input.targetId,
        targetDisplay: input.targetDisplay,
        requestPath: input.requestPath,
        requestMethod: input.requestMethod,
        requestIp: input.requestIp,
        userAgent: input.userAgent,
        status: input.status,
        errorMessage: input.errorMessage,
        diff: input.diff,
    }).catch((error) => {
        logger.warn('[audit] write failed', error);
    });
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

        writeAuditLog({
            actorUserId: actor.userId,
            actorRole: actor.userRole,
            action: 'get_admin_links',
            targetId: null,
            targetDisplay: null,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.GET,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: null,
        });

        res.status(200).json({
            ok: true,
            data: result.data,
            pagination: result.pagination,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        writeAuditLog({
            actorUserId: actor.userId,
            actorRole: actor.userRole,
            action: 'get_admin_links',
            targetId: null,
            targetDisplay: null,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.GET,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Failed,
            errorMessage: message,
            diff: null,
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

    const linkId = parseLinkId(req, next);
    if (linkId === null) {
        return;
    }

    try {
        const result = await getAdminLinkByIdService(linkId);

        writeAuditLog({
            actorUserId: actor.userId,
            actorRole: actor.userRole,
            action: 'get_admin_link',
            targetId: linkId,
            targetDisplay: result.code,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.GET,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Success,
            errorMessage: null,
            diff: null,
        });

        res.status(200).json({
            ok: true,
            data: result,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isNotFound = error instanceof AppError && error.statusCode === 404;

        writeAuditLog({
            actorUserId: actor.userId,
            actorRole: actor.userRole,
            action: 'get_admin_link',
            targetId: linkId,
            targetDisplay: null,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.GET,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Failed,
            errorMessage: message,
            diff: null,
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

    const parsedBody = deactivateAdminLinksBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
        nextAppError(next, 400, INVALID_QUERY_MESSAGE);
        return;
    }

    try {
        const result = await deactivateAdminLinksService(parsedBody.data);
        const responseStatus =
            result.failed.length === 0 ? 200 : result.succeeded.length === 0 ? 422 : 207;
        const auditStatus = result.succeeded.length === 0 ? AuditStatus.Failed : AuditStatus.Success;
        const errorMessage = result.succeeded.length === 0 ? ALL_LINKS_DEACTIVATE_FAILED_MESSAGE : null;

        writeAuditLog({
            actorUserId: actor.userId,
            actorRole: actor.userRole,
            action: 'deactivate_admin_link',
            targetId: null,
            targetDisplay: null,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.PATCH,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: auditStatus,
            errorMessage,
            diff: {
                succeeded: result.succeeded,
                failed: result.failed,
            },
        });

        if (responseStatus === 422) {
            nextAppError(next, 422, ALL_LINKS_DEACTIVATE_FAILED_MESSAGE);
            return;
        }

        res.status(responseStatus).json({
            ok: true,
            data: result,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        writeAuditLog({
            actorUserId: actor.userId,
            actorRole: actor.userRole,
            action: 'deactivate_admin_link',
            targetId: null,
            targetDisplay: null,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.PATCH,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Failed,
            errorMessage: message,
            diff: null,
        });

        next(error);
    }
};

export const deleteAdminLinkById = async (
    req: Request,
    res: Response,
    next: NextFunction = () => undefined,
): Promise<void> => {
    const actor = parseActor(req, next);
    if (!actor) {
        return;
    }

    const parsedBody = deleteAdminLinksBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
        nextAppError(next, 400, INVALID_QUERY_MESSAGE);
        return;
    }

    try {
        const result = await deleteAdminLinksService(parsedBody.data);
        const responseStatus =
            result.failed.length === 0 ? 200 : result.succeeded.length === 0 ? 422 : 207;
        const auditStatus = result.succeeded.length === 0 ? AuditStatus.Failed : AuditStatus.Success;
        const errorMessage = result.succeeded.length === 0 ? ALL_LINKS_DELETE_FAILED_MESSAGE : null;

        writeAuditLog({
            actorUserId: actor.userId,
            actorRole: actor.userRole,
            action: 'delete_admin_link',
            targetId: null,
            targetDisplay: null,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.DELETE,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: auditStatus,
            errorMessage,
            diff: {
                succeeded: result.succeeded,
                failed: result.failed,
            },
        });

        if (responseStatus === 422) {
            nextAppError(next, 422, ALL_LINKS_DELETE_FAILED_MESSAGE);
            return;
        }

        res.status(responseStatus).json({
            ok: true,
            data: result,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        writeAuditLog({
            actorUserId: actor.userId,
            actorRole: actor.userRole,
            action: 'delete_admin_link',
            targetId: null,
            targetDisplay: null,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.DELETE,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Failed,
            errorMessage: message,
            diff: null,
        });

        next(error);
    }
};

export const restoreAdminLinks = async (
    req: Request,
    res: Response,
    next: NextFunction = () => undefined,
): Promise<void> => {
    const actor = parseActor(req, next);
    if (!actor) {
        return;
    }

    const parsedBody = restoreAdminLinksBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
        nextAppError(next, 400, INVALID_QUERY_MESSAGE);
        return;
    }

    try {
        const result = await restoreAdminLinksService(parsedBody.data);
        const responseStatus =
            result.failed.length === 0 ? 200 : result.succeeded.length === 0 ? 422 : 207;
        const auditStatus = result.succeeded.length === 0 ? AuditStatus.Failed : AuditStatus.Success;
        const errorMessage = result.succeeded.length === 0 ? ALL_LINKS_RESTORE_FAILED_MESSAGE : null;

        writeAuditLog({
            actorUserId: actor.userId,
            actorRole: actor.userRole,
            action: 'restore_admin_link',
            targetId: null,
            targetDisplay: null,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.PATCH,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: auditStatus,
            errorMessage,
            diff: {
                succeeded: result.succeeded,
                failed: result.failed,
            },
        });

        if (responseStatus === 422) {
            nextAppError(next, 422, ALL_LINKS_RESTORE_FAILED_MESSAGE);
            return;
        }

        res.status(responseStatus).json({
            ok: true,
            data: result,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        writeAuditLog({
            actorUserId: actor.userId,
            actorRole: actor.userRole,
            action: 'restore_admin_link',
            targetId: null,
            targetDisplay: null,
            requestPath: req.originalUrl,
            requestMethod: AuditRequestMethod.PATCH,
            requestIp: req.ip,
            userAgent: req.get('user-agent') ?? null,
            status: AuditStatus.Failed,
            errorMessage: message,
            diff: null,
        });

        next(error);
    }
};
