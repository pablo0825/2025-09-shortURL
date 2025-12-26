// user.route.ts
import express, {Router} from "express";
import {updateMyAvatar} from "../controller/user.controllers";
import {checkPermission} from "../middleware/checkPermission";
import {uploadAvatar} from "../middleware/uploadAvatar";
import {validateAvatarFile} from "../middleware/validateAvatarFile";
import {getRateLimiters} from "../middleware/rateLimiter";
import {authenticate} from "../middleware/authenticateTokents";

const router:Router = express.Router();

const {updateAvatarLimiter} = getRateLimiters();


router.post("/avatar", authenticate, checkPermission("user", "update_avatar"), updateAvatarLimiter, uploadAvatar, validateAvatarFile, updateMyAvatar);