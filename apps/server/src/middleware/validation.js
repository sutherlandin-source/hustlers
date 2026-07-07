/**
 * Input validation middleware
 * Validates request body, params, and queries
 */

import { ApiError } from "./errorHandler.js";
import { HTTP_STATUS, ERROR_MESSAGES } from "../config/constants.js";

function validateData(data, rules) {
  const errors = {};
  
  for (const rule of rules) {
    const value = data[rule.field];

    // Check if required field is missing
    if (rule.required && (value === undefined || value === null || value === "")) {
      errors[rule.field] = errors[rule.field] || [];
      errors[rule.field].push(`${rule.field} is required`);
      continue;
    }

    // Skip optional fields if not provided
    if (!rule.required && (value === undefined || value === null || value === "")) {
      continue;
    }

    // Type check - allow strings for numbers in HTML forms
    const expectedType = rule.type === "email" ? "string" : rule.type;
    const actualType = Array.isArray(value) ? "array" : typeof value;
    
    // Special handling for amount field - accept both number and numeric string
    if (rule.field === "amount" && (actualType === "string" || actualType === "number")) {
      if (actualType === "string" && isNaN(Number(value))) {
        errors[rule.field] = errors[rule.field] || [];
        errors[rule.field].push(`${rule.field} must be a number`);
      }
      continue;
    }
    
    if (actualType !== expectedType) {
      errors[rule.field] = errors[rule.field] || [];
      errors[rule.field].push(`${rule.field} must be of type ${rule.type}`);
      continue;
    }

    if (rule.type === "string" && typeof value === "string") {
      if (rule.minLength && value.length < rule.minLength) {
        errors[rule.field] = errors[rule.field] || [];
        errors[rule.field].push(`${rule.field} must be at least ${rule.minLength} characters`);
      }
      if (rule.maxLength && value.length > rule.maxLength) {
        errors[rule.field] = errors[rule.field] || [];
        errors[rule.field].push(`${rule.field} must be at most ${rule.maxLength} characters`);
      }
    }

    if (rule.type === "number" && typeof value === "number") {
      if (rule.min !== undefined && value < rule.min) {
        errors[rule.field] = errors[rule.field] || [];
        errors[rule.field].push(`${rule.field} must be at least ${rule.min}`);
      }
      if (rule.max !== undefined && value > rule.max) {
        errors[rule.field] = errors[rule.field] || [];
        errors[rule.field].push(`${rule.field} must be at most ${rule.max}`);
      }
    }

    if (rule.type === "email" && typeof value === "string") {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(value)) {
        errors[rule.field] = errors[rule.field] || [];
        errors[rule.field].push(`${rule.field} must be a valid email address`);
      }
    }

    if (rule.pattern && typeof value === "string") {
      if (!rule.pattern.test(value)) {
        errors[rule.field] = errors[rule.field] || [];
        errors[rule.field].push(`${rule.field} format is invalid`);
      }
    }

    if (rule.custom && !rule.custom(value)) {
      errors[rule.field] = errors[rule.field] || [];
      errors[rule.field].push(`${rule.field} validation failed`);
    }
  }

  return errors;
}

export function validate(rules) {
  return (req, _res, next) => {
    try {
      const ruleArray = Array.isArray(rules) ? rules : [rules];
      const errors = validateData(req.body, ruleArray);

      if (Object.keys(errors).length > 0) {
        throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, ERROR_MESSAGES.VALIDATION_FAILED, errors);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function combineRules(...ruleSets) {
  return ruleSets.flat();
}
