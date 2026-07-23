/**
 * User Controller
 * Handles user profile operations
 */

import { Types } from "mongoose";
import { User } from "../../shared/models/User.js";
import { AuditLog } from "../../shared/models/AuditLog.js";
import { Contract } from "../contracts/model.js";
import { Transaction } from "../../models/Transaction.js";
import { reviewService } from "../reviews/index.js";
import { notificationService } from "../notifications/service.js";
import { ApiError } from "../../shared/middleware/errorHandler.js";
import { AUDIT_ACTIONS, ENTITY_TYPES, HTTP_STATUS, NOTIFICATION_TYPES, USER_ROLES } from "../../shared/config/constants.js";

function buildResponse(res, status, message, data = {}) {
  return res.status(status).json({ success: status >= 200 && status < 300, message, data, timestamp: new Date().toISOString() });
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSortKey(value) {
  const key = String(value || "newest").replace(/-/g, "_").toLowerCase();
  const aliases = {
    highestrated: "highest_rated",
    highest_rating: "highest_rated",
    mostreviewed: "most_reviewed",
    most_completed: "most_completed_contracts",
    mostcompletedcontracts: "most_completed_contracts",
  };
  return aliases[key] || key;
}

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id;
}

function toObjectId(id, label = "ID") {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, `${label} is invalid`);
  }
  return new Types.ObjectId(id);
}

function buildUserSummary(user) {
  const publicUser = user?.getPublicProfile ? user.getPublicProfile() : user;
  return publicUser;
}

async function createAdminAudit({ actorId, targetUserId, action, before = {}, after = {}, metadata = {} }) {
  if (!actorId || !targetUserId) return;
  await AuditLog.create({
    user: toObjectId(actorId, "Admin ID"),
    action,
    entityType: ENTITY_TYPES.USER,
    entityId: toObjectId(targetUserId, "User ID"),
    before,
    after,
    metadata,
  });
}

async function sendAdminNotification(userId, title, message, link) {
  if (!userId) return;
  await notificationService.create({
    user: userId,
    type: NOTIFICATION_TYPES.SYSTEM,
    title,
    message,
    link,
  });
}

async function loadAdminUserProfile(userId) {
  const user = await User.findById(toObjectId(userId, "User ID"))
    .populate("wallet")
    .select("-password -refreshTokenHash -emailVerificationToken -passwordResetToken -otpCodeHash");

  if (!user) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, "User not found");
  }

  const [relatedContracts, recentTransactions, reviews, activityLogs] = await Promise.all([
    Contract.find({
      $or: [{ buyer: user._id }, { seller: user._id }, { appliedBy: user._id }],
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("buyer", "firstName lastName email role avatar averageRating totalReviews isActive isEmailVerified")
      .populate("seller", "firstName lastName email role avatar averageRating totalReviews isActive isEmailVerified"),
    Transaction.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("contract", "title contractId contractNumber status"),
    reviewService.listReviewsByUser(user._id, { limit: 5, skip: 0 }),
    AuditLog.find({
      entityType: ENTITY_TYPES.USER,
      entityId: user._id,
    })
      .sort({ createdAt: -1 })
      .limit(20),
  ]);

  const contractSummary = relatedContracts.reduce(
    (accumulator, contract) => {
      const status = String(contract.status || "").toLowerCase();
      accumulator.total += 1;
      if (["pending", "assigned", "active", "in_progress"].includes(status)) accumulator.active += 1;
      if (status === "completed") accumulator.completed += 1;
      if (status === "disputed") accumulator.disputed += 1;
      return accumulator;
    },
    { total: 0, active: 0, completed: 0, disputed: 0 }
  );

  const paymentSummary = recentTransactions.reduce(
    (accumulator, transaction) => {
      accumulator.total += Number(transaction.amount) || 0;
      if (String(transaction.status || "").toLowerCase() === "failed") accumulator.failed += 1;
      return accumulator;
    },
    { total: 0, failed: 0 }
  );

  return {
    user: buildUserSummary(user),
    summary: {
      contracts: contractSummary,
      payments: {
        total: paymentSummary.total,
        failed: paymentSummary.failed,
        recent: recentTransactions,
      },
      reviews: {
        total: reviews.total || 0,
        distribution: reviews.distribution || {},
        recent: reviews.reviews || [],
      },
      activity: activityLogs,
    },
  };
}

export async function getProfile(req, res, next) {
  try {
    const user = await User.findById(req.user.userId).select("-password -refreshToken");
    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "User not found");
    }
    return buildResponse(res, 200, "Profile retrieved", { user: user.getPublicProfile ? user.getPublicProfile() : user });
  } catch (err) {
    next(err);
  }
}

