# CAMO-Help Promoter Authentication Foundation

## Baseline

- Repository: `jbur6523/camo-help`
- Local working branch: `feature/promoter-auth`
- Baseline branch: `origin/feature/ai-document-check`
- Baseline commit: `2a22cf76dd2ca1f07d31042e04a3d535757b24cb`
- Baseline reason: `origin/main` did not contain either AI provider-handling commit `e465abbb417492fc4d694150302ebbebffd290e5` or the later smartphone JPEG fix at `2a22cf7`.

## Account model

Promoters create their own password during registration. Supabase Auth stores, hashes, and manages the password. CAMO-Help does not store passwords, password hashes, reset tokens, temporary passwords, or session tokens in application tables.

The password and confirmation value exist only transiently in the registration form and request. CAMO-Help validates that they match, sends only the selected password to the server-side Supabase Auth Admin API, and never includes either value in promoter records, logs, notifications, browser storage, cookies, or analytics.

Admins cannot view, set, reset, or send promoter passwords. Approval unlocks access without an invitation, activation link, temporary password, or second password-creation step.

The account relationship is:

```text
auth.users (Supabase-managed)
  1:1
public.promoter_accounts (private mapping, RLS enabled)
  1:1
public.promoters (approval and active status authority)
```

`promoter_accounts.auth_user_id` and the mapping table are never returned by the public promoter-directory route.

## Registration and recovery behavior

1. The existing registration information, government ID upload, password, and password confirmation are validated.
2. The server calls `auth.admin.createUser` with the promoter-selected password and `email_confirm: true`.
3. If an Auth user already exists, the same credentials are verified through `signInWithPassword`. This recovers an earlier attempt without creating another Auth user and does not establish a browser session.
4. The versioned database RPC transaction creates or identifies the normalized-email promoter record and creates exactly one account mapping.
5. A newly created promoter remains `pending`; a confirmed account mapping does not bypass approval.
6. Existing notification behavior runs without receiving password fields.

Auth creation and database linking cannot share one transaction. If Auth succeeds and the database operation fails, the unlinked user has no dashboard access. A retry with the same credentials reuses that Auth user. The promoter row and mapping are completed together in one PostgreSQL RPC transaction, avoiding a row-only or mapping-only partial result.

All public account-conflict and provider errors remain generic. Operational logs contain only controlled reason codes and never include an email, password, access token, Auth user ID, registration contents, or raw Supabase error.

## Approval gating

Every dashboard request performs all four checks server-side:

1. `supabase.auth.getUser()` validates the current cookie-backed Auth session.
2. The Auth user must have one account mapping.
3. The account mapping must be confirmed.
4. The linked promoter's current status must be `active`.

`pending` produces the pending-approval message. `denied`, `disabled`, an unconfirmed legacy link, or an unlinked Auth user produces the generic unavailable message. Status is read on every protected request, so denial or deactivation blocks an already authenticated session on its next dashboard request.

The existing admin cookie/password authentication remains unchanged and separate from Supabase promoter authentication.

Approval still changes the existing promoter status from `pending` to `active`. A confirmed linked account therefore gains access immediately. The approval email says the promoter can use the email and password selected during registration. Email-delivery failure is reported as a warning but does not roll back approval.

## Existing promoter records

Existing records cannot be safely claimed using email alone because public knowledge of an email is not proof of ownership.

When registration finds an existing promoter email without an account mapping:

- no duplicate promoter record is created;
- the existing promoter status and public information remain unchanged;
- a mapping is created as `pending_admin_confirmation`;
- dashboard access remains blocked;
- the existing registration notification supplies the newly submitted government ID to the established admin review channel;
- the admin dashboard exposes a narrow **Confirm Account Link** action.

That action only confirms the one-to-one mapping. It cannot view, create, set, reset, or send a password. After link confirmation, an existing `active` promoter has immediate dashboard access. A pending, denied, or disabled promoter remains gated by their existing status.

Before applying the unique normalized-email index, inspect existing data:

```sql
select lower(trim(email)) as normalized_email, count(*)
from public.promoters
group by lower(trim(email))
having count(*) > 1;
```

Resolve any result through an authorized data-review process before migration. Do not guess which record is authoritative.

## Sessions and forgot password

`@supabase/ssr` stores promoter sessions in cookies and uses PKCE for recovery. Middleware refreshes sessions for `/promoters/*` and `/auth/*`. Authenticated pages are dynamic and not cached.

Forgot password always returns:

> If an account is associated with that email, password-reset instructions will be sent.

Supabase sends and validates recovery tokens. CAMO-Help stores no reset token. The cookie-aware browser client initiates PKCE recovery and constructs a same-origin fixed callback URL; the callback accepts only `/promoters/reset-password` as its destination. Password reset updates only the Supabase Auth credential. It never modifies a promoter mapping or approval status.

## Routes

