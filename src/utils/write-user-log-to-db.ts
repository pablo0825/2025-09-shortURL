// writeUserLogToDB.ts
import type { PoolClient } from 'pg';
import { UserLogActionEnum } from '../enum/user-log-action-enum';
import { logger } from '../lib/logger';
import { insertUserLog } from '../repositories/user-log-repository';

interface UserLgoOptions {
    detail?: string;
    // Record<keys, type>
    // Record 是ts的泛用型別
    metadata?: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
}

export async function writeUserLogToDB(
        userId: number,
        action: UserLogActionEnum,
        userLog: UserLgoOptions = {},
        client?: PoolClient,
): Promise<void> {
    const {
        detail = null,
        metadata = {},
        ipAddress = null,
        userAgent = null,
    } = userLog;

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
        logger.warn('[user_log] 寫入失敗', { err, userId, action });
    }
}
