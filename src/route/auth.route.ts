// auth.route.ts
import express from "express";
import {register, login, refresh, logout, logoutAll, logoutDevice} from "../controller/auth.controllers";
import {authenticate} from "../middleware/authenticateTokents"

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/logout-all", authenticate, logoutAll);
router.post("/devices/:tokenId", authenticate, logoutDevice);

export default router;