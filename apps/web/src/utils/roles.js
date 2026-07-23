export const APP_ROLES = {
  HUSTLER: "hustler",
  MANAGER: "manager",
  BOTH: "both",
  ADMIN: "admin",
};

export function isManagerRole(role) {
  return role === APP_ROLES.MANAGER || role === APP_ROLES.BOTH;
}

export function isHustlerRole(role) {
  return role === APP_ROLES.HUSTLER || role === APP_ROLES.BOTH;
}

export function getLandingPath(role) {
  if (role === APP_ROLES.ADMIN) return "/admin";
  if (role === APP_ROLES.MANAGER) return "/manager";
  return "/dashboard";
}

export function getRoleLabel(role) {
  if (role === APP_ROLES.HUSTLER) return "Hustler";
  if (role === APP_ROLES.MANAGER) return "Manager";
  if (role === APP_ROLES.BOTH) return "Both";
  if (role === APP_ROLES.ADMIN) return "Admin";
  return "Member";
}

export function hasAllowedRole(role, allowedRoles = []) {
  if (!allowedRoles.length) return true;
  if (allowedRoles.includes(role)) return true;
  if (role === APP_ROLES.BOTH) {
    return allowedRoles.some((allowedRole) => allowedRole === APP_ROLES.HUSTLER || allowedRole === APP_ROLES.MANAGER);
  }
  return false;
}
