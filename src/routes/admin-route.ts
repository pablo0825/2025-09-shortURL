import express from 'express';
import { authenticate } from '../middlewares/auth/authenticate-tokens';
import { checkPermission } from '../middlewares/auth/check-permission';
import { getRateLimiters } from '../middlewares/rate-limit/rate-limiter';
import { getAdminStatsLinks, getAdminStatsUsers } from '../controllers/admin-stats-controllers';
import {
    getRolePermissions,
    getRolePermissionsTree,
    getRoles,
    manageRolePermissions,
} from '../controllers/admin-role-controllers';
import {
    deactivateUser,
    getUser,
    getUsers,
    getUserSessions,
    resetUser2FA,
    restoreUser,
    setUserRole,
} from '../controllers/admin-user-controllers';
import {
    deactivateAdminLinkById,
    deleteAdminLinkById,
    getAdminLinkById,
    getAdminLinks,
    restoreAdminLinks,
} from '../controllers/admin-link-controllers';

const router = express.Router();

export const adminRouter = router;

const { generalApiLimiter } = getRateLimiters();

router.get(
    '/stats/users',
    authenticate,
    checkPermission('admin', 'view_stats'),
    generalApiLimiter,
    getAdminStatsUsers,
);
router.get(
    '/stats/links',
    authenticate,
    checkPermission('admin', 'view_stats'),
    generalApiLimiter,
    getAdminStatsLinks,
);
router.get(
    '/users',
    authenticate,
    checkPermission('admin', 'list_users'),
    generalApiLimiter,
    getUsers,
);
router.get(
    '/user/:id',
    authenticate,
    checkPermission('admin', 'read_user'),
    generalApiLimiter,
    getUser,
);
router.get(
    '/user/:id/sessions',
    authenticate,
    checkPermission('admin', 'read_user_sessions'),
    generalApiLimiter,
    getUserSessions,
);
router.patch(
    '/user/:id/reset-2fa',
    authenticate,
    checkPermission('admin', 'reset_user_2fa'),
    generalApiLimiter,
    resetUser2FA,
);
router.patch(
    '/user/:id/deactivate',
    authenticate,
    checkPermission('admin', 'deactivate_user'),
    generalApiLimiter,
    deactivateUser,
);
router.patch(
    '/user/:id/restore',
    authenticate,
    checkPermission('admin', 'restore_user'),
    generalApiLimiter,
    restoreUser,
);
router.put(
    '/users/:id/role',
    authenticate,
    checkPermission('admin', 'update_user_role'),
    generalApiLimiter,
    setUserRole,
);
router.get(
    '/roles',
    authenticate,
    checkPermission('admin', 'list_roles'),
    generalApiLimiter,
    getRoles,
);
router.get(
    '/roles/:roleId/permissions',
    authenticate,
    checkPermission('admin', 'read_role_permissions'),
    generalApiLimiter,
    getRolePermissions,
);
router.get(
    '/roles/:roleId/permissions/tree',
    authenticate,
    checkPermission('admin', 'read_role_permissions'),
    generalApiLimiter,
    getRolePermissionsTree,
);
router.patch(
    '/roles/:roleId/permissions',
    authenticate,
    checkPermission('admin', 'manage_role_permissions'),
    generalApiLimiter,
    manageRolePermissions,
);
router.get(
    '/links',
    authenticate,
    checkPermission('admin', 'list_links'),
    generalApiLimiter,
    getAdminLinks,
);
router.get(
    '/links/:id',
    authenticate,
    checkPermission('admin', 'read_link'),
    generalApiLimiter,
    getAdminLinkById,
);
router.patch(
    '/links/deactivate',
    authenticate,
    checkPermission('admin', 'deactivate_link'),
    generalApiLimiter,
    deactivateAdminLinkById,
);
router.delete(
    '/links',
    authenticate,
    checkPermission('admin', 'delete_link'),
    generalApiLimiter,
    deleteAdminLinkById,
);
router.patch(
    '/links/restore',
    authenticate,
    checkPermission('admin', 'restore_link'),
    generalApiLimiter,
    restoreAdminLinks,
);
