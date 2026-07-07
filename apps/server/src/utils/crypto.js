/**
 * Crypto utilities for authentication flows
 */

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { logger } from "./logger.js";

export function generateRandomToken(size = 32) {
  return crypto.randomBytes(size).toString("hex");
}

export function generateNumericOtp(length = 6) {
  const digits = [];
  for (let i = 0; i < length; i += 1) {
    digits.push(Math.floor(Math.random() * 10));
  }
  return digits.join("");
}

export async function hashValue(value) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(value, salt);
}

export async function compareHash(value, hash) {
  try {
    return bcrypt.compare(value, hash);
  } catch (error) {
    logger.error("Hash comparison failed", error);
    return false;
  }
}
