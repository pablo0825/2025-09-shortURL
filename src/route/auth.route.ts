// auth.route.ts
import express from "express";
import {register, login, refresh, logout, forgotPassword, resetPassword} from "../controller/auth.controllers";
import {authenticate} from "../middleware/authenticateTokents"
import {getRateLimiters} from "../middleware/rateLimiter"

const router = express.Router();

const {
    loginLimiter,
    registerLimiter,
    forgotPasswordLimiter,
    resetPasswordLimiter,
    generalApiLimiter
} = getRateLimiters();

router.post("/register",  registerLimiter, register);
router.post("/login", loginLimiter, login);
router.post("/refresh", generalApiLimiter, refresh);
router.post("/logout", logout);
router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
router.post("/reset-password", resetPasswordLimiter, resetPassword);

export default router;