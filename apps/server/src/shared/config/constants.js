/**
 * Application constants
 * Shared constants and configuration values
 */

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

export const ERROR_MESSAGES = {
  VALIDATION_FAILED: "Validation failed",
  UNAUTHORIZED: "Unauthorized access",
  NOT_FOUND: "Resource not found",
  CONFLICT: "Resource already exists",
  INTERNAL_ERROR: "Internal server error",
  DATABASE_ERROR: "Database operation failed",
  INVALID_CREDENTIALS: "Invalid credentials",
  TOKEN_EXPIRED: "Token has expired",
  INVALID_TOKEN: "Invalid token",
  MISSING_REQUIRED_FIELDS: "Missing required fields",
};

export const SUCCESS_MESSAGES = {
  HEALTH_CHECK: "Server is healthy",
  LOGIN_SUCCESS: "Login successful",
  REGISTER_SUCCESS: "Registration successful",
  LOGOUT_SUCCESS: "Logout successful",
  PASSWORD_CHANGED: "Password changed successfully",
  PROFILE_UPDATED: "Profile updated successfully",
};

export const TOKEN_TYPES = {
  ACCESS: "access",
  REFRESH: "refresh",
};

export const USER_ROLES = {
  HUSTLER: "hustler",
  MANAGER: "manager",
  ADMIN: "admin",
};

export const MILESTONE_STATUSES = {
  PENDING: "pending",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
};

export const WORK_STATUS = {
  NOT_STARTED: "not_started",
  IN_PROGRESS: "in_progress",
  WORK_SUBMITTED: "work_submitted",
  NEEDS_REVISION: "needs_revision",
  APPROVED: "approved",
};

export const CONTRACT_STATUSES = {
  PENDING: "pending",
  APPLIED: "applied",
  ASSIGNED: "assigned",
  APPROVED: "approved",
  REJECTED: "rejected",
  // legacy/other states kept for backward compatibility
  ACTIVE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  DISPUTED: "disputed",
  TERMINATED: "terminated",
};

export const CONTRACT_PAYMENT_TYPES = {
  SINGLE: "single",
  STAGED: "staged",
};

export const PAYMENT_RATE_TYPES = {
  FIXED: "fixed",
  DAILY: "daily",
  HOURLY: "hourly",
};

export const ESCROW_STATUSES = {
  WAITING_FOR_FUNDING: "waiting_for_funding",
  FUNDED: "funded",
  IN_PROGRESS: "in_progress",
  AWAITING_APPROVAL: "awaiting_approval",
  RELEASED: "released",
};

export const WALLET_TYPES = {
  USER: "user",
  PLATFORM: "platform",
  ESCROW: "escrow",
};

export const WALLET_STATUSES = {
  ACTIVE: "active",
  SUSPENDED: "suspended",
  CLOSED: "closed",
};

export const TRANSACTION_TYPES = {
  DEBIT: "debit",
  CREDIT: "credit",
  HOLD: "hold",
  REFUND: "refund",
  COMMISSION: "commission",
  WITHDRAWAL: "withdrawal",
  DEPOSIT: "deposit",
};

export const TRANSACTION_STATUSES = {
  PENDING: "pending",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
};

export const PAYMENT_STATUSES = {
  PENDING: "pending",
  RELEASED: "released",
  REFUNDED: "refunded",
};

export const DISPUTE_STATUSES = {
  OPEN: "open",
  UNDER_REVIEW: "under_review",
  RESOLVED: "resolved",
  APPEALED: "appealed",
  CLOSED: "closed",
};

export const RATING_TYPES = {
  SERVICE: "service",
  CONTRACT: "contract",
  USER: "user",
};

export const NOTIFICATION_TYPES = {
  SYSTEM: "system",
  USER: "user",
  TRANSACTION: "transaction",
  DISPUTE: "dispute",
  CONTRACT: "contract",
  RATING: "rating",
};

export const NOTIFICATION_STATUSES = {
  UNREAD: "unread",
  READ: "read",
  ARCHIVED: "archived",
};

export const AUDIT_ACTIONS = {
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  LOGIN: "login",
  LOGOUT: "logout",
  TRANSACTION: "transaction",
  DISPUTE: "dispute",
  CONTRACT: "contract",
};

export const ENTITY_TYPES = {
  USER: "user",
  CONTRACT: "contract",
  MILESTONE: "milestone",
  WALLET: "wallet",
  TRANSACTION: "transaction",
  DISPUTE: "dispute",
  RATING: "rating",
  NOTIFICATION: "notification",
  AUDIT_LOG: "audit_log",
};

export const VALIDATION_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[1-9]\d{1,14}$/,
  KENYA_PHONE: /^\+254\d{9}$/,
  STRONG_PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
};

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};

export const MPESA_CONFIG = {
  BUSINESS_SHORTCODE: "174379",
  CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY || "",
  CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET || "",
  PASSKEY: process.env.MPESA_PASSKEY || "",
  CALLBACKURL: process.env.MPESA_CALLBACK_URL || "",
};

export const ESCROW_CONFIG = {
  HOLD_PERCENTAGE: 0.1,
  RELEASE_CONDITIONS: {
    MILESTONE_APPROVED: "milestone_approved",
    DISPUTE_RESOLVED: "dispute_resolved",
  },
};
