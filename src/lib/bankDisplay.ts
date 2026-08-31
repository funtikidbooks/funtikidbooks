// Approximate brand colors for the banks that come up most among staff —
// purely cosmetic, falls back to the app's own accent color for anything
// else. Shared between MembersDirectory's staff cards and PayrollEditModal
// so both bank-card displays look the same.
const BANK_COLORS: Record<string, string> = {
  vietcombank: "#00693c",
  techcombank: "#1a1a1a",
  "mb bank": "#1c2f6e",
  mb: "#1c2f6e",
  acb: "#0033a0",
  bidv: "#0b3d91",
  vietinbank: "#0a4595",
  vpbank: "#00a651",
  tpbank: "#5a2d81",
  sacombank: "#00338d",
  agribank: "#8a1538",
};

export function bankColor(bankName: string | null) {
  if (!bankName) return "var(--color-accent-600)";
  return BANK_COLORS[bankName.trim().toLowerCase()] ?? "var(--color-accent-600)";
}

export function formatAccountNumber(n: string) {
  return n.replace(/(.{4})/g, "$1 ").trim();
}
