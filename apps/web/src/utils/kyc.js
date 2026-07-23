export function hasKycVerification(user) {
  return Boolean(String(user?.idNumber || "").trim() && String(user?.mpesaNumber || "").trim());
}

export function hasVerifiedKyc(user) {
  const verificationStatus = String(user?.verificationStatus || "").toLowerCase();
  return verificationStatus === "verified" || (verificationStatus !== "rejected" && hasKycVerification(user) && Boolean(user?.isEmailVerified));
}

export function getKycProfilePath(pathname = "") {
  const path = String(pathname || "");
  if (path.startsWith("/manager")) return "/manager/profile";
  if (path.startsWith("/admin")) return "/admin/profile";
  return "/dashboard/profile";
}
