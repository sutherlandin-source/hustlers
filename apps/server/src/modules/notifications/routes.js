import { Router } from "express";
import { authenticateToken } from "../../shared/middleware/auth.js";
import { archiveNotification, listNotifications, markAllRead, markRead, unreadCount } from "./controller.js";

const router = Router();

router.use(authenticateToken);

router.get("/", listNotifications);
router.get("/unread-count", unreadCount);
router.patch("/read-all", markAllRead);
router.patch("/:id/read", markRead);
router.patch("/:id/archive", archiveNotification);

export default router;
