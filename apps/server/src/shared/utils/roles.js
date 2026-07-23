import { USER_ROLES } from "../config/constants.js";

export function isManagerRole(role) {
  return role === USER_ROLES.MANAGER || role === USER_ROLES.BOTH;
}

export function isHustlerRole(role) {
  return role === USER_ROLES.HUSTLER || role === USER_ROLES.BOTH;
}

export function hasAllowedRole(role, allowedRoles = []) {
  if (!allowedRoles.length) return true;
  if (allowedRoles.includes(role)) return true;
  if (role === USER_ROLES.BOTH) {
    return allowedRoles.some((allowedRole) => allowedRole === USER_ROLES.HUSTLER || allowedRole === USER_ROLES.MANAGER);
  }
  return false;
}

export function getDefaultLandingPath(role) {
  if (role === USER_ROLES.ADMIN) return "/admin";
  if (role === USER_ROLES.MANAGER) return "/manager";
  return "/dashboard";
}
