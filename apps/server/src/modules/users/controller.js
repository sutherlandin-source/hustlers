/**
 * User Controller
 * Handles user profile operations
 */

import { User } from "../../shared/models/User.js";
import { ApiError } from "../../shared/middleware/errorHandler.js";
import { HTTP_STATUS } from "../../shared/config/constants.js";

function buildResponse(res, status, message, data = {}) {
  return res.status(status).json({ success: status >= 200 && status < 300, message, data, timestamp: new Date().toISOString() });
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

export async function listUsers(req, res, next) {
  try {
    const { role, status, search } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (status === "active") filter.isActive = true;
    if (status === "inactive") filter.isActive = false;
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
    const users = await User.find(filter)
      .select("-password -refreshTokenHash -emailVerificationToken -passwordResetToken -otpCodeHash")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    return buildResponse(res, 200, "Users retrieved", { users });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const { email, phoneNumber, bio, location, companyName, industry, skills, experienceLevel, avatar } = req.body;
    
    const updateData = {};
    if (email) updateData.email = email;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;
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
