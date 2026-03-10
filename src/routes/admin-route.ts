import express from 'express';
import { authenticate } from '../middlewares/auth/authenticate-tokens';
import { checkPermission } from '../middlewares/auth/check-permission';
import { getRateLimiters } from '../middlewares/rate-limit/rate-limiter';
import { getAdminStatsLinks, getAdminStatsUsers } from '../controllers/admin-stats-controllers';
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
