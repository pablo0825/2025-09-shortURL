import express from 'express';
import {
    createShortUrl,
    getAllLinks,
    deleteLink,
    deactivateLink,
} from '../controllers/link-controllers';
import { authenticate } from '../middlewares/auth/authenticate-tokens';
import { checkPermission } from '../middlewares/auth/check-permission';
import { getRateLimiters } from '../middlewares/rate-limit/rate-limiter';

const router = express.Router();

export const linkRouter = router;

const { generalApiLimiter, createLinkLimiter } = getRateLimiters();

router.post('/', authenticate, checkPermission('link', 'create'), createLinkLimiter, createShortUrl);
router.get('/', authenticate, checkPermission('link', 'list'), generalApiLimiter, getAllLinks);
router.delete('/:id', authenticate, checkPermission('link', 'delete'), generalApiLimiter, deleteLink);
router.put(
    '/:id/deactivate',
    authenticate,
    checkPermission('link', 'disable'),
    generalApiLimiter,
    deactivateLink,
);
