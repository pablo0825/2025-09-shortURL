// loadRbacFromDb.ts
import {pool} from "../pool";
import redis from "../redis/redisClient";

export async function loadRbacFromDb (retries:number = 3) {
    //
    console.log("[RBAC] 開始載入權限至 Redis...");

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await _loadRbacFromDb();

            return;
        } catch (err) {
            console.error(`❌ 載入 RBAC 失敗 (嘗試 ${attempt}/${retries}):`, err);

            // 重試次數到上限後，結束迴圈
            if (attempt === retries) throw err;

            // 等待一段時間後，再次嘗試
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

    console.log(roles.rows);

    // [標記] 有用{} 記得加上return，不然不會傳資料回來
    const permissions = roles.rows.map(role => {
        return  pool.query<{module:string, type:string}>('SELECT p.module, p.type FROM permissions p JOIN role_permissions rp ON p.id = rp.permissions_id WHERE rp.role_id = $1', [role.id]);
    });

    // 一次跑複數查詢，不是成功，就是失敗
    const permissionResults = await Promise.all(permissions);

    const redisWrites = roles.rows.map(async (role, index) => {
        const redisKey = `role:${role.type}:permissions`;

        // 把module, type等欄位組合
        const permission = permissionResults[index].rows.map(p => {
            return `${p.module}:${p.type}`
        });

        // 把舊資料刪掉
        await redis.del(redisKey);

        // 檢查角色有沒有權限
        if (permission.length === 0) {
            console.warn(`[RBAC] 角色 ${role.type} 沒有權限 (已清除舊的快取)`);
            return;
        }

        // const pipeline = redis.pipeline();

        // 把permission寫入到redis中
        await redis.sadd(redisKey, ...permission);

        // 設定過期時間
        // await redis.expire(redisKey, 3600);

        console.log(`[RBAC] 角色 ${role.type}: ${permission.length} 個權限已載入`);
    });

    //
    await Promise.all(redisWrites);

    console.log(`[RBAC] RBAC 權限載入完成,共 ${roles.rowCount} 個角色`);
}
