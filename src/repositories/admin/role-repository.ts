import type { PoolClient } from 'pg';
import { pool } from '../../db/pool';

export interface AdminRoleRow {
    id: number;
    type: string;
}

export interface RolePermissionRow {
    id: number;
    name: string;
    module: string;
    type: string;
    description: string | null;
    parent_id: number | null;
}

export interface RolePermissionTreeRow {
    id: number;
    name: string;
    module: string;
    type: string;
    description: string | null;
    parent_id: number | null;
    selected: boolean;
}

export interface RoleVersionRow {
    id: number;
    type: string;
    version: number;
}

export interface PermissionLookupRow {
    id: number;
    module: string;
    type: string;
}

export interface RbacRolePermissionRow {
    role_id: number;
    role_type: string;
    module: string | null;
    type: string | null;
}

export const findAllRoles = async (): Promise<AdminRoleRow[]> => {
    const result = await pool.query<AdminRoleRow>('SELECT id, type FROM role ORDER BY id DESC');
    return result.rows;
};

export const findRolesWithPermissionsForRbac = async (): Promise<RbacRolePermissionRow[]> => {
    const sql = `SELECT
        r.id AS role_id,
        r.type AS role_type,
        p.module,
        p.type
    FROM role r
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    LEFT JOIN permissions p ON p.id = rp.permissions_id
    ORDER BY r.id ASC, p.module ASC NULLS LAST, p.type ASC NULLS LAST, p.id ASC NULLS LAST`;
    // NULL LAST 表示把 NULL 放在資料最後面

    const result = await pool.query<RbacRolePermissionRow>(sql);
    return result.rows;
};

export const checkRoleExistsById = async (roleId: number): Promise<boolean> => {
    const result = await pool.query('SELECT 1 FROM role WHERE id = $1 LIMIT 1', [roleId]);
    return (result.rowCount ?? 0) > 0;
};

export const findPermissionsByRoleId = async (roleId: number): Promise<RolePermissionRow[]> => {
    const sql =
        'SELECT p.id, p.name, p.module, p.type, p.description, p.parent_id FROM role_permissions rp JOIN permissions p ON p.id = rp.permissions_id WHERE rp.role_id = $1 ORDER BY p.module ASC, p.type ASC, p.id ASC';
    const result = await pool.query<RolePermissionRow>(sql, [roleId]);

    return result.rows;
};

export const findPermissionTreeRowsByRoleId = async (
    roleId: number,
): Promise<RolePermissionTreeRow[]> => {
    const sql = `WITH RECURSIVE selected_perms AS (
        SELECT p.id, p.parent_id
        FROM role_permissions rp
        JOIN permissions p ON p.id = rp.permissions_id
        WHERE rp.role_id = $1
    ),
    ancestors AS (
        SELECT id, parent_id FROM selected_perms
        UNION
        SELECT p.id, p.parent_id
        FROM permissions p
        JOIN ancestors a ON a.parent_id = p.id
    ),
    all_needed AS (
        SELECT DISTINCT id FROM ancestors
    )
    SELECT
        p.id,
        p.name,
        p.module,
        p.type,
        p.description,
        p.parent_id,
        EXISTS(
            SELECT 1
            FROM role_permissions rp
            WHERE rp.role_id = $1
                AND rp.permissions_id = p.id
        ) AS selected
    FROM permissions p
    JOIN all_needed n ON n.id = p.id
    ORDER BY p.module ASC, p.type ASC, p.id ASC`;

    const result = await pool.query<RolePermissionTreeRow>(sql, [roleId]);
    return result.rows;
};

export const findRoleForUpdate = async (
    client: PoolClient,
    roleId: number,
): Promise<RoleVersionRow | null> => {
    const result = await client.query<RoleVersionRow>(
        'SELECT id, type, version FROM role WHERE id = $1 FOR UPDATE',
        [roleId],
    );

    if (result.rowCount === 0) {
        return null;
    }

    return result.rows[0];
};

export const findPermissionRowsByModuleTypePairs = async (
    client: PoolClient,
    items: Array<{ module: string; type: string }>,
): Promise<PermissionLookupRow[]> => {
    if (!items.length) {
        return [];
    }

    const types: string[] = items.map((item) => item.type);
    const modules: string[] = items.map((item) => item.module);
    // unnest($1, $2) 變為多列資料，拿去跟 permissions 做比對
    // i 跟 p 比較
    const sql = `SELECT p.id, p.type, p.module
        FROM unnest($1::text[], $2::text[]) AS i(type, module)
        JOIN permissions p ON p.type = i.type AND p.module = i.module`;

    const result = await client.query<PermissionLookupRow>(sql, [types, modules]);
    return result.rows;
};

export const findPermissionIdsByRoleId = async (
    client: PoolClient,
    roleId: number,
): Promise<number[]> => {
    const result = await client.query<{ permissions_id: number }>(
        'SELECT permissions_id FROM role_permissions WHERE role_id = $1',
        [roleId],
    );

    return result.rows.map((row) => row.permissions_id);
};

export const deleteRolePermissionsByIds = async (
    client: PoolClient,
    roleId: number,
    permissionIds: number[],
): Promise<number> => {
    if (!permissionIds.length) {
        return 0;
    }

    const result = await client.query(
        'DELETE FROM role_permissions WHERE role_id = $1 AND permissions_id = ANY($2::int[])',
        [roleId, permissionIds],
    );
    return result.rowCount ?? 0;
};

export const insertRolePermissionsByIds = async (
    client: PoolClient,
    roleId: number,
    permissionIds: number[],
): Promise<number> => {
    if (!permissionIds.length) {
        return 0;
    }

    const result = await client.query(
        'INSERT INTO role_permissions(role_id, permissions_id) SELECT $1, x FROM unnest($2::int[]) AS x ON CONFLICT DO NOTHING',
        [roleId, permissionIds],
    );
    return result.rowCount ?? 0;
};

export const updateRoleVersion = async (
    client: PoolClient,
    roleId: number,
    nextVersion: number,
): Promise<number> => {
    const result = await client.query('UPDATE role SET version = $1 WHERE id = $2', [
        nextVersion,
        roleId,
    ]);
    return result.rowCount ?? 0;
};
