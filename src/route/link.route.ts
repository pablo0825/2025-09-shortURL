// link.route.ts
import express from "express";
import { createShortUrl, redirectToLongUrl, getAllLinks, deleteLink, deactivateLink } from "../controller/controllers"

const router = express.Router();

router.post("/", createShortUrl);
router.get("/:code", redirectToLongUrl);
router.get("/", getAllLinks);
router.delete("/:id", deleteLink);
router.put("/:id/deactivate", deactivateLink);

export default router;