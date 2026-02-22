// loadRbacFromDb.ts
import {pool} from "../db/pool";
import {logger} from "../lib/logger";
import {buildCacheKey, cacheSetMembers} from "../lib/cache";

// 初始化 Rbac ，設有重試次數3次
export async function loadRbacFromDb (retries:number = 3) {
    //
    logger.info("[RBAC] 開始載入權限至 Redis...");

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await _loadRbacFromDb();

            return;
        } catch (err) {
            logger.error(`❌ 載入 RBAC 失敗 (嘗試 ${attempt}/${retries}):`, err);

            // 重試次數到上限後，結束迴圈
            if (attempt === retries) throw err;

            // 等待一段時間後，再次嘗試
            // 在 1000 * attempt 毫秒後，在呼叫 resolve
            // 呼叫 resolve 的意思是，等待結束了，可以繼續了
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}


async function _loadRbacFromDb () {
    // 取出 all role
    const roles = await pool.query<{id:number, type:string}>('SELECT id, type FROM role');

    if (roles.rowCount === 0) {
        throw new Error("[RBAC] 沒有找到角色資料");
    }

    // [標記] 有用{} 記得加上return，不然不會傳資料回來
    // 建立多個查詢工作 (promise)
    // promise 陣列，如：Promise<pg.QueryResult<{ module: string; type: string }>>
    const permissions = roles.rows.map((role: { id: number; type: string }) => {
        return  pool.query<{module:string, type:string}>('SELECT p.module, p.type FROM permissions p JOIN role_permissions rp ON p.id = rp.permissions_id WHERE rp.role_id = $1', [role.id]);
    });

    // 一次跑複數查詢，不是成功，就是失敗
    // 以 role 為分組
    // 回傳資料，如：{ rows: [ { module: 'user', type: 'read' }, { module: 'user', type: 'write' } ], ... }
    const permissionResults = await Promise.all(permissions);

    // 把每個 role 的 permissions 寫入到 redis 中
    const redisWrites = roles.rows.map(async (role: { id: number; type: string }, index: number) => {
        const redisKey = buildCacheKey("role", `${role.type}:permissions`);

        // 把module, type等欄位組合
        const permission = permissionResults[index].rows.map((p: { module: string; type: string }) => {
            // 如：read_profile:user
            return `${p.module}:${p.type}`
        });

        // 檢查角色有沒有權限
        if (permission.length === 0) {
            await cacheSetMembers(redisKey, []);
            logger.warn(`[RBAC] 角色 ${role.type} 沒有權限 (已清除舊的快取)`);
            return;
        }

        await cacheSetMembers(redisKey, permission);

        logger.info(`[RBAC] 角色 ${role.type}: ${permission.length} 個權限已載入`);
    });

    //
    await Promise.all(redisWrites);

    logger.info(`[RBAC] RBAC 權限載入完成,共 ${roles.rowCount} 個角色`);
}
