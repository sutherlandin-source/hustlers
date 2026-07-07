/**
 * JWT token utility
 * Token generation, verification, and management
 */

import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { TOKEN_TYPES } from "../config/constants.js";
import { logger } from "./logger.js";

/**
 * Generate an access token
 */
export function generateAccessToken(payload) {
  try {
    return jwt.sign(
      {
        ...payload,
        type: TOKEN_TYPES.ACCESS,
      },
      env.JWT_SECRET,
      {
        expiresIn: env.JWT_EXPIRE,
        algorithm: "HS256",
      }
    );
  } catch (error) {
    logger.error("Failed to generate access token", error);
    throw new Error("Token generation failed");
  }
}

/**
 * Generate a refresh token
 */
export function generateRefreshToken(payload) {
  try {
    return jwt.sign(
      {
        ...payload,
        type: TOKEN_TYPES.REFRESH,
      },
      env.JWT_REFRESH_SECRET,
      {
        expiresIn: env.JWT_REFRESH_EXPIRE,
        algorithm: "HS256",
      }
    );
  } catch (error) {
    logger.error("Failed to generate refresh token", error);
    throw new Error("Token generation failed");
  }
}

/**
 * Verify an access token
 */
export function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error("Token has expired");
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error("Invalid token");
    }
    throw error;
  }
}

/**
 * Verify a refresh token
 */
export function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      algorithms: ["HS256"],
    });
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error("Refresh token has expired");
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error("Invalid refresh token");
    }
    throw error;
  }
}

/**
 * Generate both access and refresh tokens
 */
export function generateTokenPair(payload) {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
}
