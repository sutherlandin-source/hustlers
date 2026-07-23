/**
 * User Controller
 * Handles user profile operations
 */

import { User } from "../models/index.js";
import { ApiError } from "../middleware/errorHandler.js";
import { USER_ROLES } from "../config/constants.js";

function buildResponse(res, status, message, data = {}) {
  return res.status(status).json({ success: status >= 200 && status < 300, message, data, timestamp: new Date().toISOString() });
}

export async function getProfile(req, res, next) {
  try {
    const user = await User.findById(req.user.userId).select("-password -refreshToken");
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    return buildResponse(res, 200, "Profile retrieved", { user: user.toPublicProfile ? user.toPublicProfile() : user });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const { email, phoneNumber, role, idNumber, mpesaNumber, bio, location, companyName, industry, skills, experienceLevel } = req.body;
    
    const updateData = {};
    if (email) updateData.email = email;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;
    if ([USER_ROLES.HUSTLER, USER_ROLES.MANAGER, "both"].includes(role)) updateData.role = role;
    if (idNumber !== undefined) updateData.idNumber = idNumber;
    if (mpesaNumber !== undefined) updateData.mpesaNumber = mpesaNumber;
    if (bio) updateData.bio = bio;
    if (location) updateData.location = location;
    if (companyName) updateData.companyName = companyName;
    if (industry) updateData.industry = industry;
    if (skills) updateData.skills = skills;
    if (experienceLevel) updateData.experienceLevel = experienceLevel;

    const user = await User.findByIdAndUpdate(req.user.userId, updateData, { new: true }).select("-password -refreshToken");
    
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return buildResponse(res, 200, "Profile updated", { user: user.toPublicProfile ? user.toPublicProfile() : user });
  } catch (err) {
    next(err);
  }
}
