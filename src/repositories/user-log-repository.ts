import type { PoolClient } from 'pg';
import { pool } from '../db/pool';

export interface InsertUserLogInput {
    userId: number;
    action: string;
    detail: string | null;
    metadata: Record<string, unknown>;
    ipAddress: string | null;
    userAgent: string | null;
}

export const insertUserLog = async (
    input: InsertUserLogInput,
    client?: PoolClient,
): Promise<void> => {
    const queryRunner = client ?? pool;
    await queryRunner.query(
        'INSERT INTO user_log(user_id, action, detail, metadata, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
        [
            input.userId,
            input.action,
            input.detail,
            input.metadata,
            input.ipAddress,
            input.userAgent,
        ],
    );
};

