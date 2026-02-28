import express from 'express';
import {
    register,
    login,
    refresh,
    logout,
    forgotPassword,
    resetPassword,
} from '../controllers/auth-controllers';
import { authenticate } from '../middlewares/auth/authenticate-tokens';
import { getRateLimiters } from '../middlewares/rate-limit/rate-limiter';

const router = express.Router();

export const authRouter = router;

const {
    loginLimiter,
    registerLimiter,
    forgotPasswordLimiter,
    resetPasswordLimiter,
    generalApiLimiter,
} = getRateLimiters();

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/refresh', generalApiLimiter, refresh);
router.post('/logout', authenticate, generalApiLimiter, logout);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPasswordLimiter, resetPassword);
