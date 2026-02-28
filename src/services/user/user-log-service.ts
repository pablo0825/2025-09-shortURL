import type { PoolClient } from 'pg';
import { type UserLogActionEnum } from '../../enum/user-log-action-enum';
import { logger } from '../../lib/logger';
import { insertUserLog } from '../../repositories/user/user-log-repository';

export interface UserLogOptions {
    detail?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
}

export async function recordUserLogService(
    userId: number,
    action: UserLogActionEnum,
    userLog: UserLogOptions = {},
    client?: PoolClient,
): Promise<void> {
    const { detail = null, metadata = {}, ipAddress = null, userAgent = null } = userLog;

    try {
        await insertUserLog(
            {
                userId,
                action,
                detail,
                metadata,
                ipAddress,
                userAgent,
            },
            client,
        );
    } catch (err) {
        logger.warn('[userLogService.record] 寫入失敗', { err, userId, action });
    }
}
