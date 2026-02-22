import type { PoolClient } from 'pg';
import { pool } from '../db/pool';

export interface InsertAdminAuditLogInput {
    actorUserId: number;
    actorRole: 'admin' | 'assistant';
    action: string;
    targetType: 'user' | 'link' | 'role' | 'permission' | 'stats' | 'log';
    targetId: number | null;
    targetDisplay: string | null;
    requestPath: string;
    requestMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
    requestIp: string | null;
    userAgent: string | null;
    status: 'success' | 'failed';
    errorMessage: string | null;
    diff: object | null;
}

export const insertAdminAuditLog = async (
    input: InsertAdminAuditLogInput,
    client?: PoolClient,
): Promise<void> => {
    const queryRunner = client ?? pool;
    const sql = `
        INSERT INTO admin_audit_logs (
            actor_user_id,
            actor_role,
            action,
            target_type,
            target_id,
            target_display,
            request_path,
            request_method,
            request_ip,
            user_agent,
            status,
            error_message,
            diff
        )
        VALUES (
            $1, $2, $3,
            $4, $5, $6,
            $7, $8, $9,
            $10, $11, $12, $13
        )
    `;

    await queryRunner.query(sql, [
        input.actorUserId,
        input.actorRole,
        input.action,
        input.targetType,
        input.targetId,
        input.targetDisplay,
        input.requestPath,
        input.requestMethod,
        input.requestIp,
        input.userAgent,
        input.status,
        input.errorMessage,
        input.diff,
    ]);
};

