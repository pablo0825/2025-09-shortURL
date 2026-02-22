import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/db/pool', () => ({
    pool: {
        connect: vi.fn(),
    },
}));

vi.mock('../../src/lib/cache', () => ({
    buildCacheKey: vi.fn((module: string, identifier: string) => `${module}:${identifier}`),
    cacheDel: vi.fn(),
    cacheGet: vi.fn(),
    cacheSet: vi.fn(),
}));

vi.mock('../../src/repositories/admin-role-repository', () => ({
    checkRoleExistsById: vi.fn(),
    findAllRoles: vi.fn(),
    findPermissionTreeRowsByRoleId: vi.fn(),
    findPermissionsByRoleId: vi.fn(),
    findRoleForUpdate: vi.fn(),
    findPermissionRowsByModuleTypePairs: vi.fn(),
    findPermissionIdsByRoleId: vi.fn(),
    deleteRolePermissionsByIds: vi.fn(),
    insertRolePermissionsByIds: vi.fn(),
    updateRoleVersion: vi.fn(),
}));

import { pool } from '../../src/db/pool';
import { cacheGet, cacheSet } from '../../src/lib/cache';
import {
    checkRoleExistsById,
    deleteRolePermissionsByIds,
    findAllRoles,
    findPermissionIdsByRoleId,
    findPermissionRowsByModuleTypePairs,
    findPermissionTreeRowsByRoleId,
    findPermissionsByRoleId,
    findRoleForUpdate,
    insertRolePermissionsByIds,
    updateRoleVersion,
} from '../../src/repositories/admin-role-repository';
import {
    getRolePermissionsService,
    getRolePermissionsTreeService,
    getRolesService,
    manageRolePermissionsService,
} from '../../src/services/admin-role-service';

const queryMock = vi.fn();
const releaseMock = vi.fn();
const fakeClient = { query: queryMock, release: releaseMock };

const mockedPool = vi.mocked(pool);
const mockedCacheGet = vi.mocked(cacheGet);
const mockedCacheSet = vi.mocked(cacheSet);
const mockedCheckRoleExistsById = vi.mocked(checkRoleExistsById);
const mockedFindAllRoles = vi.mocked(findAllRoles);
const mockedFindPermissionsByRoleId = vi.mocked(findPermissionsByRoleId);
const mockedFindPermissionTreeRowsByRoleId = vi.mocked(findPermissionTreeRowsByRoleId);
const mockedFindRoleForUpdate = vi.mocked(findRoleForUpdate);
const mockedFindPermissionRowsByModuleTypePairs = vi.mocked(findPermissionRowsByModuleTypePairs);
const mockedFindPermissionIdsByRoleId = vi.mocked(findPermissionIdsByRoleId);
const mockedDeleteRolePermissionsByIds = vi.mocked(deleteRolePermissionsByIds);
const mockedInsertRolePermissionsByIds = vi.mocked(insertRolePermissionsByIds);
const mockedUpdateRoleVersion = vi.mocked(updateRoleVersion);

describe('admin-role-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedPool.connect.mockResolvedValue(fakeClient as never);
        queryMock.mockResolvedValue({ rowCount: 1 });
    });

    it('should return roles from cache when cache hit', async () => {
        mockedCacheGet.mockResolvedValue(JSON.stringify([{ id: 1, type: 'admin' }]));

        const roles = await getRolesService();

        expect(roles).toEqual([{ id: 1, type: 'admin' }]);
        expect(mockedFindAllRoles).not.toHaveBeenCalled();
    });

    it('should query db and cache roles when cache miss', async () => {
        mockedCacheGet.mockResolvedValue(null);
        mockedFindAllRoles.mockResolvedValue([{ id: 2, type: 'assistant' }]);

        const roles = await getRolesService();

        expect(roles).toEqual([{ id: 2, type: 'assistant' }]);
        expect(mockedCacheSet).toHaveBeenCalledOnce();
    });

    it('should return roleExists false when role does not exist', async () => {
        mockedCheckRoleExistsById.mockResolvedValue(false);

        const result = await getRolePermissionsService(10);

        expect(result.roleExists).toBe(false);
        expect(result.permissions).toEqual([]);
    });

    it('should build role permission tree', async () => {
        mockedCheckRoleExistsById.mockResolvedValue(true);
        mockedFindPermissionTreeRowsByRoleId.mockResolvedValue([
            {
                id: 1,
                name: 'root',
                module: 'm',
                type: 'root',
                description: null,
                parent_id: null,
                selected: false,
            },
            {
                id: 2,
                name: 'child',
                module: 'm',
                type: 'child',
                description: null,
                parent_id: 1,
                selected: true,
            },
        ]);

        const result = await getRolePermissionsTreeService(1);

        expect(result.roleExists).toBe(true);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].children[0].id).toBe(2);
    });

    it('should throw RoleVersionConflictError when version mismatch', async () => {
        mockedFindRoleForUpdate.mockResolvedValue({ id: 2, type: 'admin', version: 8 });

        await expect(
            manageRolePermissionsService({
                roleId: 2,
                permissions: [],
                version: 9,
            }),
        ).rejects.toMatchObject({ name: 'RoleVersionConflictError' });
    });

    it('should update role permissions successfully', async () => {
        mockedFindRoleForUpdate.mockResolvedValue({ id: 2, type: 'admin', version: 8 });
        mockedFindPermissionRowsByModuleTypePairs.mockResolvedValue([
            { id: 101, module: 'user', type: 'read' },
            { id: 102, module: 'user', type: 'write' },
        ]);
        mockedFindPermissionIdsByRoleId.mockResolvedValue([101, 103]);
        mockedDeleteRolePermissionsByIds.mockResolvedValue(1);
        mockedInsertRolePermissionsByIds.mockResolvedValue(1);

        const result = await manageRolePermissionsService({
            roleId: 2,
            permissions: [
                { module: 'user', type: 'read' },
                { module: 'user', type: 'write' },
            ],
            reason: 'sync',
            version: 8,
        });

        expect(result.beforeVersion).toBe(8);
        expect(result.afterVersion).toBe(9);
        expect(result.affected.added).toBe(1);
        expect(result.affected.removed).toBe(1);
        expect(mockedUpdateRoleVersion).toHaveBeenCalledWith(expect.anything(), 2, 9);
        expect(queryMock).toHaveBeenCalledWith('COMMIT');
    });

    it('should return permissions when role exists', async () => {
        mockedCheckRoleExistsById.mockResolvedValue(true);
        mockedFindPermissionsByRoleId.mockResolvedValue([
            {
                id: 1,
                name: 'view',
                module: 'user',
                type: 'read',
                description: null,
                parent_id: null,
            },
        ]);

        const result = await getRolePermissionsService(1);

        expect(result.roleExists).toBe(true);
        expect(result.permissions).toHaveLength(1);
    });
});
