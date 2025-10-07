// link.route.ts
import express from "express";
import { createShortUrl, getAllLinks, deleteLink, deactivateLink } from "../controller/link.controllers"

const router = express.Router();

router.post("/", createShortUrl);
router.get("/", getAllLinks);
router.delete("/:id", deleteLink);
router.put("/:id/deactivate", deactivateLink);

export default router;