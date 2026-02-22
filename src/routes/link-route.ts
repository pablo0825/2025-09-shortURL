import express from 'express';
import {
    createShortUrl,
    getAllLinks,
    deleteLink,
    deactivateLink,
} from '../controllers/link-controllers';
import { checkPermission } from '../middlewares/auth/check-permission';
import { getRateLimiters } from '../middlewares/rate-limit/rate-limiter';

const router = express.Router();

export const linkRouter = router;

const { generalApiLimiter, createLinkLimiter } = getRateLimiters();

router.post('/', checkPermission('link', 'create'), createLinkLimiter, createShortUrl);
router.get('/', checkPermission('link', 'list'), generalApiLimiter, getAllLinks);
router.delete('/:id', checkPermission('link', 'delete'), generalApiLimiter, deleteLink);
router.put('/:id/deactivate', checkPermission('link', 'disable'), generalApiLimiter, deactivateLink);

