import express from 'express';
import { authenticate } from '../middlewares/auth/authenticate-tokens';
import { getRateLimiters } from '../middlewares/rate-limit/rate-limiter';
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

router.get('/links', authenticate, generalApiLimiter, getAdminLinks);
router.get('/links/:id', authenticate, generalApiLimiter, getAdminLinkById);
router.patch('/links/deactivate', authenticate, generalApiLimiter, deactivateAdminLinkById);
router.delete('/links', authenticate, generalApiLimiter, deleteAdminLinkById);
router.patch('/links/restore', authenticate, generalApiLimiter, restoreAdminLinks);
