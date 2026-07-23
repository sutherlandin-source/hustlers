export function formatMoney(amount, currency = "KSH") {
  const numericAmount = Number(amount || 0);
  return `${currency} ${numericAmount.toLocaleString()}`;
}

export function formatDate(value) {
  if (!value) return "Not specified";
  return new Date(value).toLocaleDateString();
}

export function getDisplayName(person) {
  if (!person) return "Unknown";
  const firstName = String(person.firstName || "").trim();
  const lastName = String(person.lastName || "").trim();
  return person.name || [firstName, lastName].filter(Boolean).join(" ") || person.email || "Unknown";
}

