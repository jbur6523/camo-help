import type { PromoterAccountLinkStatus, PromoterStatus } from "@/lib/supabase/database.types";

export type PromoterAccessState = "approved" | "pending" | "blocked" | "unlinked";

export function determinePromoterAccess(
  promoterStatus: PromoterStatus | null,
  linkStatus: PromoterAccountLinkStatus | null
): PromoterAccessState {
  if (!promoterStatus || !linkStatus) return "unlinked";
  if (linkStatus !== "confirmed") return "blocked";
  if (promoterStatus === "pending") return "pending";
  if (promoterStatus === "active") return "approved";
  return "blocked";
}
