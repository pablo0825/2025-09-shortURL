import { z } from 'zod';
import { buildCacheKey, cacheDel, cacheGet, cacheSet } from '../lib/cache';
import type { PermissionTreeNode } from '../types/types';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool';
import {
    checkRoleExistsById,
    deleteRolePermissionsByIds,
    findAllRoles,
    findPermissionIdsByRoleId,
    findPermissionRowsByModuleTypePairs,
    findPermissionTreeRowsByRoleId,
    findRoleForUpdate,
    findPermissionsByRoleId,
    insertRolePermissionsByIds,
    updateRoleVersion,
} from '../repositories/admin-role-repository';
import {roleArraySchema} from "../schemas/admin-schema";

// const roleArraySchema = z.array(
//     z.object({
//         id: z.number().int().positive(),
//         type: z.string().min(1),
//     }),
// );

const ROLES_CACHE_KEY = buildCacheKey('admin_roles', 'list_v1');
const ROLES_CACHE_TTL_SECONDS = 300;

interface GetRolePermissionsResult {
    roleExists: boolean;
    permissions: Array<{
        id: number;
        name: string;
        module: string;
        type: string;
        description: string | null;
        parent_id: number | null;
    }>;
}

interface ManageRolePermissionsInput {
    roleId: number;
    permissions: Array<{ module: string; type: string }>;
    reason?: string;
    version?: number;
}

interface ManageRolePermissionsResult {
    roleType: string;
    beforeVersion: number;
    afterVersion: number;
    affected: {
        added: number;
        removed: number;
    };
    reason: string | null;
}

const wrapServiceError = (context: string, error: unknown): Error => {
    const msg = error instanceof Error ? error.message : String(error);
    const wrappedError = new Error(`[${context}] ${msg}`);

    if (error instanceof Error) {
        wrappedError.name = error.name;
    }

    return wrappedError;
};

export const getRolesService = async () => {
    try {
        const cached = await cacheGet(ROLES_CACHE_KEY);
        if (cached) {
            try {
                const parsed = roleArraySchema.safeParse(JSON.parse(cached));
                if (parsed.success) {
                    return parsed.data;
                }
            } catch (_error) {
                // ignore parse error and query DB below
            }

            await cacheDel(ROLES_CACHE_KEY);
        }

        const roles = await findAllRoles();
        if (!roles.length) {
            return [];
        }

        await cacheSet(ROLES_CACHE_KEY, JSON.stringify(roles), ROLES_CACHE_TTL_SECONDS);
        return roles;
    } catch (error) {
        throw wrapServiceError('adminRoleService.getRoles', error);
    }
};

export const getRolePermissionsService = async (
    roleId: number,
): Promise<GetRolePermissionsResult> => {
    try {
        const roleExists = await checkRoleExistsById(roleId);
        if (!roleExists) {
            return {
                roleExists: false,
                permissions: [],
            };
        }

        const permissions = await findPermissionsByRoleId(roleId);
        return {
            roleExists: true,
            permissions,
        };
    } catch (error) {
        throw wrapServiceError('adminRoleService.getRolePermissions', error);
    }
};

export const getRolePermissionsTreeService = async (
    roleId: number,
): Promise<{ roleExists: boolean; data: PermissionTreeNode[] }> => {
    try {
        const roleExists = await checkRoleExistsById(roleId);
        if (!roleExists) {
            return {
                roleExists: false,
                data: [],
            };
        }

        const rows = await findPermissionTreeRowsByRoleId(roleId);
        const nodeMap = new Map<number, PermissionTreeNode>();

        for (const row of rows) {
            nodeMap.set(row.id, {
                id: row.id,
                name: row.name,
                module: row.module,
                type: row.type,
                description: row.description,
                parentId: row.parent_id,
                selected: row.selected,
                inherited: !row.selected,
                children: [],
            });
        }

        const roots: PermissionTreeNode[] = [];
        for (const node of nodeMap.values()) {
            if (node.parentId !== null && nodeMap.has(node.parentId)) {
                // node.parentId 存在，且找得到 parent node，就把 child node push to parent node
                nodeMap.get(node.parentId)!.children.push(node);
            } else {
                // 沒有 parent node，就放進去 roots 裡面
                roots.push(node);
            }
        }

        return {
            roleExists: true,
            data: roots,
        };
    } catch (error) {
        throw wrapServiceError('adminRoleService.getRolePermissionsTree', error);
    }
};

export const manageRolePermissionsService = async (
    input: ManageRolePermissionsInput,
): Promise<ManageRolePermissionsResult> => {
    let client: PoolClient | undefined;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const role = await findRoleForUpdate(client, input.roleId);
        if (!role) {
            const notFoundError = new Error('角色不存在');
            notFoundError.name = 'RoleNotFoundError';
            throw notFoundError;
        }

        if (typeof input.version === 'number' && role.version !== input.version) {
            const versionError = new Error('版本號異常');
            versionError.name = 'RoleVersionConflictError';
            throw versionError;
        }

        // 去重複，利用 map 的特性
        //  組成資料，如:['user|read', { module: 'user', type: 'read' }],
        // .values()後， 取出 value，如: { module: 'user', type: 'read' }
        const uniquePairs = Array.from(
            new Map(input.permissions.map((item) => [`${item.module}|${item.type}`, item])).values(),
        );

        const permissionRows = await findPermissionRowsByModuleTypePairs(client, uniquePairs);
        if (uniquePairs.length !== permissionRows.length) {
            const invalidPermissionError = new Error('權限不存在');
            invalidPermissionError.name = 'PermissionNotFoundError';
            throw invalidPermissionError;
        }

        // 使用者提交的 permission id 集合 (要變更的)
        const requestedPermissionIds: number[] = permissionRows.map((row) => row.id);
        // 目前 role 有的 permission id
        const currentPermissionIds: number[] = await findPermissionIdsByRoleId(client, input.roleId);

        const currentSet = new Set<number>(currentPermissionIds);
        const requestedSet = new Set<number>(requestedPermissionIds);

        // 要新增的 permission id
        const toAdd: number[] = requestedPermissionIds.filter((id) => !currentSet.has(id));
        // 要移除的 permission id
        const toRemove: number[] = currentPermissionIds.filter((id) => !requestedSet.has(id));

        // 刪除/新增 permission
        const removed:number = await deleteRolePermissionsByIds(client, input.roleId, toRemove);
        const added:number = await insertRolePermissionsByIds(client, input.roleId, toAdd);

        // 更新 role 的 version
        const nextVersion = role.version + 1;
        await updateRoleVersion(client, input.roleId, nextVersion);

        await client.query('COMMIT');

        return {
            roleType: role.type,
            beforeVersion: role.version,
            afterVersion: nextVersion,
            affected: {
                added,
                removed,
            },
            reason: input.reason ?? null,
        };
    } catch (error) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                throw wrapServiceError('adminRoleService.manageRolePermissions.rollback', rollbackError);
            }
        }
        throw wrapServiceError('adminRoleService.manageRolePermissions', error);
    } finally {
        if (client) {
            client.release();
        }
    }
};
