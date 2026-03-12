import type { PoolClient } from 'pg';
import { pool } from './pool';

// <T> 按照 runner 回傳值推導型別
// 把 runner 當作函式傳到 withTransaction 裡面，讓 withTransaction 在內部呼叫
// callback function 的用法
// 因為 db 操作是非同步的，所以需要用 promise 去表示結果，如:還沒做完、做完了、失敗了
// 這樣才能夠判斷，db 操作的結果，進而做出正確的應對
export const withTransaction = async <T>(
    runner: (client: PoolClient) => Promise<T>,
): Promise<T> => {
    let client: PoolClient | undefined;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const result = await runner(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        try {
            await client?.query('ROLLBACK');
        } catch (rollbackErr) {
            const originalMessage = err instanceof Error ? err.message : String(err);
            const rollbackMessage = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);

            throw new Error(
                `[withTransaction] transaction failed: ${originalMessage}; rollback failed: ${rollbackMessage}`,
            );
        }
        throw err;
    } finally {
        client?.release();
    }
};
