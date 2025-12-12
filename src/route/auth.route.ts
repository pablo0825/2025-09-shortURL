// auth.route.ts
import express from "express";
import {register, login, refresh, logout, logoutAll, logoutDevice, forgotPassword, resetPassword} from "../controller/auth.controllers";
import {authenticate} from "../middleware/authenticateTokents"
import {forgotPasswordLimiter, loginLimiter, registerLimiter, generalApiLimiter, resetPasswordLimiter} from "../middleware/rateLimiter"

const router = express.Router();

router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, login);
router.post("/refresh", generalApiLimiter, refresh);
router.post("/logout", logout);
router.post("/logout-all", authenticate, logoutAll);
router.post("/devices/:tokenId", authenticate, logoutDevice);
router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
router.post("/reset-password", resetPasswordLimiter, resetPassword);

export default router;