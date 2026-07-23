import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  registerPromoterAccount,
  type PromoterRegistrationGateway,
  type RegistrationCompletion,
  type RegistrationDetails
} from "@/lib/promoters/accountRegistration";
import { promoterAccountRegistrationSchema } from "@/lib/promoters/accountRegistrationSchema";
import { determinePromoterAccess } from "@/lib/promoters/access";
import { promoterApprovalEmailText } from "@/lib/promoters/approvalEmail";
import { promoterPasswordResetRedirectUrl, safeAuthDestination } from "@/lib/promoters/redirects";
import { nextPromoterStatus } from "@/lib/promoters/statusTransitions";

const registration: RegistrationDetails = {
  promotionName: "Synthetic Fight Promotions",
  lastPromotionDate: "07/01/2026",
  promoterEmail: "PROMOTER@EXAMPLE.INVALID ",
  contactName: "Synthetic Promoter",
  websiteUrl: "https://example.invalid/synthetic",
  governmentIdFileName: "synthetic-id.pdf"
};

class MemoryRegistrationGateway implements PromoterRegistrationGateway {
  readonly authUsers = new Map<string, { id: string; password: string }>();
  readonly registrations = new Map<string, { authUserId: string; registration: RegistrationDetails }>();
  authCreateCount = 0;
  registrationCreateCount = 0;
  failCompletionOnce = false;

  async provisionAuthUser(email: string, password: string) {
    const existing = this.authUsers.get(email);
    if (existing) {
      if (existing.password !== password) throw new Error("AUTH_ACCOUNT_UNAVAILABLE");
      return existing.id;
    }
    this.authCreateCount += 1;
    const user = { id: `synthetic-auth-${this.authCreateCount}`, password };
    this.authUsers.set(email, user);
    return user.id;
  }

  async completeRegistration(authUserId: string, details: RegistrationDetails): Promise<RegistrationCompletion> {
    if (this.failCompletionOnce) {
      this.failCompletionOnce = false;
      throw new Error("REGISTRATION_LINK_FAILED");
    }
    const existing = this.registrations.get(details.promoterEmail);
    if (existing) {
      assert.equal(existing.authUserId, authUserId);
      return { outcome: "already_linked", promoterStatus: "pending", linkStatus: "confirmed" };
    }
    this.registrationCreateCount += 1;
    this.registrations.set(details.promoterEmail, { authUserId, registration: details });
    return { outcome: "created_pending", promoterStatus: "pending", linkStatus: "confirmed" };
  }
}

test("registration validates the eight-character minimum and matching confirmation", () => {
  const base = {
    promotionName: registration.promotionName,
    lastPromotionDate: registration.lastPromotionDate,
    promoterEmail: registration.promoterEmail,
    contactName: registration.contactName,
    websiteUrl: registration.websiteUrl
  };
  const short = promoterAccountRegistrationSchema.safeParse({
    ...base,
    password: "short",
    confirmPassword: "short"
  });
  assert.equal(short.success, false);
  if (!short.success) {
    assert.match(short.error.flatten().fieldErrors.password?.[0] || "", /at least eight/i);
  }

  const mismatch = promoterAccountRegistrationSchema.safeParse({
    ...base,
    password: "eightchars",
    confirmPassword: "different"
  });
  assert.equal(mismatch.success, false);
  if (!mismatch.success) {
    assert.match(mismatch.error.flatten().fieldErrors.confirmPassword?.[0] || "", /match/i);
  }
});

test("registration provisions Auth once, creates one pending record, links once, and normalizes email", async () => {
  const gateway = new MemoryRegistrationGateway();
  assert.deepEqual(await registerPromoterAccount(registration, "synthetic-password", gateway), {
    outcome: "created_pending",
    promoterStatus: "pending",
    linkStatus: "confirmed"
  });
  assert.deepEqual(await registerPromoterAccount(registration, "synthetic-password", gateway), {
    outcome: "already_linked",
    promoterStatus: "pending",
    linkStatus: "confirmed"
  });
  assert.equal(gateway.authCreateCount, 1);
  assert.equal(gateway.registrationCreateCount, 1);
  assert.equal(gateway.authUsers.size, 1);
  assert.equal(gateway.registrations.size, 1);
  assert.ok(gateway.registrations.has("promoter@example.invalid"));
});

