// user.route.ts
import express, {Router} from "express";
import {getMyProfile, updateMyProfile, updateMyAvatar, deleteMyAvatar, changeMyPassword, setup2fa, enable2fa, disable2fa, softDeleteMyAccount, getMySessionsList,logoutAll, logoutDevice} from "../controller/user.controllers";
import {checkPermission} from "../middleware/checkPermission";
import {uploadAvatar} from "../middleware/uploadAvatar";
import {validateAvatarFile} from "../middleware/validateAvatarFile";
import {getRateLimiters} from "../middleware/rateLimiter";
import {authenticate} from "../middleware/authenticateTokents";

const router:Router = express.Router();

const {
    generalApiLimiter,
    updateAvatarLimiter,
    getMyProfileLimiter,
    updateMyProfileLimiter,
    deleteAvatarLimiter,
    updatePasswordLimiter,
    setup2faLimiter,
    enable2faLimiter,
    disable2faLimiter,
    softDeleteMyAccountLimiter,
    getMySessionsLimiter,
    logoutAllLimiter,
    logoutDeviceLimiter
} = getRateLimiters();

// authenticate 驗證 accessToken 的合法性
// checkPermission 檢查角色的權限
// limiter 限速
// uploadAvatar 檢查上傳檔案是否為圖片
// validateAvatarFile 檢查圖片類型是否合法
router.get("/me", authenticate, checkPermission("user", "read_profile"), getMyProfileLimiter, getMyProfile);
router.patch("/me", authenticate, checkPermission("user", "update_profile"), updateMyProfileLimiter, updateMyProfile);

router.post("/me/avatar", authenticate, checkPermission("user", "update_avatar"), updateAvatarLimiter, uploadAvatar, validateAvatarFile, updateMyAvatar);
router.delete("/me/avatar", authenticate, checkPermission("user", "delete_avatar"), deleteAvatarLimiter, deleteMyAvatar);

router.post("/me/password", authenticate, checkPermission("user", "update_password"), updatePasswordLimiter, changeMyPassword);

router.post("/me/2fa/setup", authenticate, checkPermission("user", "setup_2fa"), setup2faLimiter, setup2fa);
router.post("/me/2fa/enable", authenticate, checkPermission("user", "enable_2fa"), enable2faLimiter, enable2fa);
router.delete("/me/2fa", authenticate, checkPermission("user", "disable_2fa"), disable2faLimiter, disable2fa);

router.delete("/me", authenticate,  checkPermission("user", "soft_delete"), softDeleteMyAccountLimiter, softDeleteMyAccount);

router.get("/me/login-events",  authenticate,  checkPermission("user", "read_sessions"), getMySessionsLimiter, getMySessionsList);
router.delete("/me/session", authenticate, checkPermission("user", "logout_all"), logoutAllLimiter, logoutAll);
router.delete("/me/session/:sessionId", authenticate, checkPermission("user", "logout_device"), logoutDeviceLimiter, logoutDevice);
