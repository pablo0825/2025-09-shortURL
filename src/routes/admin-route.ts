import express from 'express';
import { authenticate } from '../middlewares/auth/authenticate-tokens';
import { getRateLimiters } from '../middlewares/rate-limit/rate-limiter';
import { getAdminLinks } from '../controllers/admin-link-controllers';

const router = express.Router();

export const adminRouter = router;

const { generalApiLimiter } = getRateLimiters();

router.get('/links', authenticate, generalApiLimiter, getAdminLinks);
