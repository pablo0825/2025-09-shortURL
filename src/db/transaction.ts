import type { PoolClient } from 'pg';
import { pool } from './pool';

export const withTransaction = async <T>(
    runner: (client: PoolClient) => Promise<T>,
): Promise<T> => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await runner(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch {
            // ignore rollback failure
        }
        throw err;
    } finally {
        client.release();
    }
};
