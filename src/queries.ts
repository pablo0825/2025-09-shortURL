import {pool} from "./pool";
import type { PoolClient } from "pg";
import redis from "../src/redis/redisClient"

// [未完成]
// export async function loadRbacFromDb () {
//     //
//     console.log("[RBAC] 開始載入權限至 Redis...");
//
//     try {
//         // 取出 all role
//         const roles = await pool.query<{id:number, type:string}>('SELECT id, type FROM role');
//
//         if (roles.rowCount === 0) {
//             throw new Error("[RBAC] 沒有找到角色資料");
//         }
//
//         console.log(roles.rows);
//
//         // [標記] 有用{} 記得加上return，不然不會傳資料回來
//         const permissions = roles.rows.map(role => {
//            return  pool.query<{module:string, type:string}>('SELECT p.module, p.type FROM permissions p JOIN role_permissions rp ON p.id = rp.permissions_id WHERE rp.role_id = $1', [role.id]);
//         });
//
//         // 一次跑複數查詢，不是成功，就是失敗
//         const permissionResults = await Promise.all(permissions);
//
//         const redisWrites = roles.rows.map(async (role, index) => {
//             const redisKey = `role:${role.type}:permissions`;
//
//             // 把module, type等欄位組合
//             const permission = permissionResults[index].rows.map(p => {
//                 return `${p.module}:${p.type}`
//             });
//
//             // 把舊資料刪掉
//             await redis.del(redisKey);
//
//             // 檢查角色有沒有權限
//             if (permission.length === 0) {
//                 console.warn(`[RBAC] 角色 ${role.type} 沒有權限 (已清除舊的快取)`);
//                 return Promise.resolve();
//             }
//
//             // const pipeline = redis.pipeline();
//
//             // 把permission寫入到redis中
//             await redis.sadd(redisKey, ...permission);
//
//             // 設定過期時間
//             // await redis.expire(redisKey, 3600);
//
//             console.log(`[RBAC] ${role.type}: ${permission.length} 個權限已載入`);
//         });
//
//         //
//         await Promise.all(redisWrites);
//
//         console.log(`[RBAC] ✅ RBAC 權限載入完成,共 ${roles.rowCount} 個角色`);
//     } catch (err) {
//         console.error('[RBAC] ❌ 載入 RBAC 權限失敗:', err);
//         throw err;
//     }
// }
//
// loadRbacFromDb();

