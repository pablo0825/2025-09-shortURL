import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/admin/admin-user-service', () => ({
    addUserRoleService: vi.fn(),
    deactivateUserService: vi.fn(),
    getUserService: vi.fn(),
    getUsersService: vi.fn(),
    getUserSessionsService: vi.fn(),
    resetUser2faService: vi.fn(),
    restoreUserService: vi.fn(),
}));

vi.mock('../../src/services/admin/admin-role-service', () => ({
    getRolePermissionsService: vi.fn(),
    getRolePermissionsTreeService: vi.fn(),
    getRolesService: vi.fn(),
    manageRolePermissionsService: vi.fn(),
}));

vi.mock('../../src/services/admin/admin-audit-log-service', () => ({
    recordAdminAuditLogService: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/utils/handle-access-token-black-list', () => ({
    handleAccessTokenBlackList: vi.fn(),
}));

vi.mock('../../src/services/user/user-log-service', () => ({
    recordUserLogService: vi.fn(),
}));

import {
    deactivateUser as rawDeactivateUser,
    getRolePermissions as rawGetRolePermissions,
    getRolePermissionsTree as rawGetRolePermissionsTree,
    getRoles as rawGetRoles,
    setUserRole as rawSetUserRole,
    getUser as rawGetUser,
    getUserSessions as rawGetUserSessions,
    getUsers as rawGetUsers,
    manageRolePermissions as rawManageRolePermissions,
    resetUser2FA as rawResetUser2FA,
    restoreUser as rawRestoreUser,
} from '../../src/controllers/admin-controllers';
import { errorHandler } from '../../src/middlewares/error/error-handler';
import {
    addUserRoleService,
    deactivateUserService,
    getUserService,
    getUserSessionsService,
    getUsersService,
    resetUser2faService,
    restoreUserService,
} from '../../src/services/admin/admin-user-service';
import {
    getRolePermissionsService,
    getRolePermissionsTreeService,
    getRolesService,
    manageRolePermissionsService,
} from '../../src/services/admin/admin-role-service';
import { recordAdminAuditLogService } from '../../src/services/admin/admin-audit-log-service';
import { logger } from '../../src/lib/logger';
import { AppError } from '../../src/utils/app-error';

const mockedGetUsersService = vi.mocked(getUsersService);
const mockedGetUserService = vi.mocked(getUserService);
const mockedGetUserSessionsService = vi.mocked(getUserSessionsService);
const mockedAddUserRoleService = vi.mocked(addUserRoleService);
const mockedResetUser2faService = vi.mocked(resetUser2faService);
const mockedRestoreUserService = vi.mocked(restoreUserService);
const mockedDeactivateUserService = vi.mocked(deactivateUserService);
const mockedGetRolesService = vi.mocked(getRolesService);
const mockedGetRolePermissionsService = vi.mocked(getRolePermissionsService);
const mockedGetRolePermissionsTreeService = vi.mocked(getRolePermissionsTreeService);
const mockedManageRolePermissionsService = vi.mocked(manageRolePermissionsService);
const mockedRecordAdminAuditLogService = vi.mocked(recordAdminAuditLogService);

type AdminController = (
    req: never,
    res: never,
    next?: (err?: unknown) => void,
) => Promise<unknown>;

const withErrorHandler = (handler: AdminController) => {
    return async (req: never, res: ReturnType<typeof buildRes>): Promise<void> => {
        const next = (err?: unknown): void => {
            if (!err) {
                return;
            }

            errorHandler(err, req, res as never, vi.fn());
        };

        await handler(req, res as never, next);
    };
};

const getUsers = withErrorHandler(rawGetUsers);
const getUser = withErrorHandler(rawGetUser);
const getUserSessions = withErrorHandler(rawGetUserSessions);
const resetUser2FA = withErrorHandler(rawResetUser2FA);
const deactivateUser = withErrorHandler(rawDeactivateUser);
const restoreUser = withErrorHandler(rawRestoreUser);
const getRoles = withErrorHandler(rawGetRoles);
const getRolePermissions = withErrorHandler(rawGetRolePermissions);
const getRolePermissionsTree = withErrorHandler(rawGetRolePermissionsTree);
const manageRolePermissions = withErrorHandler(rawManageRolePermissions);
const setUserRole = withErrorHandler(rawSetUserRole);

const buildRes = () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    return { status, json, headersSent: false };
};

