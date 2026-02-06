// writeAdminAuditLogToDb.ts
import {pool} from "../pool";
import type {PoolClient} from "pg";

type AuditLogInput = {
    actorUserId:number,
    actorRole: "admin" | "assistant",
    action:string,
    targetType: "user" | "link" | "role" | "permission" | "stats" | "log",
    targetId?:number | null,
    targetDisplay?: string | null,
    requestPath: string;
    requestMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD";
    requestIp?: string | null;
    userAgent?: string | null;
    status: "success" | "failed";
    errorMessage?: string | null;
    diff?: object | null;
}

// 寫入 audit log 失敗時，不影響主要流程
export async function writeAdminAuditLogToDb(input:AuditLogInput, client?: PoolClient):Promise<void> {
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
        diff = null
    } = input;

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

    try {
        const queryRunner = client || pool;

        await queryRunner.query(sql, [
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
            diff
        ]);
    } catch (err) {
        console.error("[admin_audit_log] 撰寫失敗", { err, actorUserId, action });
    }
}