| Route | Purpose |
| --- | --- |
| `/promoters` | Promoter Login / Registration choice |
| `/promoter-registration` | Existing registration form plus password setup |
| `/promoters/login` | Email/password login |
| `/promoters/forgot-password` | Generic recovery request |
| `/auth/callback` | Fixed-destination Supabase PKCE code exchange |
| `/promoters/reset-password` | Authenticated recovery password update |
| `/promoters/dashboard` | Server-authorized promoter dashboard |
| `/auth/logout` | Fixed-destination promoter logout |
| `/api/admin/promoters/[id]/account-link` | Existing admin-auth-protected legacy link confirmation |

## Dashboard scope

The dashboard displays the promotion name, promoter name, promoter email, approval status, logout control, and these placeholders:

- **Fighter CAMO Submissions** — Coming soon
- **Generate Bout Agreement** — Coming soon

No submission records, event system, payment, agreement generation, signing, or storage is implemented.

## Database migration and RLS

Migration: `supabase/migrations/202607220001_promoter_auth_foundation.sql`

The migration:

- creates a unique normalized promoter-email index;
- creates `promoter_accounts` with unique `promoter_id` and unique `auth_user_id`;
- constrains mapping state to `confirmed` or `pending_admin_confirmation`;
- enables RLS;
- permits authenticated users to read only the mapping whose `auth_user_id` equals `auth.uid()`;
- permits an authenticated promoter to read only their linked promoter record in addition to the existing active public-directory policy;
- grants no public insert or update access to mappings;
- revokes the transactional registration RPC from `public`, `anon`, and `authenticated`;
- grants the RPC only to `service_role`.

Service-role clients remain server-only. The public directory continues selecting only `id` and `promotion_name` for `active` promoters.

Do not execute the migration against Preview or Production until the checklist below is complete.

## Environment variables

Existing variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `RESEND_API_KEY` (server only)
- `EMAIL_FROM`
- `SUPPORT_EMAIL_TO`
- existing admin variables remain unchanged

No environment variable was added. Password recovery uses the page's current origin plus a fixed callback path, so it does not accept a browser-provided destination or require another base-URL setting. No secret is added to a `NEXT_PUBLIC_` variable.

## Required Supabase dashboard settings

Before Preview testing:

1. Enable the email/password provider.
2. Configure the project Site URL for the environment.
3. Add exact Redirect URLs for:
   - `http://localhost:3000/auth/callback`
   - `https://<preview-origin>/auth/callback`
   - `https://camo-help.com/auth/callback`
4. Configure production-grade custom SMTP for Supabase password-recovery email and verify the recovery template.
5. Apply the SQL migration only after the normalized-email duplicate preflight returns no rows.

Email confirmation does **not** need to be disabled for this promoter flow. Registration deliberately uses the server-only Admin `createUser` API with `email_confirm: true`, which creates the account as confirmed without sending a confirmation or activation email. The public `signUp` flow is not used. The hosted-project email-confirmation setting may remain enabled for other application flows.

Preview acceptance must still verify that registration sends no Supabase confirmation email. If a confirmation email appears, stop testing and inspect the deployed code/project selection; do not add an invitation workaround.

## Preview checklist

- Use an isolated Preview Supabase project and synthetic records only.
- Apply the migration after running the duplicate-email preflight.
- Confirm no `auth_user_id` appears in `/api/promoters`.
- Register a new synthetic promoter and confirm one Auth user, one pending promoter, and one confirmed mapping.
- Retry the same synthetic registration and confirm there are no duplicates.
- Confirm the promoter can authenticate but sees the pending message.
- Approve through the existing admin dashboard and confirm immediate dashboard access.
- Disable the promoter while a session exists and confirm the next dashboard request is blocked.
- Register with a synthetic email matching a seeded legacy active promoter; confirm access stays blocked until **Confirm Account Link** is used.
- Verify forgot-password known/unknown responses are identical.
- Verify recovery returns only to the allowlisted reset page and does not change promoter status.
- Confirm registration sends no confirmation, activation, invitation, or password email.
- Confirm approval email contains no credential.
- Confirm fighter submission, documents-only, AI checking, JPEG validation, upload, PDF, and existing admin flows remain unchanged.

## Production checklist

- Repeat the normalized-email duplicate preflight against Production under an approved change window.
- Back up the affected schema before migration.
- Confirm the Production Site URL and exact Redirect URL.
- Confirm custom SMTP and Supabase recovery rate limits.
- Apply the migration before deploying code that queries `promoter_accounts`.
- Smoke-test with synthetic Production-safe accounts only.
- Monitor controlled reason codes and email-delivery warnings; never add registration payloads or credentials to logs.

## Rollback

1. Revert the application deployment first so no code depends on `promoter_accounts`.
2. Leave the additive table/function in place when possible; an unused private mapping table is safer than destructive rollback.
3. If schema removal is explicitly approved, back up mappings, then drop the registration RPC, the two new RLS policies, `promoter_accounts`, and the normalized-email index in that order.
4. Do not delete Supabase Auth users automatically. Review any unlinked synthetic/test users separately.
5. Restore the prior approval email copy only with the application rollback.

Rollback does not modify the existing `promoters` statuses or the independent admin authentication system.

## Future work

- Fighter CAMO submission records
- Event creation
- Venmo activation
- Bout-agreement generation
- Electronic signatures
- Agreement storage
- Paid event access
