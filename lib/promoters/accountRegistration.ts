import type { PromoterRegistration } from "@/lib/promoters/registrationSchema";

export type RegistrationCompletion = {
  outcome: "created_pending" | "already_linked" | "existing_confirmation_required";
  promoterStatus: "pending" | "active" | "denied" | "disabled";
  linkStatus: "confirmed" | "pending_admin_confirmation";
};

export type RegistrationDetails = PromoterRegistration & {
  governmentIdFileName: string;
};

export interface PromoterRegistrationGateway {
  provisionAuthUser(email: string, password: string): Promise<string>;
  completeRegistration(authUserId: string, registration: RegistrationDetails): Promise<RegistrationCompletion>;
}

export async function registerPromoterAccount(
  registration: RegistrationDetails,
  password: string,
  gateway: PromoterRegistrationGateway
) {
  const normalizedRegistration = {
    ...registration,
    promoterEmail: normalizePromoterEmail(registration.promoterEmail)
  };
  const authUserId = await gateway.provisionAuthUser(normalizedRegistration.promoterEmail, password);
  return gateway.completeRegistration(authUserId, normalizedRegistration);
}

export function normalizePromoterEmail(email: string) {
  return email.trim().toLowerCase();
}
