import { randomBytes, randomUUID } from "node:crypto";

const expectedAppId = "c3e0b89f-8cf8-4ddd-8a5b-5d44f0927c7b";
const appId = required("BESTIE_APP_ID");
const baseUrl = new URL(required("BESTIE_TEST_API_URL"));
const publishableKey = required("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = required("SERVICE_ROLE_KEY");

if (appId !== expectedAppId)
  throw new Error("Refusing to test an unexpected Bestie Cloud app.");
if (!(
  baseUrl.hostname === "127.0.0.1" ||
  baseUrl.hostname === "camo-help-api.bestiecloud.com"
)) {
  throw new Error("Refusing to test an unapproved backend hostname.");
}

const syntheticEmail = `phase-5a-${randomUUID()}@example.invalid`;
const syntheticPassword = randomBytes(24).toString("base64url");
const promoterId = randomUUID();
let authUserId: string | null = null;

const summary = {
  missingApiKeyRejected: false,
  anonymousPendingRows: -1,
  anonymousInsertRejected: false,
  authenticatedOwnRows: -1,
  authenticatedMappingRows: -1,
  authenticatedUpdateRejected: false,
  anonymousActiveRows: -1,
  loginSucceeded: false,
  refreshSucceeded: false,
  logoutSucceeded: false,
  cleanupSucceeded: false,
};

async function main() {
  try {
    summary.missingApiKeyRejected =
      (await request("/rest/v1/promoters?select=id", { omitApiKey: true }))
        .status === 401;

    const createUser = await request("/auth/v1/admin/users", {
      method: "POST",
      serviceRole: true,
      body: {
        email: syntheticEmail,
        password: syntheticPassword,
        email_confirm: true,
      },
    });
    assertStatus(createUser, 200, "create synthetic Auth user");
    authUserId = String((await createUser.json()).id || "");
    if (!/^[0-9a-f-]{36}$/i.test(authUserId))
      throw new Error("Auth did not return a valid synthetic user ID.");

    const login = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email: syntheticEmail, password: syntheticPassword },
    });
    assertStatus(login, 200, "sign in synthetic user");
    const loginBody = (await login.json()) as {
      access_token?: string;
      refresh_token?: string;
    };
    if (!loginBody.access_token || !loginBody.refresh_token)
      throw new Error("Auth login did not return a session.");
    summary.loginSucceeded = true;

    await insertWithServiceRole("promoters", {
      id: promoterId,
      promotion_name: "Phase 5A Synthetic Promotion",
      license_number: "SYNTHETIC-NOT-A-LICENSE",
      email: syntheticEmail,
      contact_name: "Synthetic Validation User",
      phone: "not-a-real-number",
      website_or_social: "https://example.invalid/phase-5a",
      status: "pending",
    });
    await insertWithServiceRole("promoter_accounts", {
      promoter_id: promoterId,
      auth_user_id: authUserId,
      link_status: "confirmed",
    });

    const anonymousPending = await request(
      `/rest/v1/promoters?id=eq.${promoterId}&select=id`,
    );
    assertStatus(anonymousPending, 200, "read pending promoter anonymously");
    summary.anonymousPendingRows = (
      (await anonymousPending.json()) as unknown[]
    ).length;

    const anonymousInsert = await request("/rest/v1/promoters", {
      method: "POST",
      body: {
        promotion_name: "Rejected Synthetic Insert",
        license_number: "REJECTED",
        email: `rejected-${randomUUID()}@example.invalid`,
        contact_name: "Rejected",
        phone: "rejected",
        status: "pending",
      },
    });
    summary.anonymousInsertRejected =
      anonymousInsert.status === 401 || anonymousInsert.status === 403;

    const ownPromoter = await request(
      `/rest/v1/promoters?id=eq.${promoterId}&select=id`,
      {
        accessToken: loginBody.access_token,
      },
    );
    assertStatus(ownPromoter, 200, "read own promoter as authenticated user");
    summary.authenticatedOwnRows = (
      (await ownPromoter.json()) as unknown[]
    ).length;

    const ownMapping = await request(
      `/rest/v1/promoter_accounts?promoter_id=eq.${promoterId}&select=id`,
      {
        accessToken: loginBody.access_token,
      },
    );
    assertStatus(ownMapping, 200, "read own mapping as authenticated user");
    summary.authenticatedMappingRows = (
      (await ownMapping.json()) as unknown[]
    ).length;

    const unauthorizedUpdate = await request(
      `/rest/v1/promoters?id=eq.${promoterId}`,
      {
        method: "PATCH",
        accessToken: loginBody.access_token,
        body: { status: "active" },
      },
    );
    summary.authenticatedUpdateRejected =
      unauthorizedUpdate.status === 401 || unauthorizedUpdate.status === 403;

    const serviceUpdate = await request(
      `/rest/v1/promoters?id=eq.${promoterId}`,
      {
        method: "PATCH",
        serviceRole: true,
        body: { status: "active" },
      },
    );
    assertStatus(serviceUpdate, 204, "update promoter with service role");

    const anonymousActive = await request(
      `/rest/v1/promoters?id=eq.${promoterId}&select=id`,
    );
    assertStatus(anonymousActive, 200, "read active promoter anonymously");
    summary.anonymousActiveRows = (
      (await anonymousActive.json()) as unknown[]
    ).length;

    const refresh = await request("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: loginBody.refresh_token },
    });
    assertStatus(refresh, 200, "refresh synthetic session");
    const refreshed = (await refresh.json()) as { access_token?: string };
    if (!refreshed.access_token)
      throw new Error("Auth refresh did not return a new access token.");
    summary.refreshSucceeded = true;

    const logout = await request("/auth/v1/logout", {
      method: "POST",
      accessToken: refreshed.access_token,
    });
    assertStatus(logout, 204, "log out synthetic session");
    summary.logoutSucceeded = true;
  } finally {
    const mappingCleanup = await request(
      `/rest/v1/promoter_accounts?promoter_id=eq.${promoterId}`,
      {
        method: "DELETE",
        serviceRole: true,
      },
    );
    const promoterCleanup = await request(
      `/rest/v1/promoters?id=eq.${promoterId}`,
      {
        method: "DELETE",
        serviceRole: true,
      },
    );
    const userCleanup = authUserId
      ? await request(`/auth/v1/admin/users/${authUserId}`, {
          method: "DELETE",
          serviceRole: true,
        })
      : null;
    summary.cleanupSucceeded =
      mappingCleanup.status === 204 &&
      promoterCleanup.status === 204 &&
      (!userCleanup ||
        userCleanup.status === 200 ||
        userCleanup.status === 204);
  }

  if (
    !summary.missingApiKeyRejected ||
    summary.anonymousPendingRows !== 0 ||
    !summary.anonymousInsertRejected ||
    summary.authenticatedOwnRows !== 1 ||
    summary.authenticatedMappingRows !== 1 ||
    !summary.authenticatedUpdateRejected ||
    summary.anonymousActiveRows !== 1 ||
    !summary.loginSucceeded ||
    !summary.refreshSucceeded ||
    !summary.logoutSucceeded ||
    !summary.cleanupSucceeded
  ) {
    throw new Error("One or more Bestie target assertions failed.");
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Bestie target verification failed.",
  );
  process.exitCode = 1;
});

async function insertWithServiceRole(
  table: string,
  body: Record<string, string>,
) {
  const response = await request(`/rest/v1/${table}`, {
    method: "POST",
    serviceRole: true,
    body,
  });
  assertStatus(response, 201, `insert synthetic ${table} row`);
}

async function request(
  path: string,
  options: {
    method?: string;
    body?: Record<string, string | boolean>;
    accessToken?: string;
    serviceRole?: boolean;
    omitApiKey?: boolean;
  } = {},
) {
  const apiKey = options.serviceRole ? serviceRoleKey : publishableKey;
  const authorization = options.serviceRole
    ? serviceRoleKey
    : options.accessToken || publishableKey;
  return fetch(new URL(path, baseUrl), {
    method: options.method || "GET",
    headers: {
      ...(options.omitApiKey
        ? {}
        : { apikey: apiKey, Authorization: `Bearer ${authorization}` }),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    redirect: "error",
  });
}

function assertStatus(response: Response, expected: number, operation: string) {
  if (response.status !== expected)
    throw new Error(`${operation} returned HTTP ${response.status}.`);
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}
