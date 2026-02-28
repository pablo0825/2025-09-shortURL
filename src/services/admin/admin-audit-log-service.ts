import type { PoolClient } from 'pg';
import { logger } from '../../lib/logger';
import { insertAdminAuditLog } from '../../repositories/admin/audit-log-repository';

export type AdminAuditLogInput = {
    actorUserId: number;
    actorRole: 'admin' | 'assistant';
    action: string;
    targetType: 'user' | 'link' | 'role' | 'permission' | 'stats' | 'log';
    targetId?: number | null;
    targetDisplay?: string | null;
    requestPath: string;
    requestMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
    requestIp?: string | null;
    userAgent?: string | null;
    status: 'success' | 'failed';
    errorMessage?: string | null;
    diff?: object | null;
};

export async function recordAdminAuditLogService(
    input: AdminAuditLogInput,
    client?: PoolClient,
): Promise<void> {
    const {
        actorUserId,
        actorRole,
        action,
        targetType,
        targetId = null,
        targetDisplay = null,
        requestPath,
        requestMethod,
        requestIp = null,
        userAgent = null,
        status,
        errorMessage = null,
        diff = null,
    } = input;

    try {
        await insertAdminAuditLog(
            {
                actorUserId,
                actorRole,
                action,
                targetType,
                targetId,
                targetDisplay,
                requestPath,
                requestMethod,
                requestIp,
                userAgent,
                status,
                errorMessage,
                diff,
            },
            client,
        );
    } catch (err) {
        logger.warn('[adminAuditLogService.record] 撰寫失敗', { err, actorUserId, action });
    }
}
