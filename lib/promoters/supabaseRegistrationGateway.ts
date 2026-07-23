import "server-only";

import {
  type PromoterRegistrationGateway,
  type RegistrationCompletion,
  type RegistrationDetails
} from "@/lib/promoters/accountRegistration";
import {
  createSupabasePublicServerClient,
  createSupabaseServiceRoleClient
} from "@/lib/supabase/server";

export class PromoterRegistrationOperationalError extends Error {
  constructor(readonly reasonCode: "AUTH_ACCOUNT_UNAVAILABLE" | "REGISTRATION_LINK_FAILED") {
    super(reasonCode);
    this.name = "PromoterRegistrationOperationalError";
  }
}

export class SupabasePromoterRegistrationGateway implements PromoterRegistrationGateway {
  async provisionAuthUser(email: string, password: string) {
    const adminClient = createSupabaseServiceRoleClient();
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (!createError && created.user) {
      return created.user.id;
    }

    const publicClient = createSupabasePublicServerClient();
    const { data: recovered, error: recoveryError } = await publicClient.auth.signInWithPassword({
      email,
      password
    });

    if (recoveryError || !recovered.user) {
      throw new PromoterRegistrationOperationalError("AUTH_ACCOUNT_UNAVAILABLE");
    }

    await publicClient.auth.signOut({ scope: "local" });
    return recovered.user.id;
  }

  async completeRegistration(authUserId: string, registration: RegistrationDetails) {
    const client = createSupabaseServiceRoleClient();
    const { data, error } = await client.rpc("register_promoter_account", {
      p_auth_user_id: authUserId,
      p_email: registration.promoterEmail,
      p_promotion_name: registration.promotionName,
      p_last_promotion_date: registration.lastPromotionDate,
      p_contact_name: registration.contactName,
      p_government_id_filename: registration.governmentIdFileName,
      p_website_or_social: registration.websiteUrl
    });

    if (error || !isRegistrationCompletion(data)) {
      throw new PromoterRegistrationOperationalError("REGISTRATION_LINK_FAILED");
    }

    return data;
  }
}

function isRegistrationCompletion(value: unknown): value is RegistrationCompletion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<RegistrationCompletion>;
  return (
    ["created_pending", "already_linked", "existing_confirmation_required"].includes(candidate.outcome || "") &&
    ["pending", "active", "denied", "disabled"].includes(candidate.promoterStatus || "") &&
    ["confirmed", "pending_admin_confirmation"].includes(candidate.linkStatus || "")
  );
}
