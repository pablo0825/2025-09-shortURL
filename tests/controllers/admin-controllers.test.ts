import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/admin-user-service', () => ({
    deactivateUserService: vi.fn(),
    getUserService: vi.fn(),
    getUsersService: vi.fn(),
    getUserSessionsService: vi.fn(),
    resetUser2faService: vi.fn(),
    restoreUserService: vi.fn(),
}));

vi.mock('../../src/services/admin-role-service', () => ({
    getRolePermissionsService: vi.fn(),
    getRolePermissionsTreeService: vi.fn(),
    getRolesService: vi.fn(),
    manageRolePermissionsService: vi.fn(),
}));

vi.mock('../../src/utils/write-admin-audit-log-to-db', () => ({
    writeAdminAuditLogToDb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/utils/handle-access-token-black-list', () => ({
    handleAccessTokenBlackList: vi.fn(),
}));

vi.mock('../../src/utils/write-user-log-to-db', () => ({
    writeUserLogToDB: vi.fn(),
}));

import {
    deactivateUser,
    getRolePermissions,
    getRolePermissionsTree,
    getRoles,
    getUser,
    getUserSessions,
    getUsers,
    manageRolePermissions,
    resetUser2FA,
    restoreUser,
} from '../../src/controllers/admin-controllers';
import {
    deactivateUserService,
    getUserService,
    getUserSessionsService,
    getUsersService,
    resetUser2faService,
    restoreUserService,
} from '../../src/services/admin-user-service';
import {
    getRolePermissionsService,
    getRolePermissionsTreeService,
    getRolesService,
    manageRolePermissionsService,
} from '../../src/services/admin-role-service';

const mockedGetUsersService = vi.mocked(getUsersService);
const mockedGetUserService = vi.mocked(getUserService);
const mockedGetUserSessionsService = vi.mocked(getUserSessionsService);
const mockedResetUser2faService = vi.mocked(resetUser2faService);
const mockedDeactivateUserService = vi.mocked(deactivateUserService);
const mockedRestoreUserService = vi.mocked(restoreUserService);
const mockedGetRolesService = vi.mocked(getRolesService);
const mockedGetRolePermissionsService = vi.mocked(getRolePermissionsService);
const mockedGetRolePermissionsTreeService = vi.mocked(getRolePermissionsTreeService);
const mockedManageRolePermissionsService = vi.mocked(manageRolePermissionsService);

const buildRes = () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    return { status, json, headersSent: false };
};

describe('admin-controllers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return 401 in getUsers when user id is missing', async () => {
        const req = { user: { role: 'admin' }, query: {} } as never;
        const res = buildRes();

        await getUsers(req, res as never);

        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 200 in getUsers when service succeeds', async () => {
        mockedGetUsersService.mockResolvedValue({
            data: [],
            pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
        });
        const req = {
            user: { id: 1, role: 'admin' },
            query: {},
            originalUrl: '/admin/users',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await getUsers(req, res as never);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 403 in getUsers when role is invalid', async () => {
        const req = { user: { id: 1, role: 'user' }, query: {} } as never;
        const res = buildRes();

        await getUsers(req, res as never);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 400 in getUsers when query is invalid', async () => {
        const req = {
            user: { id: 1, role: 'admin' },
            query: { page: '0' },
        } as never;
        const res = buildRes();

        await getUsers(req, res as never);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 in getUsers when service fails', async () => {
        mockedGetUsersService.mockRejectedValue(new Error('db down'));
        const req = {
            user: { id: 1, role: 'admin' },
            query: {},
            originalUrl: '/admin/users',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await getUsers(req, res as never);

        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should map UserNotFoundError to 404 in getUser', async () => {
        const err = new Error('missing');
        err.name = 'UserNotFoundError';
        mockedGetUserService.mockRejectedValue(err);

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '999' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/user/999',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await getUser(req, res as never);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 200 in getUserSessions when service succeeds', async () => {
        mockedGetUserSessionsService.mockResolvedValue({ message: 'ok', data: [] });

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '2' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/user/2/sessions',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await getUserSessions(req, res as never);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should map UserNotFoundError to 404 in resetUser2FA', async () => {
        const err = new Error('x');
        err.name = 'UserNotFoundError';
        mockedResetUser2faService.mockRejectedValue(err);

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '2' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/user/2/reset-2fa',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await resetUser2FA(req, res as never);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should block self deactivation in deactivateUser', async () => {
        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '1' },
        } as never;
        const res = buildRes();

        await deactivateUser(req, res as never);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should map UserNotFoundError to 404 in restoreUser', async () => {
        const err = new Error('x');
        err.name = 'UserNotFoundError';
        mockedRestoreUserService.mockRejectedValue(err);

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '3' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/user/3/restore',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await restoreUser(req, res as never);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 200 in getRoles', async () => {
        mockedGetRolesService.mockResolvedValue([{ id: 1, type: 'admin' }]);

        const req = {
            user: { id: 1, role: 'admin' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/roles',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await getRoles(req, res as never);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 403 in getRolePermissions when role is assistant', async () => {
        const req = {
            user: { id: 1, role: 'assistant' },
            params: { roleId: '2' },
        } as never;
        const res = buildRes();

        await getRolePermissions(req, res as never);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 404 in getRolePermissions when role does not exist', async () => {
        mockedGetRolePermissionsService.mockResolvedValue({ roleExists: false, permissions: [] });

        const req = {
            user: { id: 1, role: 'admin' },
            params: { roleId: '2' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/roles/2/permissions',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await getRolePermissions(req, res as never);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 200 in getRolePermissionsTree when role exists', async () => {
        mockedGetRolePermissionsTreeService.mockResolvedValue({ roleExists: true, data: [] });

        const req = {
            user: { id: 1, role: 'admin' },
            params: { roleId: '2' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/roles/2/permissions/tree',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await getRolePermissionsTree(req, res as never);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should map RoleVersionConflictError to 409 in manageRolePermissions', async () => {
        const err = new Error('version conflict');
        err.name = 'RoleVersionConflictError';
        mockedManageRolePermissionsService.mockRejectedValue(err);

        const req = {
            user: { id: 1, role: 'admin' },
            params: { roleId: '2' },
            body: {
                permissions: [{ module: 'user', type: 'read' }],
                version: 5,
            },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/roles/2/permissions',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await manageRolePermissions(req, res as never);

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it('should map PermissionNotFoundError to 422 in manageRolePermissions', async () => {
        const err = new Error('missing');
        err.name = 'PermissionNotFoundError';
        mockedManageRolePermissionsService.mockRejectedValue(err);

        const req = {
            user: { id: 1, role: 'admin' },
            params: { roleId: '2' },
            body: {
                permissions: [{ module: 'user', type: 'read' }],
                version: 5,
            },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/roles/2/permissions',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await manageRolePermissions(req, res as never);

        expect(res.status).toHaveBeenCalledWith(422);
    });
});
