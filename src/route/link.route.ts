// link.route.ts
import express from "express";
import { createShortUrl, getAllLinks, deleteLink, deactivateLink } from "../controller/link.controllers"
import { createLinkLimiter } from "../middleware/limitCreateByIp";
import {checkPermission} from "../middleware/checkPermission"
import {generalApiLimiter} from "../middleware/rateLimiter"

const router = express.Router();

router.post("/", checkPermission("link", "create"), createLinkLimiter, createShortUrl);
router.get("/", checkPermission("link", "list"), generalApiLimiter, getAllLinks);
router.delete("/:id", checkPermission("link", "delete"), generalApiLimiter, deleteLink);
router.put("/:id/deactivate", checkPermission("link", "disable"), generalApiLimiter, deactivateLink);

export default router;