export async function getAdminUserProfile(req, res, next) {
  try {
    const data = await loadAdminUserProfile(req.params.userId);
    return buildResponse(res, 200, "User profile retrieved", data);
  } catch (err) {
    next(err);
  }
}

export async function listUsers(req, res, next) {
  try {
    const { role, status, search, sortBy, verified, verifiedUsers, skills, minRating } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (status === "active") filter.isActive = true;
    if (status === "inactive") filter.isActive = false;
    if (verified === "true" || verifiedUsers === "true") filter.isEmailVerified = true;
    if (minRating !== undefined) filter.averageRating = { $gte: Number(minRating) || 0 };
    if (skills) {
      const skillList = String(skills)
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean);
      if (skillList.length) filter.skills = { $in: skillList.map((skill) => new RegExp(`^${escapeRegex(skill)}$`, "i")) };
    }
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: "i" } },
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
      ];
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const skip = parseInt(req.query.skip, 10) || 0;
    const sortOptions = {
      highest_rated: { averageRating: -1, totalReviews: -1, createdAt: -1 },
      most_reviewed: { totalReviews: -1, averageRating: -1, createdAt: -1 },
      newest: { createdAt: -1 },
      most_completed_contracts: { completedContracts: -1, averageRating: -1, createdAt: -1 },
    };
    const sort = sortOptions[normalizeSortKey(sortBy)] || sortOptions.newest;
    const users = await User.find(filter)
      .select("-password -refreshTokenHash -emailVerificationToken -passwordResetToken -otpCodeHash")
      .sort(sort)
      .skip(skip)
      .limit(limit);
    return buildResponse(res, 200, "Users retrieved", { users });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const { email, phoneNumber, role, idNumber, mpesaNumber, bio, location, companyName, industry, skills, experienceLevel, avatar } = req.body;
    
    const updateData = {};
    if (email) updateData.email = email;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;
    if ([USER_ROLES.HUSTLER, USER_ROLES.MANAGER, USER_ROLES.BOTH].includes(role)) updateData.role = role;
    if (idNumber !== undefined) updateData.idNumber = idNumber;
    if (mpesaNumber !== undefined) updateData.mpesaNumber = mpesaNumber;
    if (bio) updateData.bio = bio;
    if (location) updateData.location = location;
    if (companyName) updateData.companyName = companyName;
    if (industry) updateData.industry = industry;
    if (skills) updateData.skills = skills;
    if (experienceLevel) updateData.experienceLevel = experienceLevel;
    if (avatar !== undefined) updateData.avatar = avatar;

    const user = await User.findByIdAndUpdate(req.user.userId, updateData, { new: true }).select("-password -refreshToken");
    
    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "User not found");
    }

    return buildResponse(res, 200, "Profile updated", { user: user.getPublicProfile ? user.getPublicProfile() : user });
  } catch (err) {
    next(err);
  }
}

export async function verifyUser(req, res, next) {
  try {
    const actorId = getUserId(req);
    const targetUserId = req.params.userId;
    const user = await User.findById(toObjectId(targetUserId, "User ID"));
    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "User not found");
    }

    const before = user.getPublicProfile ? user.getPublicProfile() : user.toObject();
    user.isEmailVerified = true;
    user.verificationStatus = "verified";
    user.accountStatus = "active";
    user.isActive = true;
    user.verifiedAt = new Date();
    user.verifiedBy = toObjectId(actorId, "Admin ID");
    await user.save();

    const after = user.getPublicProfile ? user.getPublicProfile() : user.toObject();
    await createAdminAudit({
      actorId,
      targetUserId,
      action: AUDIT_ACTIONS.UPDATE,
      before,
      after,
      metadata: { adminAction: "verify_user" },
    });
    await sendAdminNotification(
      user._id,
      "Verification approved",
      "Your verification has been approved by an administrator.",
      "/app"
    );
    const data = await loadAdminUserProfile(user._id);
    return buildResponse(res, 200, "User verified", data);
  } catch (err) {
    next(err);
  }
}