test("an Auth-created/database-failed partial registration is safely recoverable", async () => {
  const gateway = new MemoryRegistrationGateway();
  gateway.failCompletionOnce = true;
  await assert.rejects(registerPromoterAccount(registration, "synthetic-password", gateway), /REGISTRATION_LINK_FAILED/);
  assert.equal(gateway.authUsers.size, 1);
  assert.equal(gateway.registrations.size, 0);

  const recovered = await registerPromoterAccount(registration, "synthetic-password", gateway);
  assert.equal(recovered.outcome, "created_pending");
  assert.equal(gateway.authCreateCount, 1);
  assert.equal(gateway.registrationCreateCount, 1);
});

test("live status and confirmed mapping jointly authorize each protected request", () => {
  assert.equal(determinePromoterAccess("active", "confirmed"), "approved");
  assert.equal(determinePromoterAccess("pending", "confirmed"), "pending");
  assert.equal(determinePromoterAccess("denied", "confirmed"), "blocked");
  assert.equal(determinePromoterAccess("disabled", "confirmed"), "blocked");
  assert.equal(determinePromoterAccess("active", "pending_admin_confirmation"), "blocked");
  assert.equal(determinePromoterAccess(null, null), "unlinked");
});

test("approval unlocks active accounts while denial and deactivation remain blocked", () => {
  assert.equal(nextPromoterStatus("pending", "approve"), "active");
  assert.equal(determinePromoterAccess(nextPromoterStatus("pending", "approve"), "confirmed"), "approved");
  assert.equal(nextPromoterStatus("pending", "deny"), "denied");
  assert.equal(nextPromoterStatus("active", "disable"), "disabled");
  assert.equal(determinePromoterAccess("disabled", "confirmed"), "blocked");
});

test("approval email references the promoter-selected password without containing credentials or invitations", () => {
  const secret = "never-include-this-secret";
  const text = promoterApprovalEmailText("Synthetic Fight Promotions");
  assert.match(text, /email and password you selected during registration/i);
  assert.doesNotMatch(text, new RegExp(secret));
  assert.doesNotMatch(text, /temporary password|invitation|activation link|reset token/i);
});

test("password-reset destinations are fixed and reject external or unexpected redirects", () => {
  assert.equal(safeAuthDestination("/promoters/reset-password"), "/promoters/reset-password");
  assert.equal(safeAuthDestination("https://attacker.invalid"), null);
  assert.equal(safeAuthDestination("//attacker.invalid"), null);
  assert.equal(safeAuthDestination("/admin/promoters"), null);

  assert.equal(
    promoterPasswordResetRedirectUrl("https://preview.example.invalid"),
    "https://preview.example.invalid/auth/callback?next=%2Fpromoters%2Freset-password"
  );
  assert.throws(() => promoterPasswordResetRedirectUrl("javascript:alert(1)"), /HTTP or HTTPS/);
});

test("navigation, registration, login, dashboard, and logout surfaces are present", () => {
  const landing = source("components/ApplicationWizard.tsx");
  const access = source("app/promoters/page.tsx");
  const registrationForm = source("components/PromoterRegistrationForm.tsx");
  const login = source("components/PromoterLoginForm.tsx");
  const dashboard = source("app/promoters/dashboard/page.tsx");

  assert.match(landing, /Promoter Login \/ Registration/);
  assert.match(landing, /href="\/promoters"/);
  assert.match(access, /Login/);
  assert.match(access, /Register/);
  assert.match(access, /\/promoters\/login/);
  assert.match(access, /\/promoter-registration/);
  assert.match(registrationForm, /name="password"/);
  assert.match(registrationForm, /name="confirmPassword"/);
  assert.match(registrationForm, /autoComplete="new-password"/);
  assert.match(login, /autoComplete="email"/);
  assert.match(login, /autoComplete="current-password"/);
  assert.match(dashboard, /Fighter CAMO Submissions/);
  assert.match(dashboard, /Generate Bout Agreement/);
  assert.equal((dashboard.match(/Coming soon/g) || []).length >= 1, true);
  assert.match(dashboard, /PromoterLogoutButton/);
});

