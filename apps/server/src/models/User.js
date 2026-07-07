/**
 * User Model
 * Represents application users
 */

import mongoose, { Schema, model } from "mongoose";
import bcrypt from "bcryptjs";
import { getBaseSchemaOptions } from "./BaseSchema.js";
import { USER_ROLES } from "../config/constants.js";

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please provide a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // Don't return password by default
    },
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    idNumber: {
      type: String,
      trim: true,
    },
    mpesaNumber: {
      type: String,
      trim: true,
    },
    location: {
      type: String,
      trim: true,
    },
    skills: [
      {
        type: String,
        trim: true,
      },
    ],
    experienceLevel: {
      type: String,
      trim: true,
      enum: ["entry", "intermediate", "expert"],
    },
    companyName: {
      type: String,
      trim: true,
    },
    industry: {
      type: String,
      trim: true,
    },
    wallet: {
      type: Schema.Types.ObjectId,
      ref: "Wallet",
    },
    avatar: {
      type: String,
    },
    bio: {
      type: String,
      maxlength: [500, "Bio cannot exceed 500 characters"],
    },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.HUSTLER,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationTokenExpires: {
      type: Date,
      select: false,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetTokenExpires: {
      type: Date,
      select: false,
    },
    refreshTokenHash: {
      type: String,
      select: false,
    },
    otpCodeHash: {
      type: String,
      select: false,
    },
    otpCodeExpires: {
      type: Date,
      select: false,
    },
    otpPurpose: {
      type: String,
      trim: true,
      default: null,
      select: false,
    },
    lastLogin: {
      type: Date,
    },
  },
  getBaseSchemaOptions()
);

/**
 * Hash password before saving
 */
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Compare password method
 */
userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

/**
 * Compare a refresh token hash
 */
userSchema.methods.compareRefreshToken = async function (token) {
  if (!this.refreshTokenHash) return false;
  return bcrypt.compare(token, this.refreshTokenHash);
};

/**
 * Set a hashed refresh token
 */
userSchema.methods.setRefreshToken = async function (token) {
  if (!token) {
    this.refreshTokenHash = undefined;
    return;
  }
  const salt = await bcrypt.genSalt(12);
  this.refreshTokenHash = await bcrypt.hash(token, salt);
};

/**
 * Compare OTP code hash
 */
userSchema.methods.compareOtpCode = async function (code) {
  if (!this.otpCodeHash) return false;
  return bcrypt.compare(code, this.otpCodeHash);
};

/**
 * Get public profile (without sensitive data)
 */
userSchema.methods.getPublicProfile = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.emailVerificationToken;
  delete obj.passwordResetToken;
  delete obj.refreshTokenHash;
  delete obj.otpCodeHash;
  delete obj.otpCodeExpires;
  delete obj.otpPurpose;
  delete obj.__v;
  return obj;
};

/**
 * Index definitions
 */
userSchema.index({ email: 1 }, { unique: true, background: true });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
// Ensure phoneNumber is unique only when present (avoids duplicate nulls)
userSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true, background: true });
// Legacy `phone` field (if present in DB) should also be unique only when present
userSchema.index({ phone: 1 }, { unique: true, sparse: true, background: true });

// Handle model recompilation on hot reload (nodemon)
// Safely register model - if it already exists in mongoose, it will throw and we catch it
let User;
try {
  User = model("User", userSchema);
} catch (error) {
  if (error.name === "OverwriteModelError") {
    // Model already registered, get from mongoose models
    User = mongoose.model("User");
  } else {
    throw error;
  }
}
export { User };