export async function rejectVerification(req, res, next) {
  try {
    const actorId = getUserId(req);
    const targetUserId = req.params.userId;
    const { reason = "" } = req.body || {};
    const user = await User.findById(toObjectId(targetUserId, "User ID"));
    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "User not found");
    }

    const before = user.getPublicProfile ? user.getPublicProfile() : user.toObject();
    user.isEmailVerified = false;
    user.verificationStatus = "rejected";
    user.verifiedAt = null;
    await user.save();

    const after = user.getPublicProfile ? user.getPublicProfile() : user.toObject();
    await createAdminAudit({
      actorId,
      targetUserId,
      action: AUDIT_ACTIONS.UPDATE,
      before,
      after,
      metadata: { adminAction: "reject_verification", reason: reason || "" },
    });
    await sendAdminNotification(
      user._id,
      "Verification rejected",
      reason ? `Your verification was rejected. Reason: ${reason}` : "Your verification was rejected by an administrator.",
      "/app/verification"
    );
    const data = await loadAdminUserProfile(user._id);
    return buildResponse(res, 200, "Verification rejected", data);
  } catch (err) {
    next(err);
  }
}

export async function requestMoreVerificationInfo(req, res, next) {
  try {
    const actorId = getUserId(req);
    const targetUserId = req.params.userId;
    const { message = "" } = req.body || {};
    const user = await User.findById(toObjectId(targetUserId, "User ID"));
    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "User not found");
    }

    const before = user.getPublicProfile ? user.getPublicProfile() : user.toObject();
    user.isEmailVerified = false;
    user.verificationStatus = "pending";
    await user.save();

    const after = user.getPublicProfile ? user.getPublicProfile() : user.toObject();
    await createAdminAudit({
      actorId,
      targetUserId,
      action: AUDIT_ACTIONS.UPDATE,
      before,
      after,
      metadata: { adminAction: "request_more_verification_info", message: message || "" },
    });
    await sendAdminNotification(
      user._id,
      "More verification information needed",
      message || "An administrator requested additional information for your verification.",
      "/app/verification"
    );
    const data = await loadAdminUserProfile(user._id);
    return buildResponse(res, 200, "Verification info requested", data);
  } catch (err) {
    next(err);
  }
}

export async function suspendUser(req, res, next) {
  try {
    const actorId = getUserId(req);
    const targetUserId = req.params.userId;
    const { reason = "", durationDays = null } = req.body || {};
    const suspensionReason = String(reason || "").trim();
    if (!suspensionReason) {
      throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "Suspension reason is required");
    }
    const user = await User.findById(toObjectId(targetUserId, "User ID"));
    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "User not found");
    }

    const before = user.getPublicProfile ? user.getPublicProfile() : user.toObject();
    const duration = durationDays !== null && durationDays !== undefined && durationDays !== ""
      ? Math.max(0, Number(durationDays) || 0)
      : null;
    user.accountStatus = "suspended";
    user.isActive = false;
    user.suspensionReason = suspensionReason;
    user.suspensionDurationDays = duration;
    user.suspensionEndsAt = duration ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null;
    user.suspendedAt = new Date();
    await user.save();

    const after = user.getPublicProfile ? user.getPublicProfile() : user.toObject();
    await createAdminAudit({
      actorId,
      targetUserId,
      action: AUDIT_ACTIONS.UPDATE,
      before,
      after,
      metadata: { adminAction: "suspend_user", reason: suspensionReason, durationDays: duration },
    });
    await sendAdminNotification(
      user._id,
      "Account suspended",
      `Your account has been suspended. Reason: ${suspensionReason}`,
      "/app/restricted"
    );
    const data = await loadAdminUserProfile(user._id);
    return buildResponse(res, 200, "User suspended", data);
  } catch (err) {
    next(err);
  }
}

export async function deactivateUser(req, res, next) {
  try {
    const actorId = getUserId(req);
    const targetUserId = req.params.userId;
    const user = await User.findById(toObjectId(targetUserId, "User ID"));
    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "User not found");
    }

    const before = user.getPublicProfile ? user.getPublicProfile() : user.toObject();
    user.accountStatus = "deactivated";
    user.isActive = false;
    user.deactivatedAt = new Date();
    await user.save();

    const after = user.getPublicProfile ? user.getPublicProfile() : user.toObject();
    await createAdminAudit({
      actorId,
      targetUserId,
      action: AUDIT_ACTIONS.DELETE,
      before,
      after,
      metadata: { adminAction: "deactivate_user" },
    });
    await sendAdminNotification(
      user._id,
      "Account deactivated",
      "Your account has been permanently deactivated by an administrator.",
      "/app/restricted"
    );
    const data = await loadAdminUserProfile(user._id);
    return buildResponse(res, 200, "User deactivated", data);
  } catch (err) {
    next(err);
  }
}