test("passwords and tokens are absent from persistence, database schema, account mappings, and logs", () => {
  const registrationForm = source("components/PromoterRegistrationForm.tsx");
  const registrationRoute = source("app/api/promoter-registration/route.ts");
  const migration = source("supabase/migrations/202607220001_promoter_auth_foundation.sql");

  assert.doesNotMatch(registrationForm, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(migration, /password_hash|password_reset_token|session_token|temporary_password/i);
  assert.doesNotMatch(registrationRoute, /console\.(log|info|warn|error)\([^)]*password/i);
  assert.doesNotMatch(registrationRoute, /sendSupportPromoterRegistrationNotification\(\{[\s\S]*?\.\.\./);
});

test("private mapping RLS, uniqueness, legacy confirmation, and public-directory field limits are explicit", () => {
  const migration = source("supabase/migrations/202607220001_promoter_auth_foundation.sql");
  const directory = source("app/api/promoters/route.ts");
  const dashboardResolver = source("lib/promoters/currentPromoter.ts");

  assert.match(migration, /unique \(promoter_id\)/i);
  assert.match(migration, /unique \(auth_user_id\)/i);
  assert.match(migration, /promoters_email_normalized_uidx/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /auth\.uid\(\) = auth_user_id/i);
  assert.match(migration, /pending_admin_confirmation/i);
  assert.match(migration, /revoke all [\s\S]* from anon/i);
  assert.match(directory, /\.select\("id, promotion_name"\)/);
  assert.doesNotMatch(directory, /auth_user_id|promoter_accounts/);
  assert.match(dashboardResolver, /\.eq\("auth_user_id", authData\.user\.id\)/);
});

test("forgot-password responses are generic and no admin password-reset surface exists", () => {
  const forgotForm = source("components/ForgotPasswordForm.tsx");
  const adminFiles = [
    source("components/AdminPromotersDashboard.tsx"),
    source("app/api/admin/promoters/[id]/route.ts"),
    source("app/api/admin/promoters/[id]/account-link/route.ts")
  ].join("\n");
  assert.match(
    forgotForm,
    /If an account is associated with that email, password-reset instructions will be sent\./
  );
  assert.match(forgotForm, /resetPasswordForEmail/);
  assert.doesNotMatch(forgotForm, /setMessage\([^)]*(error|data)/i);
  assert.doesNotMatch(adminFiles, /resetPasswordForEmail|updateUser\(\{\s*password|temporary password/i);
});

test("approval email failure cannot undo status, reset cannot change approval, and logout ends the session", () => {
  const approvalRoute = source("app/api/admin/promoters/[id]/route.ts");
  const resetForm = source("components/ResetPasswordForm.tsx");
  const logoutRoute = source("app/auth/logout/route.ts");
  const css = source("app/globals.css");

  const statusUpdate = approvalRoute.indexOf(".update({");
  const approvalEmail = approvalRoute.indexOf("sendPromoterApprovalEmail({");
  assert.ok(statusUpdate >= 0 && approvalEmail > statusUpdate);
  assert.match(approvalRoute, /Promoter approved, but the approval email could not be sent/);
  assert.doesNotMatch(approvalRoute, /inviteUserByEmail|generateLink|temporary password/i);
  assert.match(resetForm, /auth\.updateUser\(\{ password \}\)/);
  assert.doesNotMatch(resetForm, /promoter.*status|status.*promoter/i);
  assert.match(logoutRoute, /auth\.signOut\(\)/);
  assert.match(css, /@media \(min-width: 700px\)[\s\S]*dashboard-card-grid/);
});

function source(path: string) {
  return readFileSync(path, "utf8");
}
