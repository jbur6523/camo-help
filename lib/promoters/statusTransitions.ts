import type { PromoterStatus } from "@/lib/supabase/database.types";

export type PromoterAdminAction = "approve" | "deny" | "disable" | "reactivate";

export function nextPromoterStatus(currentStatus: PromoterStatus, action: PromoterAdminAction) {
  if (currentStatus === "pending" && action === "approve") return "active";
  if (currentStatus === "pending" && action === "deny") return "denied";
  if (currentStatus === "active" && action === "disable") return "disabled";
  if ((currentStatus === "disabled" || currentStatus === "denied") && action === "reactivate") return "active";
  return null;
}
