/**
 * Authentication Service
 * Business logic for authentication operations
 */

import { User } from "../../shared/models/User.js";
import { generateTokenPair, verifyRefreshToken } from "../../shared/utils/jwt.js";
import { hashValue, compareHash, generateRandomToken, generateNumericOtp } from "../../shared/utils/crypto.js";
import { ApiError } from "../../shared/middleware/errorHandler.js";
import { HTTP_STATUS, ERROR_MESSAGES, USER_ROLES, VALIDATION_PATTERNS } from "../../shared/config/constants.js";
import { logger } from "../../shared/utils/logger.js";

const PASSWORD_RESET_EXPIRATION_MINUTES = 60;
const OTP_CODE_EXPIRATION_MINUTES = 10;

export class AuthService {
  async register(input) {
    try {
      const existingUser = await User.findOne({ email: input.email.toLowerCase() });
      if (existingUser) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "Email already registered");
      }

      const allowedExperienceLevels = ["entry", "intermediate", "expert"];
      const experienceLevel = allowedExperienceLevels.includes(input.experienceLevel)
        ? input.experienceLevel
        : undefined;

      const user = new User({
        email: input.email.toLowerCase(),
        password: input.password,
        firstName: input.firstName,
        lastName: input.lastName,
        role: [USER_ROLES.HUSTLER, USER_ROLES.MANAGER].includes(input.role) ? input.role : USER_ROLES.HUSTLER,
        phoneNumber: input.phoneNumber,
        idNumber: input.idNumber,
        mpesaNumber: input.mpesaNumber,
        location: input.location,
        bio: input.bio,
        skills: Array.isArray(input.skills) ? input.skills.filter(Boolean) : [],
        experienceLevel,
        companyName: input.companyName || undefined,
        industry: input.industry || undefined,
      });

      await user.save();
      const tokens = generateTokenPair({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      });

      await user.setRefreshToken(tokens.refreshToken);
      await user.save();

      logger.info("User registered successfully", {
        userId: user._id,
        email: user.email,
      });

      return {
        user: user.getPublicProfile(),
        ...tokens,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (error && error.name === "ValidationError") {
        const fieldErrors = {};
        for (const [field, err] of Object.entries(error.errors || {})) {
          fieldErrors[field] = [err.message];
        }
        throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, ERROR_MESSAGES.VALIDATION_FAILED, fieldErrors);
      }

      // Handle MongoDB duplicate key errors (e.g. unique email or phone)
      if (error && error.code === 11000) {
        const dupKey = Object.keys(error.keyValue || {})[0];
        const message = dupKey ? `${dupKey} already exists` : "Duplicate key error";
        throw new ApiError(HTTP_STATUS.CONFLICT, message, { [dupKey]: [`${dupKey} already exists`] });
      }

      logger.error("Registration failed", error);
      throw new ApiError(HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_MESSAGES.INTERNAL_ERROR);
    }
  }

  async login(input) {
    try {
      const user = await User.findOne({ email: input.email.toLowerCase() }).select("+password +refreshTokenHash");
      if (!user) {
        throw new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.INVALID_CREDENTIALS);
      }

      const isPasswordValid = await user.comparePassword(input.password);
      if (!isPasswordValid) {
        throw new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.INVALID_CREDENTIALS);
      }

      if (!user.isActive) {
        throw new ApiError(HTTP_STATUS.UNAUTHORIZED, "Account is disabled");
      }

      user.lastLogin = new Date();
      const tokens = generateTokenPair({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      });

      await user.setRefreshToken(tokens.refreshToken);
      await user.save();

      logger.info("User logged in successfully", {
        userId: user._id,
        email: user.email,
      });

      return {
        user: user.getPublicProfile(),
        ...tokens,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      logger.error("Login failed", error);
      throw new ApiError(HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_MESSAGES.INTERNAL_ERROR);
    }
  }

  async logout(userId) {
    const user = await User.findById(userId).select("+refreshTokenHash");
    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "User not found");
    }

    await user.setRefreshToken(null);
    await user.save();

    return { success: true };
  }

  async refreshTokens(refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      const user = await User.findById(payload.userId).select("+refreshTokenHash");
      if (!user) {
        throw new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.INVALID_TOKEN);
      }

      const isValid = await user.compareRefreshToken(refreshToken);
      if (!isValid) {
        throw new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.INVALID_TOKEN);
      }

      const tokens = generateTokenPair({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      });

      await user.setRefreshToken(tokens.refreshToken);
      await user.save();

      return {
        user: user.getPublicProfile(),
        ...tokens,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      logger.error("Refresh token failed", error);
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.INVALID_TOKEN);
    }
  }

  async requestPasswordReset(email) {
    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return { success: true, message: "Password reset request received" };
    }

    const resetToken = generateRandomToken(24);
    user.passwordResetToken = await hashValue(resetToken);
    user.passwordResetTokenExpires = new Date(Date.now() + PASSWORD_RESET_EXPIRATION_MINUTES * 60 * 1000);
    await user.save();

    logger.info("Password reset requested", { userId: user._id, email: user.email });

    return {
      success: true,
      message: "Password reset link generated",
      resetToken,
    };
  }

  async resetPassword(email, token, newPassword) {
    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({ email: normalizedEmail, passwordResetTokenExpires: { $gt: new Date() } }).select(
      "+passwordResetToken +password +refreshTokenHash"
    );

    if (!user) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Invalid or expired password reset token");
    }

    const isTokenValid = await compareHash(token, user.passwordResetToken);
    if (!isTokenValid) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Invalid or expired password reset token");
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetTokenExpires = undefined;
    await user.setRefreshToken(null);
    await user.save();

    logger.info("Password reset completed", { userId: user._id });

    return { success: true, message: "Password reset successfully" };
  }

  async requestOtp(email, purpose = "login") {
    if (!VALIDATION_PATTERNS.EMAIL.test(email)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "A valid email address is required");
    }

    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "User not found");
    }

    const otpCode = generateNumericOtp(6);
    user.otpCodeHash = await hashValue(otpCode);
    user.otpCodeExpires = new Date(Date.now() + OTP_CODE_EXPIRATION_MINUTES * 60 * 1000);
    user.otpPurpose = purpose;
    await user.save();

    logger.info("OTP generated", { userId: user._id, purpose });

    return {
      success: true,
      message: "OTP code generated",
      otpCode,
    };
  }

  async verifyOtp(email, otpCode, purpose = "login") {
    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({ email: normalizedEmail, otpPurpose: purpose, otpCodeExpires: { $gt: new Date() } }).select("+otpCodeHash");
    if (!user) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Invalid or expired OTP code");
    }

    const isValid = await user.compareOtpCode(otpCode);
    if (!isValid) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Invalid or expired OTP code");
    }

    user.otpCodeHash = undefined;
    user.otpCodeExpires = undefined;
    user.otpPurpose = undefined;
    await user.save();

    return {
      success: true,
      message: "OTP verified successfully",
    };
  }

  async getUserById(userId) {
    return User.findById(userId);
  }

  async updateProfile(userId, updates) {
    delete updates.password;
    delete updates.emailVerificationToken;
    delete updates.passwordResetToken;

    return User.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true,
    });
  }
}

export const authService = new AuthService();
