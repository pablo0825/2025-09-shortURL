// link.route.ts
import express from "express";
import { createShortUrl, getAllLinks, deleteLink, deactivateLink } from "../controller/link.controllers"
import { limitCreateByIp } from "../middleware/limitCreateByIp";

const router = express.Router();

router.post("/", limitCreateByIp, createShortUrl);
router.get("/", getAllLinks);
router.delete("/:id", deleteLink);
router.put("/:id/deactivate", deactivateLink);

export default router;