// link.route.ts
import express from "express";
import { createShortUrl, getAllLinks, deleteLink, deactivateLink } from "../controller/link.controllers"
import {checkPermission} from "../middleware/checkPermission"
import {getRateLimiters} from "../middleware/rateLimiter"

const router = express.Router();

const {generalApiLimiter, createLinkLimiter} = getRateLimiters();

router.post("/", checkPermission("link", "create"), createLinkLimiter, createShortUrl);
router.get("/", checkPermission("link", "list"), generalApiLimiter, getAllLinks);
router.delete("/:id", checkPermission("link", "delete"), generalApiLimiter, deleteLink);
router.put("/:id/deactivate", checkPermission("link", "disable"), generalApiLimiter, deactivateLink);

export default router;