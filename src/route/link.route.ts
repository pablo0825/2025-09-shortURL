// link.route.ts
import express from "express";
import { createShortUrl, getAllLinks, deleteLink, deactivateLink } from "../controller/link.controllers"
import { limitCreateByIp } from "../middleware/limitCreateByIp";
import {checkPermission} from "../middleware/checkPermission"

const router = express.Router();

router.post("/", checkPermission("link", "create"), limitCreateByIp, createShortUrl);
router.get("/", checkPermission("link", "list"), getAllLinks);
router.delete("/:id", checkPermission("link", "delete"), deleteLink);
router.put("/:id/deactivate", checkPermission("link", "disable"), deactivateLink);

export default router;