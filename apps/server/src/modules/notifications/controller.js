import { notificationService } from "./service.js";

function buildResponse(res, status, message, data = {}) {
  return res.status(status).json({ success: status >= 200 && status < 300, message, data, timestamp: new Date().toISOString() });
}

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id;
}

export async function listNotifications(req, res, next) {
  try {
    const data = await notificationService.listForUser(getUserId(req), req.query);
    return buildResponse(res, 200, "Notifications list", data);
  } catch (err) {
    next(err);
  }
}

export async function unreadCount(req, res, next) {
  try {
    const count = await notificationService.unreadCount(getUserId(req));
    return buildResponse(res, 200, "Unread notification count", { count });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req, res, next) {
  try {
    const notification = await notificationService.markRead(req.params.id, getUserId(req));
    return buildResponse(res, 200, "Notification marked read", { notification });
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req, res, next) {
  try {
    const data = await notificationService.markAllRead(getUserId(req));
    return buildResponse(res, 200, "Notifications marked read", data);
  } catch (err) {
    next(err);
  }
}

export async function archiveNotification(req, res, next) {
  try {
    const notification = await notificationService.archive(req.params.id, getUserId(req));
    return buildResponse(res, 200, "Notification archived", { notification });
  } catch (err) {
    next(err);
  }
}
