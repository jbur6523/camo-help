import "server-only";

import { determinePromoterAccess } from "@/lib/promoters/access";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type {
  PromoterAccountLinkStatus,
  PromoterStatus
} from "@/lib/supabase/database.types";

export type CurrentPromoter = {
  authenticated: boolean;
  access: "approved" | "pending" | "blocked" | "unlinked";
  profile?: {
    promotionName: string;
    promoterName: string;
    promoterEmail: string;
    status: PromoterStatus;
  };
};

export async function getCurrentPromoter(): Promise<CurrentPromoter> {
  const authClient = await createSupabaseAuthServerClient();
  const { data: authData, error: authError } = await authClient.auth.getUser();

  if (authError || !authData.user) {
    return { authenticated: false, access: "unlinked" };
  }

  const adminClient = createSupabaseServiceRoleClient();
  const { data: account, error: accountError } = await adminClient
    .from("promoter_accounts")
    .select("promoter_id, link_status")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();

  if (accountError || !account) {
    return { authenticated: true, access: "unlinked" };
  }

  const { data: promoter, error: promoterError } = await adminClient
    .from("promoters")
    .select("promotion_name, contact_name, email, status")
    .eq("id", account.promoter_id)
    .maybeSingle();

  if (promoterError || !promoter) {
    return { authenticated: true, access: "unlinked" };
  }

  return {
    authenticated: true,
    access: determinePromoterAccess(
      promoter.status as PromoterStatus,
      account.link_status as PromoterAccountLinkStatus
    ),
    profile: {
      promotionName: promoter.promotion_name,
      promoterName: promoter.contact_name,
      promoterEmail: promoter.email,
      status: promoter.status as PromoterStatus
    }
  };
}
