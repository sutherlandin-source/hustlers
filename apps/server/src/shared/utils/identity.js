import { ApiError } from "../middleware/errorHandler.js";
import { HTTP_STATUS } from "../config/constants.js";

export function hasCompletedIdentityVerification(user) {
  return Boolean(String(user?.idNumber || "").trim() && String(user?.mpesaNumber || "").trim());
}

export function hasApprovedIdentityVerification(user) {
  const verificationStatus = String(user?.verificationStatus || "").toLowerCase();
  return verificationStatus === "verified" || (verificationStatus !== "rejected" && hasCompletedIdentityVerification(user) && Boolean(user?.isEmailVerified));
}

export function requireIdentityVerification(user, actionDescription) {
  if (hasCompletedIdentityVerification(user)) {
    return;
  }

  throw new ApiError(
    HTTP_STATUS.FORBIDDEN,
    `Complete your identity verification in Profile before you ${actionDescription}.`
  );
}