describe('admin-controllers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(logger, 'error').mockImplementation(() => undefined);
        vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
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
        const err = new AppError(404, 'missing', 'UserNotFoundError');
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

    it('should return 200 in getUser when service succeeds', async () => {
        mockedGetUserService.mockResolvedValue({ id: 2, email: 'a@example.com' } as never);

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '2' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/user/2',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await getUser(req, res as never);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 400 in getUser when target id is invalid', async () => {
        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: 'bad' },
        } as never;
        const res = buildRes();

        await getUser(req, res as never);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 in getUser when service fails unexpectedly', async () => {
        mockedGetUserService.mockRejectedValue(new Error('db down'));

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '2' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/user/2',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await getUser(req, res as never);

        expect(res.status).toHaveBeenCalledWith(500);
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

    it('should return 500 in getUserSessions when service fails', async () => {
        mockedGetUserSessionsService.mockRejectedValue(new Error('db down'));

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '2' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/user/2/sessions',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await getUserSessions(req, res as never);

        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should map UserNotFoundError to 404 in resetUser2FA', async () => {
        const err = new AppError(404, 'x', 'UserNotFoundError');
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

    it('should return 200 in resetUser2FA when service succeeds', async () => {
        mockedResetUser2faService.mockResolvedValue({ before: true, after: false } as never);

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '2' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/user/2/reset-2fa',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await resetUser2FA(req, res as never);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 in resetUser2FA when service fails unexpectedly', async () => {
        mockedResetUser2faService.mockRejectedValue(new Error('db down'));

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '2' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/user/2/reset-2fa',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await resetUser2FA(req, res as never);

        expect(res.status).toHaveBeenCalledWith(500);
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

    it('should return 200 in deactivateUser when service succeeds', async () => {
        mockedDeactivateUserService.mockResolvedValue({ before: true, after: false } as never);

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '2' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/user/2/deactivate',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await deactivateUser(req, res as never);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should map UserNotFoundError to 404 in deactivateUser', async () => {
        const err = new AppError(404, 'missing', 'UserNotFoundError');
        mockedDeactivateUserService.mockRejectedValue(err);

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '2' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/user/2/deactivate',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await deactivateUser(req, res as never);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 500 in deactivateUser when service fails unexpectedly', async () => {
        mockedDeactivateUserService.mockRejectedValue(new Error('db down'));

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '2' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/user/2/deactivate',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await deactivateUser(req, res as never);

        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should map UserNotFoundError to 404 in restoreUser', async () => {
        const err = new AppError(404, 'x', 'UserNotFoundError');
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

    it('should return 200 in restoreUser when service succeeds', async () => {
        mockedRestoreUserService.mockResolvedValue({ before: false, after: true } as never);

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '3' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/user/3/restore',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await restoreUser(req, res as never);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 in restoreUser when service fails unexpectedly', async () => {
        mockedRestoreUserService.mockRejectedValue(new Error('db down'));

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '3' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/user/3/restore',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await restoreUser(req, res as never);

        expect(res.status).toHaveBeenCalledWith(500);
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

    it('should return 500 in getRoles when service fails', async () => {
        mockedGetRolesService.mockRejectedValue(new Error('db down'));

        const req = {
            user: { id: 1, role: 'admin' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/roles',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await getRoles(req, res as never);

        expect(res.status).toHaveBeenCalledWith(500);
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

    it('should return 400 in getRolePermissions when role id is invalid', async () => {
        const req = {
            user: { id: 1, role: 'admin' },
            params: { roleId: 'bad' },
        } as never;
        const res = buildRes();

        await getRolePermissions(req, res as never);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 200 in getRolePermissions when role exists', async () => {
        mockedGetRolePermissionsService.mockResolvedValue({
            roleExists: true,
            permissions: [{ module: 'user', type: 'read' }],
        } as never);

        const req = {
            user: { id: 1, role: 'admin' },
            params: { roleId: '2' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/roles/2/permissions',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await getRolePermissions(req, res as never);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 in getRolePermissions when service fails', async () => {
        mockedGetRolePermissionsService.mockRejectedValue(new Error('db down'));

        const req = {
            user: { id: 1, role: 'admin' },
            params: { roleId: '2' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/roles/2/permissions',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await getRolePermissions(req, res as never);

        expect(res.status).toHaveBeenCalledWith(500);
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

    it('should return 404 in getRolePermissionsTree when role does not exist', async () => {
        mockedGetRolePermissionsTreeService.mockResolvedValue({ roleExists: false, data: [] });

        const req = {
            user: { id: 1, role: 'admin' },
            params: { roleId: '2' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/roles/2/permissions/tree',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await getRolePermissionsTree(req, res as never);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 500 in getRolePermissionsTree when service fails', async () => {
        mockedGetRolePermissionsTreeService.mockRejectedValue(new Error('db down'));

        const req = {
            user: { id: 1, role: 'admin' },
            params: { roleId: '2' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/roles/2/permissions/tree',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await getRolePermissionsTree(req, res as never);

        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should return 400 in manageRolePermissions when body is invalid', async () => {
        const req = {
            user: { id: 1, role: 'admin' },
            params: { roleId: '2' },
            body: {
                permissions: 'invalid',
                version: 5,
            },
        } as never;
        const res = buildRes();

        await manageRolePermissions(req, res as never);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 in manageRolePermissions when role id is invalid', async () => {
        const req = {
            user: { id: 1, role: 'admin' },
            params: { roleId: 'bad' },
            body: {
                permissions: [{ module: 'user', type: 'read' }],
                version: 1,
            },
        } as never;
        const res = buildRes();

        await manageRolePermissions(req, res as never);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 200 in manageRolePermissions when service succeeds', async () => {
        mockedManageRolePermissionsService.mockResolvedValue({
            roleType: 'admin',
            beforeVersion: 1,
            afterVersion: 2,
            affected: { added: 1, removed: 0 },
            reason: 'sync',
        } as never);

        const req = {
            user: { id: 1, role: 'admin' },
            params: { roleId: '2' },
            body: {
                permissions: [{ module: 'user', type: 'read' }],
                reason: 'sync',
                version: 1,
            },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/roles/2/permissions',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await manageRolePermissions(req, res as never);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should warn when success audit log write fails in manageRolePermissions', async () => {
        mockedManageRolePermissionsService.mockResolvedValue({
            roleType: 'admin',
            beforeVersion: 1,
            afterVersion: 2,
            affected: { added: 1, removed: 0 },
            reason: 'sync',
        } as never);
        mockedRecordAdminAuditLogService.mockRejectedValueOnce(new Error('audit down'));

        const req = {
            user: { id: 1, role: 'admin' },
            params: { roleId: '2' },
            body: {
                permissions: [{ module: 'user', type: 'read' }],
                reason: 'sync',
                version: 1,
            },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/roles/2/permissions',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await manageRolePermissions(req, res as never);
        await Promise.resolve();

        expect(logger.warn).toHaveBeenCalledWith('[audit] write failed', expect.any(Error));
    });

    it('should map RoleNotFoundError to 404 in manageRolePermissions', async () => {
        const err = new AppError(404, 'missing', 'RoleNotFoundError');
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

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should map RoleVersionConflictError to 409 in manageRolePermissions', async () => {
        const err = new AppError(409, 'version conflict', 'RoleVersionConflictError');
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
        const err = new AppError(422, 'missing', 'PermissionNotFoundError');
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

    it('should return 500 in manageRolePermissions when service fails unexpectedly', async () => {
        mockedManageRolePermissionsService.mockRejectedValue(new Error('db down'));

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

        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should warn when failed audit log write fails in manageRolePermissions', async () => {
        mockedManageRolePermissionsService.mockRejectedValue(new Error('db down'));
        mockedRecordAdminAuditLogService.mockRejectedValueOnce(new Error('audit down'));

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
        await Promise.resolve();

        expect(logger.warn).toHaveBeenCalledWith('[audit] write failed', expect.any(Error));
    });

    it('should return 200 in setUserRole when service succeeds', async () => {
        mockedAddUserRoleService.mockResolvedValue({
            before: { roles: ['user'] },
            after: { roles: ['user', 'assistant'] },
            affected: { inserted: 1 },
            addedRole: 'assistant',
        });

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '2' },
            body: { role: 'assistant' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/users/2/role',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await setUserRole(req, res as never);

        expect(mockedAddUserRoleService).toHaveBeenCalledWith(2, 'assistant');
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 400 in setUserRole when body is invalid', async () => {
        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '2' },
            body: { role: 'admin' },
        } as never;
        const res = buildRes();

        await setUserRole(req, res as never);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 409 in setUserRole when role already exists', async () => {
        mockedAddUserRoleService.mockRejectedValue(
            new AppError(409, 'exists', 'UserRoleAlreadyExistsError'),
        );

        const req = {
            user: { id: 1, role: 'admin' },
            params: { id: '2' },
            body: { role: 'assistant' },
            get: vi.fn().mockReturnValue('ua'),
            originalUrl: '/admin/users/2/role',
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();

        await setUserRole(req, res as never);

        expect(res.status).toHaveBeenCalledWith(409);
    });
});
