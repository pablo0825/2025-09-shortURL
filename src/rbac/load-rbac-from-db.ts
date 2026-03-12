import { buildCacheKey, cacheSetMembers } from '../lib/cache';
import { logger } from '../lib/logger';
import { findRolesWithPermissionsForRbac } from '../repositories/admin/role-repository';

const RBAC_PERMISSION_TTL_SECONDS = 24 * 60 * 60;

interface RbacPermission {
    module: string;
    type: string;
}

interface RbacRole {
    type: string;
    permissions: RbacPermission[];
}

export async function loadRbacFromDb(retries: number = 3): Promise<void> {
    logger.info('[RBAC] Loading RBAC permissions into Redis...');

    // Rbac 初始化，加上重試機制
    for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
            await loadRbacFromRepository();
            return;
        } catch (error) {
            logger.error(`[RBAC] Failed to load RBAC (attempt ${attempt}/${retries}):`, error);

            // 重試次數超過最大次數，返回 error
            if (attempt === retries) {
                throw error;
            }

            // 等一段時間在重試
            // promise 代表時間結束這件事情
            // 重試時間是線性增加
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
    }
}

const loadRbacFromRepository = async (): Promise<void> => {
    const rows = await findRolesWithPermissionsForRbac();

    if (!rows.length) {
        throw new Error('[RBAC] no roles found from database');
    }

    const roleMap = new Map<string, RbacRole>();

    for (const row of rows) {
        // role_type 不存在
        if (!roleMap.has(row.role_type)) {
            // 把 role_type 存到 roleMap 中
            // 初始化的一種手法
            roleMap.set(row.role_type, {
                type: row.role_type,
                permissions: [],
            });
        }

        if (row.module && row.type) {
            // 用 role_type 作為 key 去 roleMap 中找到 permissions，並把 module 和 type push 進去
            roleMap.get(row.role_type)!.permissions.push({
                module: row.module,
                type: row.type,
            });
        }
    }

    // Map {
    //     'admin' => { type: 'admin', permissions: [...] },
    //     'user' => { type: 'user', permissions: [...] }
    //   }
    // 用 roleMap.values() 取出後，變成 { type: 'admin', permissions: [...] }
    // 用 Array.from() 轉成陣列
    //  [
    //     { type: 'admin', permissions: [...] },
    //     { type: 'user', permissions: [...] }
    //   ]
    const redisWrites = Array.from(roleMap.values()).map(async (role) => {
        // role:user:permissions
        const redisKey:string = buildCacheKey('role', `${role.type}:permissions`);
        // 用 map 來合併 permission 字串，並返回一個 string 群組
        const permissionMembers:string[] = role.permissions.map((item) => `${item.module}:${item.type}`);

        if (!permissionMembers.length) {
            await cacheSetMembers(redisKey, [], RBAC_PERMISSION_TTL_SECONDS);
            logger.warn(`[RBAC] role ${role.type} has no permissions`);
            return;
        }

        await cacheSetMembers(redisKey, permissionMembers, RBAC_PERMISSION_TTL_SECONDS);
        logger.info(`[RBAC] loaded ${permissionMembers.length} permissions for role ${role.type}`);
    });

    await Promise.all(redisWrites);
    logger.info(`[RBAC] load completed for ${roleMap.size} roles`);
};
