import { getLandingPath } from "./roles.js";
import { hasKycVerification } from "./kyc.js";

function getProfilePathForRole(role) {
  if (role === "manager" || role === "both") return "/manager/profile";
  if (role === "admin") return "/admin/profile";
  return "/dashboard/profile";
}

export function hasCompleteBasicProfile(user) {
  return Boolean(
    String(user?.firstName || "").trim() &&
      String(user?.lastName || "").trim() &&
      String(user?.location || "").trim()
  );
}

export function requiresKycAtEntry(user) {
  return user?.role === "manager" || user?.role === "both" || user?.role === "admin";
}

export function getAppEntryTarget(user, options = {}) {
  const { pendingRoleChoice = false } = options;

  if (!user) return "/auth/login";
  const accountStatus = String(user?.accountStatus || "").toLowerCase();
  const status = String(user?.status || "").toLowerCase();
  if (user.isActive === false || accountStatus === "suspended" || status === "suspended") return "/app/restricted";
  if (pendingRoleChoice || !user?.role) return "/auth/role-choice";
  const profilePath = getProfilePathForRole(user?.role);
  if (!hasCompleteBasicProfile(user)) return profilePath;
  if (requiresKycAtEntry(user) && !hasKycVerification(user)) return profilePath;
  return getLandingPath(user?.role);
}
