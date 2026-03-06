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

    for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
            await loadRbacFromRepository();
            return;
        } catch (error) {
            logger.error(`[RBAC] Failed to load RBAC (attempt ${attempt}/${retries}):`, error);

            if (attempt === retries) {
                throw error;
            }

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
        if (!roleMap.has(row.role_type)) {
            roleMap.set(row.role_type, {
                type: row.role_type,
                permissions: [],
            });
        }

        if (row.module && row.type) {
            roleMap.get(row.role_type)!.permissions.push({
                module: row.module,
                type: row.type,
            });
        }
    }

    const redisWrites = Array.from(roleMap.values()).map(async (role) => {
        const redisKey = buildCacheKey('role', `${role.type}:permissions`);
        const permissionMembers = role.permissions.map((item) => `${item.module}:${item.type}`);

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
