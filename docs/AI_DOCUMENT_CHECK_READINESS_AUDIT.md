# CAMO-Help AI Document Check Readiness Audit

Audit date: July 21, 2026
Scope: Local repository and its documented Vercel deployment assumptions
Change policy: Audit only; no application behavior was modified

## Executive Summary

**Overall rating: Requires infrastructure work**

CAMO-Help has a good architectural seam for a small advisory document check. It is a Next.js App Router application with Node.js route handlers, browser-memory `File` state, `FormData` uploads, server-only secrets, fixed email routing, and no fighter-document writes to Supabase Storage, Vercel Blob, or the file system. A future check can be isolated in a new `POST /api/document-check` route and an ephemeral client component without changing the established submission route.

It is not ready to expose that endpoint safely today. The blockers are:

1. The existing fighter upload path has no server-side size, MIME, extension, magic-byte, image-dimension, PDF-page-count, or malformed-content validation. The current 4 MB check is browser-only.
2. Vercel Functions have a 4.5 MB total request-body limit. A 4 MB file plus multipart overhead, application JSON, generated PDFs, or other files can exceed it. The future check must send one bounded derivative or page per request, well below that ceiling. The current submission route has the same aggregate-payload risk.
3. There is no rate limiting, request-origin control, bot protection, request timeout, or usage budget for a public compute-bearing endpoint.
4. No AI provider has been selected or contractually configured for no training and acceptable zero/limited retention. CAMO-Help cannot guarantee end-to-end no retention from repository code alone.
5. `npm audit --omit=dev` reports a direct high-severity vulnerability group against installed Next.js 14.2.35 and a transitive moderate PostCSS finding. Several aggregated advisories concern unused features, but at least the App Router/React Server Component findings are relevant enough to require a controlled patched-framework upgrade and retest before public AI processing.
6. The application persistently stores the full typed fighter form in `localStorage`, including identity, contact, legal, medical-history, last-four-SSN, and uploaded filenames. Binary files are not stored there, but the current privacy notice says no personal data is stored. That statement and the persistence policy need remediation or precise disclosure before adding another privacy-sensitive feature. The AI result must never enter the persisted form object.

After those items are addressed, the future feature is a **Medium** implementation. The UI and submission workflow do not need to be rebuilt.

## Audit Boundaries and Assumptions

This audit can verify repository behavior. It cannot verify settings that live only in the Vercel, Supabase, Resend, DNS, firewall, log-drain, or future AI-provider dashboards. Before launch, an operator must separately verify:

- the Vercel plan, Fluid Compute status, function duration, memory, WAF/rate-limit rules, runtime-log retention, log drains, and preview-deployment protection;
- actual environment-variable scope and access controls;
- Supabase production policies and audit configuration against the checked-in SQL;
- Resend and recipient-mailbox retention for the existing submission workflow;
- the AI provider's data-use, training, abuse-monitoring, retention, region, subprocessors, deletion, and contractual terms.

No actual user document, credential value, environment value, or private record was opened or printed during this audit.

## Current Architecture Review

### Framework and routing

- `package.json` declares Next.js `^14.2.30`; the lockfile currently installs **Next.js 14.2.35**.
- React 18.3.1 and TypeScript are used with strict type checking.
- The application uses the **App Router** exclusively. No `pages/` directory exists.
- The main `/` page is a Server Component that renders the client-side `ApplicationWizard`.
- API endpoints are App Router Route Handlers under `app/api/**/route.ts`.
- Relevant routes use the Node.js runtime. There is no Edge-runtime upload path.
- The production build reports `/` and `/promoter-registration` as static pages; `/admin/promoters` and all mutating APIs are dynamic. `/api/config-status` is statically rendered.
- `next.config.mjs` only enables React strict mode. There are no rewrites, custom headers, image remotes, cache overrides, or experimental settings.
- No middleware, service worker, PWA manifest, or custom Vercel configuration exists.

### Current API and server routes

| Route | Method | Purpose | Protection |
|---|---:|---|---|
| `/api/submit-application` | POST | Parses fighter submission, regenerates PDFs, builds certification, and sends emails | Public; client-generated submission ID provides only instance-local duplicate suppression |
| `/api/support-error` | POST | Emails client error details to support | Public; no rate limit or authentication |
| `/api/promoter-registration` | POST | Parses promoter details and government ID, stores promoter metadata, emails ID to support | Public; Zod validates text fields, file validation is only declared type/extension |
| `/api/promoters` | GET | Returns active promoter IDs and names | Public |
| `/api/config-status` | GET | Returns configuration booleans | Public; statically rendered in the current build |
| `/api/admin/login` | POST | Validates admin password and sets signed cookie | Public login; timing-safe comparison, no rate limit |
| `/api/admin/promoters` | GET | Lists promoter records | Signed HttpOnly cookie or admin bearer/header token |
| `/api/admin/promoters/[id]` | PATCH | Changes promoter status and sends notifications | Signed HttpOnly cookie or admin bearer/header token |

### Client upload components

- `components/StepUploads.tsx` renders upload inputs for `bloodwork`, `physical`, `headshot`, `photoId`, `cardio`, and `additional`.
- Medical/document inputs advertise `.pdf,.jpg,.jpeg,.png,.heic,.heif`.
- Identity inputs advertise `image/*` and request the environment-facing camera on mobile.
- Bloodwork, physical, cardio, and additional documents allow multiple files as configured by the component; headshot and photo ID replace the prior file.
- `components/ApplicationWizard.tsx` owns `uploadFiles` as React state and performs client-side preparation, validation, submission, generated-PDF state, and object-URL cleanup.
- `components/StepReview.tsx` displays selected filenames from `uploadFiles`, with a fallback to filename strings persisted in the form data.

### File-processing flow

1. The browser returns `File` objects from an `<input type="file">`.
2. `ApplicationWizard.handleFilesAdd` passes them to `prepareUploadFiles`.
3. Image files are decoded through an `HTMLImageElement`, drawn to a canvas, and encoded as JPEG when compression is configured and useful.
4. Identity images use maximum dimensions of 1200 or 1600 pixels. Medical/document images use 1800 pixels, quality 0.78, and skip compression at or below 650 KB.
5. If browser decoding or compression fails, the original file is retained.
6. A browser-only 4 MB per-file limit is applied after preparation.
7. Prepared `File` objects are stored in React state. Only their joined filenames are copied into `ApplicationData.uploads`.
8. Selected files are appended to `FormData` at submission. They are not converted to Base64.
9. `/api/submit-application` calls `request.formData()`, reads each `File` into an `ArrayBuffer`, and wraps the bytes in a Node `Buffer`.
10. Selected-upload filtering is repeated on the server before required-upload validation and email routing.
11. The attachment buffers are passed to the Resend email client. They are not written to CAMO-Help disk or Supabase.

### PDF-generation flow

- The browser fetches static templates from `public/templates`, fills them with `pdf-lib`, stores generated PDFs as `Blob` objects, and exposes temporary object URLs for download.
- On final submission, those browser-generated PDFs are attached to `FormData` as evidence that the expected generation step occurred.
- The server reads the submitted PDFs into memory but does not use their contents. It independently rereads the bundled templates and regenerates official PDFs from the submitted application JSON.
- The server creates a signature certificate PDF when an application document is selected. That certificate includes name/signature, email, phone, submission reference, time, IP address, approximate IP location, selected document names, and certification language.
- The generated official PDFs, certificate, and selected uploads are held in memory and sent as email attachments.
- `scripts/inspect-pdf-fields.ts` verifies that mapped form fields exist in the current templates.

The browser-to-server copies of generated application PDFs are currently redundant and consume request and memory budget. Removing them would change established behavior and is outside this audit, but the duplication is relevant to Vercel payload risk.

### Submission and email flow

- Full applications and documents-only submissions share `ApplicationWizard`.
- Documents-only submissions skip browser PDF generation and can submit selected uploads directly.
- `filterSelectedUploads` removes stale requirement-driven files before submission and again before email construction.
- `assertRequiredUploadsPresent` checks the required selected upload groups on the server.
- `sendApplicationEmails` sends application PDFs, certificate, headshot, and photo ID through the application route, and medical documents through the medical route.
- Resend receives attachment buffers. Recipient mail systems and Resend may retain them independently of CAMO-Help.
- Fighter confirmation and promoter notifications do not attach the fighter's uploaded documents.
- Fighter support notifications include fighter name, email, date of birth, selected promoter, workflow type, selected document categories, and delivery status, but not the fighter-document bytes.
- Error support notifications may include fighter name/email. Client-side non-JSON failure reports may also include filenames, document-category labels, individual sizes, total bytes, and a response preview.

### Supabase usage

- Supabase is used for promoter records only.
- The service-role client is protected by `import "server-only"` and disables session persistence and token refresh.
- Fighter application data and fighter upload bytes are not inserted into Supabase.
- No Supabase Storage API is referenced.
- The promoter-registration route stores promoter/contact metadata and the government-ID **filename** in the `phone` database column; it does not store the ID bytes in Supabase.
- Promoter government-ID bytes are attached to an internal support email, which creates external email retention even though Supabase does not store the bytes.
- A browser Supabase client factory exists but has no callers in the current repository.

### Authentication and admin protection

Suitable existing controls:

- Admin server modules use `server-only`.
- Password and token comparisons use `timingSafeEqual`.
- Admin sessions are HMAC-signed, expire after 12 hours, and use `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Admin data routes verify the cookie or a server-configured bearer/header token.
- The Supabase service-role key is never referenced by a Client Component.

Gaps:

- Admin login has no rate limit, lockout, challenge, or audit trail.
- There is no explicit Origin/CSRF token validation. `SameSite=Lax` and JSON requests reduce browser CSRF exposure, but explicit checks would be stronger.
- Some admin/promoter routes return raw upstream error messages to clients.

The future public fighter document check should not reuse admin authentication. It needs public-endpoint abuse controls instead.

### Environment variables

- `.env.example` contains names only; no values were found.
- `.env`, `.env.local`, and `.env*.local` are ignored.
- Server secrets currently include `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, and `ADMIN_TOKEN`.
- Only the Supabase URL and anonymous key use the `NEXT_PUBLIC_` prefix. The anonymous key is intentionally browser-visible and must be constrained by Row Level Security.
- A future provider key can remain entirely server-side as a new variable such as `DOCUMENT_CHECK_API_KEY`, referenced only from a `server-only` provider module and never from `NEXT_PUBLIC_*` code.
- Vercel environment variables are encrypted at rest but visible to authorized project users. They must be scoped separately for development, preview, and production and require redeployment after changes. See [Vercel environment-variable documentation](https://vercel.com/docs/environment-variables).

### Vercel deployment assumptions

- README deployment instructions assume GitHub-to-Vercel deployment and dashboard-managed environment variables.
- PDF templates are served from `public/templates` and packaged/read by the submission function.
- No `vercel.json`, function duration, region, memory, firewall, or deployment-protection configuration is checked in.
- Vercel currently documents a **4.5 MB maximum request or response body** for a Function. See [Vercel Functions limits](https://vercel.com/docs/functions/limitations).
- Function duration and memory depend on plan and Fluid Compute configuration, which cannot be verified from the repository.
- Runtime logs retain application `console` output and request metadata for a plan-dependent period. See [Vercel Runtime Logs](https://vercel.com/docs/logs/runtime).

## Exact Future Integration Point

Use a separate manual check on the existing Uploads step:

- **Page/route:** `/`, rendered by `app/page.tsx`
- **Wizard owner:** `components/ApplicationWizard.tsx`
- **Exact UI location:** each eligible file row inside `components/StepUploads.tsx`
- **Interaction:** a per-file **Run AI Check** button after upload; do not run automatically
- **Server endpoint:** `POST app/api/document-check/route.ts`
- **Eligible v1 documents:** bloodwork and physical documents; consider cardio only after requirements are defined. Identity documents should not be sent to the provider merely because they share the upload component.

The check should not be added to `/api/submit-application`. That route generates certificates, sends application/medical/support/promoter emails, and has retry/idempotency behavior unrelated to advisory review. A separate endpoint prevents accidental inclusion of AI data in emails, certification, logs, or the normal submission payload.

Keep result state outside `react-hook-form` and outside `ApplicationData`. A dedicated component can own ephemeral state, or `ApplicationWizard` can own a separate map keyed by a transient client file ID. Never use the filename as the key sent to logs or the provider.

Clear or invalidate a result when:

- the file is removed or replaced;
- its requirement is deselected;
- the user starts a new check;
- the component unmounts or the page reloads;
- the user leaves the Uploads step if the chosen product policy requires step-local results.

The result may be shown again on Review only if it remains ordinary in-memory React state and is explicitly excluded from form persistence and submission.

## Current Upload Flow by Type

| Upload type | Browser memory | Base64 | FormData | React state | Supabase/disk | Server logs | Support/error payload | Email attachment |
|---|---|---|---|---|---|---|---|---|
| Bloodwork | Yes; compressed image or original | No | Yes, if selected | `File[]` | No | Count/aggregate bytes only in attachment summary; operational IDs elsewhere | Category in fighter support; filename/size possible on certain client failure reports | Medical email |
| Physical | Yes; compressed image or original | No | Yes, if selected | `File[]` | No | Same as bloodwork | Same as bloodwork | Medical email |
| Headshot/selfie | Yes; compressed image or original | No | Yes, if selected | `File[]` | No | Same as above | Category/filename metadata possible; no bytes | Application email |
| Driver/state ID | Yes; compressed image or original | No | Yes, if selected | `File[]` | No | Same as above | Category/filename metadata possible; no bytes | Application email |
| Cardio/EKG | Yes; compressed image or original | No | Yes when present | `File[]` | No | Same as above | Category/filename metadata possible; no bytes | Medical email |
| Additional | Yes; compressed image or original | No | Yes when present | `File[]` | No | Same as above | Category/filename metadata possible; no bytes | Medical email only when a medical attachment exists |
| Browser-generated application PDFs | Yes as bytes, Blob, object URL, and FormData File | No | Yes | `pdfs` state | No | Generated/not-generated booleans and IDs | Generation/delivery status | Not used directly; server regenerates official copies |
| Promoter government ID | Yes as one original File | No | Yes | `File` state | Filename stored in Supabase; bytes not stored there | Upstream error strings can be logged | Bytes attached to promoter support email | Support email |

### Format support findings

- **JPEG/PNG:** Generally handled by browser decode/canvas compression. The server does not independently validate them.
- **HEIC/HEIF:** Advertised for document uploads, but browser image decoding is inconsistent. When decoding fails, the original is retained. No server transcoder exists, and future provider support cannot be assumed.
- **PDF:** Passed through unchanged. There is no client or server page-count, encryption, malformed-object, decompression, embedded-file, or content-signature validation for fighter uploads.
- **Multi-page PDF:** Accepted by the input and emailed intact. There is no page selector or rasterization path for selecting the minimum page needed by AI.
- **Multiple files:** Supported and compressed concurrently with `Promise.all`, which can spike browser memory on large photos.
- **Large smartphone photos:** Compression helps after full browser decode. Full-resolution pixels must still be decoded before resizing, so extremely large dimensions can cause memory pressure. If compression fails, the original is kept and only the browser-side 4 MB file check remains.

### Object URL lifecycle

- Generated application PDF URLs are revoked when replaced, when email changes, and on effect cleanup/unmount.
- Image-compression object URLs are revoked after successful compression or image-load failure.
- There is a small leak path if the image loads but canvas creation/encoding then fails before the explicit revoke. This is non-blocking for the audit but should be fixed when touching compression code.

### Memory duplication

Current duplication points include:

- original browser `File` plus decoded full-resolution image pixels plus canvas pixels plus compressed Blob/File during preparation;
- multiple images prepared concurrently;
- React File references plus multipart serialization during fetch;
- `request.formData()`'s parsed File plus `arrayBuffer()`/Node Buffer views on the server;
- uploaded browser-generated PDFs that are read but discarded before server regeneration;
- `pdf-lib` template bytes, parsed PDF objects, generated PDF bytes, signature certificate, and outgoing email attachments in the same invocation;
- potential Base64/JSON conversion inside a third-party email or future AI SDK, depending on that SDK's implementation.

The future check should accept exactly one file or one derived page per request, avoid Base64 unless the provider requires it, normalize the provider filename, and release references as soon as the response is constructed.

## Current Storage and Retention

### Fighter document bytes

Repository evidence shows no intentional CAMO-Help persistence of fighter upload bytes:

- no Supabase Storage use;
- no Vercel Blob dependency or use;
- no file-system writes;
- no database insert containing fighter bytes;
- no browser `localStorage`, `sessionStorage`, or IndexedDB storage of File/Blob contents;
- no analytics or error-monitoring SDK.

The bytes do exist temporarily in browser and server memory. On submission they are sent to Resend and recipient mailboxes, which is intentional external persistence in the current workflow. The future AI check must not enter this email path.

### Related data that is persisted or transmitted

- The entire typed fighter form is automatically written to `localStorage` under `camo-help-application-v1` on every change and removed only after confirmed submission.
- That object includes identity/contact details, address, DOB, last four SSN digits, medical/legal-history answers, promoter selection, certifications, and filename strings.
- Upload filename strings are persisted; binary files are not.
- A shared device or same-origin script can access this data until it is cleared.
- A successful submission removes the item, but abandonment does not expire it.
- Fighter uploads and generated PDFs are retained in email systems after submission.
- Fighter support notifications contain personal data and selected document categories, but no fighter-document bytes.
- Certain client failure notifications contain filenames and individual file-size metadata.
- Promoter metadata and the promoter government-ID filename are stored in Supabase; promoter government-ID bytes are emailed to support.
- Vercel runtime logs retain application console output and request metadata. The repo does not log document bytes or extracted text, but platform configuration and external log drains must be verified.

### Conflict with the planned no-storage/no-cache design

The planned AI result can meet application-level no persistence only if it is kept in separate ephemeral state and excluded from:

- `ApplicationData` and the `watch` subscription that writes to `localStorage`;
- `FormData` sent to `/api/submit-application`;
- generated PDFs and the signature certificate;
- all Resend payloads;
- support notifications and `/api/support-error`;
- console logs, analytics, traces, error-monitoring breadcrumbs, database rows, cache keys, and query parameters.

The existing privacy notice should be corrected because the application does store personal form data in browser local storage and intentionally transfers documents to email systems.

## Caching Audit

### Current project

- The root page is statically rendered, but the upload files themselves exist only inside the hydrated Client Component.
- Uploaded files are not passed through Server Components or React server caches.
- No React `cache()` usage exists.
- No service worker or PWA cache exists.
- No middleware sets cache behavior.
- No custom CDN headers exist in `next.config.mjs`.
- Static PDF templates in `public/` may be browser/CDN cached. They contain no user data.
- Next.js 14 `POST` Route Handlers execute dynamically and are not cached by the Route Handler/Data Cache path. See [Next.js 14 Route Handlers](https://nextjs.org/docs/14/app/building-your-application/routing/route-handlers).
- GET Route Handlers can be cached in Next.js 14. `/api/config-status` is currently static in the build output. This does not affect a future POST-only check.

### Required future endpoint behavior

Use defense-in-depth even though POST handlers are dynamic:

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
```

Every success and error response should include:

```text
Cache-Control: no-store, no-cache, must-revalidate, private
Pragma: no-cache
Expires: 0
```

The server-side provider request should explicitly use `cache: "no-store"` where native `fetch` is used. The browser request should also use `cache: "no-store"`. Next.js documents `dynamic = "force-dynamic"`, `revalidate = 0`, and `fetch(..., { cache: "no-store" })` as cache opt-outs; see [Next.js 14 caching](https://nextjs.org/docs/14/app/building-your-application/caching).

Do not put file names, result codes, user IDs, or document categories in the URL or query string. Vercel runtime logs include request paths and search parameters.

The current project configuration does not override these settings. Application-level headers cannot, however, guarantee that the future AI provider does not retain input or output, nor can they eliminate Vercel invocation metadata.

## Security and Privacy Findings

### Critical

No critical repository finding was identified.

### High

**H1 — No server-side validation suitable for AI uploads.**
The fighter submission server accepts any non-empty `File`; it does not enforce size or content type. The promoter route checks declared MIME or extension, not bytes. A new AI endpoint must reject before provider invocation based on a strict per-request byte limit, allowlisted extension, allowlisted declared MIME, magic bytes, decode/parse success, image dimensions/pixel count, PDF page count, encryption, and malformed input. Client `accept` attributes are not security controls.

**H2 — Vercel's total request limit conflicts with current upload assumptions.**
Vercel documents a 4.5 MB total Function request-body limit. The current 4 MB rule is per file and browser-only. Multipart overhead and multiple files can trigger a platform 413 before route code runs. For AI review, send one derived artifact per request and cap it materially below the platform limit, for example around 3 MB or lower after preprocessing. A limit cannot be enforced by `request.formData()` early enough to stop a platform rejection; client preprocessing and platform/WAF controls are also needed.

**H3 — No abuse or cost controls.**
All fighter-facing endpoints are public and lack application rate limiting. An AI endpoint would enable anonymous compute and provider spend, as well as image/PDF parser abuse. Require same-origin checks, rate limiting, a short-lived session/request nonce or equivalent, bot/challenge controls where appropriate, concurrency limits, per-IP/session budgets, and provider-side spending limits. Vercel WAF offers project controls, including rate limiting depending on plan; see [Vercel WAF usage](https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing).

**H4 — AI provider retention and data-use guarantees are unresolved.**
Medical and identity documents can contain highly sensitive information. Do not implement until the selected provider's no-training, abuse-monitoring, retention, deletion, region, subprocessors, and contractual terms are approved. If acceptable zero/limited-retention processing cannot be guaranteed, this feature is a no-go regardless of application code.

**H5 — Current framework dependency audit is not clean.**
`npm audit --omit=dev` reports one direct high-severity vulnerability group for Next.js 14.2.35 and one transitive moderate PostCSS finding. The audit aggregates several Next.js advisories, including denial-of-service, request smuggling/cache poisoning, RSC, image optimization, middleware, rewrite, and CSP-related issues. This repo does not use several affected features, but it does use the App Router and Server Components. Perform a controlled upgrade to a supported patched Next.js line, review breaking changes, and rerun all submission/admin tests before exposing a new public endpoint. No dependency was upgraded during this audit.

**H6 — Sensitive form data persists in localStorage without expiry and the privacy notice is inaccurate.**
The browser persists the full typed form, not merely harmless progress. This does not store binary documents, but it creates shared-device and same-origin-script exposure and conflicts with the statement that no personal data is stored. Before AI launch, define and disclose the persistence policy, minimize sensitive fields, add expiry/user clearing, or move to a less persistent approach. In all cases, the AI result must remain outside that object.

### Medium

**M1 — Malformed/decompression-bomb protections are absent.**
The browser fully decodes images before resizing; the server has no pixel or page bounds. Future processing must use a decoder configured with maximum pixels/dimensions, bounded PDF pages and objects, and fail-closed parsing. Do not pass malformed files to the model provider.

**M2 — HEIC/HEIF and multi-page PDF handling is undefined.**
The UI advertises HEIC/HEIF, but browser decoding and AI-provider support vary. There is no PDF rasterizer or page selector. Define v1 support explicitly. The safest small v1 is JPEG/PNG plus a bounded single relevant PDF page or user-provided screenshot. Unsupported review must never block normal submission.

**M3 — No timeouts or cancellation.**
No current upload API uses `AbortController`, route-level provider timeout, or `maxDuration`. The future endpoint needs a provider timeout comfortably below the Vercel function limit, client cancellation on unmount/navigation/retry, and a stable non-blocking timeout result.

**M4 — Existing support paths are unsafe for AI content.**
`/api/support-error` accepts arbitrary client error text, details, fighter name, and email and sends them to support. Current submission failure details can include filenames. Never pass AI input, extracted text, provider output, reason code, filename, document type, or AI error body into this route or the generic support notifier.

**M5 — Public support-error endpoint can be abused.**
It has no authentication or rate limiting and can generate support email. This is an existing issue and should be remediated independently; the AI component should not call it.

**M6 — No CI pipeline or AI-test harness.**
The repo has a useful Node test file but no checked-in CI, E2E runner, browser component-test setup, provider mock transport, or fixture directory. Minimum launch gates should be automated.

**M7 — Prompt injection must be treated as untrusted document content.**
Text inside a document may instruct a vision model to ignore rules or return a desired status. Use a narrowly scoped system instruction, no tools, no retrieval, no actions, strict reason-code schema, low output limits, and server-side schema validation. The application—not the model—must choose user-facing wording.

**M8 — Same-origin/CSRF-style cost abuse is not addressed.**
The check makes no account mutation, but a cross-origin form or bot can still trigger paid work. Validate Origin/Host where dependable, reject unexpected content types, and combine it with nonce/rate-limit controls rather than relying on CORS alone.

### Low

**L1 — Compression object URL can survive a post-load encoding failure.**
Use `try/finally` around the entire compression path when it is next modified.

**L2 — No application security-header policy is configured.**
A CSP and related headers are worthwhile defense-in-depth, especially because localStorage holds sensitive form data. They are not specific to AI review and should be introduced with compatibility testing.

**L3 — Instance-local duplicate tracking is not globally reliable.**
The submission route's in-memory `Map` is per warm function instance and can reset or diverge across instances. Do not copy this mechanism as an AI rate limiter or usage counter.

**L4 — Some existing API errors expose upstream messages.**
Promoter/admin routes sometimes return raw Supabase or operational messages. The future endpoint should always return fixed application error codes and wording.

### Informational

**I1 — Fighter file bytes are not written to CAMO-Help persistence.**
No fighter upload storage in Supabase, Vercel Blob, disk, IndexedDB, sessionStorage, or localStorage was found.

**I2 — No analytics or error-monitoring SDK exists.**
This reduces accidental capture today. Future analytics must not receive check events tied to a document or result.

**I3 — New attachment-summary logging is appropriately minimal.**
It logs only attachment count and aggregate bytes. Other operational logs include submission IDs, email kind, timestamps, and provider message IDs, but no document bytes.

**I4 — No likely committed credential value was found.**
Only blank examples and environment-variable references were found. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is browser-visible by design; the service-role and email/admin keys remain server-side.

**I5 — A future provider key can remain server-only.**
Use a non-public environment variable and a provider module guarded by `server-only`.

## Blocking Issues Before Implementation

Complete these before sending any document to an AI provider:

1. Select and approve a provider/data-processing configuration that meets retention and training requirements.
2. Upgrade Next.js to a supported patched release through a controlled compatibility branch and resolve the production `npm audit` findings or document verified non-applicability.
3. Define the v1 input contract: eligible upload keys, accepted formats, maximum bytes, maximum dimensions/pixels, PDF page policy, encrypted-PDF policy, and HEIC behavior.
4. Implement a reusable server-side validator that performs byte-level validation before provider invocation.
5. Keep each check request below Vercel's total payload limit; use one bounded derived artifact/page per request.
6. Add provider and client timeouts, abort handling, concurrency control, rate limiting, Origin/Host checks, and cost budgets.
7. Correct or qualify the privacy notice and define browser form-data retention. Ensure check results cannot enter persisted form state.
8. Add strict response schema/reason codes and fixed app-controlled messages.
9. Add automated route/provider/UI tests using synthetic fixtures and run them in CI.
10. Verify Vercel logs, log drains, WAF, deployment protection, and environment-variable scope in the production dashboard.

## Recommended Improvements That Are Not AI-Launch Blockers

- Remove the redundant browser-generated application PDF bodies from final submission after a separately reviewed workflow change; retain only an explicit generation acknowledgement if legally/product-required.
- Add explicit server validation to the existing fighter and promoter upload routes.
- Replace or constrain long-lived fighter `localStorage` persistence and provide a visible Clear Saved Data control.
- Remove filenames and response previews from generic support notifications where possible.
- Rate-limit admin login, promoter registration, support-error, and submission endpoints.
- Add a consistent safe API error envelope.
- Add CSP and other security headers.
- Add browser/E2E coverage for upload, documents-only, submission, and admin flows.
- Document Vercel plan/runtime settings in version-controlled operational documentation without committing values.

## Proposed Technical Architecture

Recommended future files, adapted to this repository:

```text
app/api/document-check/route.ts
components/document-check/DocumentCheck.tsx
lib/document-check/fileValidation.ts
lib/document-check/messages.ts
lib/document-check/provider.server.ts
lib/document-check/schema.ts
lib/document-check/types.ts
tests/document-check/file-validation.test.ts
tests/document-check/route.test.ts
tests/document-check/schema.test.ts
tests/fixtures/document-check/README.md
```

Keep provider-specific code behind `provider.server.ts` with `import "server-only"`. Do not import it from Client Components.

### Proposed request flow

1. User selects a bloodwork or physical file through the existing Uploads step.
2. The normal upload remains in `uploadFiles` exactly as today.
3. User explicitly selects **Run AI Check** for one file.
4. Client derives or selects one bounded image/page without modifying the original submission file.
5. Client sends one file and a fixed `checkType` enum in `FormData` to `/api/document-check` with `cache: "no-store"` and an abort signal.
6. Route checks method, Origin/Host/nonce, rate limit, request budget, check type, file count, byte size, extension, declared MIME, magic bytes, decode/parse validity, dimensions/pixels, page count, and format.
7. Route uses an application-created filename such as `document.jpg`; it does not log or forward the original filename unnecessarily.
8. Route invokes the provider with a hard timeout, no tools/actions, the minimum image/page, and a strict JSON response schema.
9. Zod validates the provider response and rejects extra/unknown values.
10. Route maps only an internal reason code to the response and sets no-store headers on every path.
11. Client maps the code through `lib/document-check/messages.ts` to fixed wording.
12. Result stays in ephemeral component state, is cleared on file lifecycle changes, and is never submitted, certified, emailed, logged, cached, persisted, or sent to support.

### Suggested strict result schema

Model output should be limited to a closed enum, for example:

```ts
type DocumentCheckReason =
  | "likely_acceptable"
  | "provider_credentials_review"
  | "hepatitis_b_antibody_review"
  | "unable_to_verify";
```

Transport/application errors such as `unsupported_type`, `file_too_large`, `timeout`, `rate_limited`, `provider_unavailable`, and `malformed_provider_response` should be separate from model results.

Only application-controlled wording should reach the user:

- `likely_acceptable` → “AI check passed — Documents likely to be accepted.”
- `provider_credentials_review` → “Document may need further review — Possible provider credential issue.”
- `hepatitis_b_antibody_review` → “Document may need further review — Possible Hepatitis B Surface Antibody test instead of Hepatitis B Surface Antigen.”
- `unable_to_verify` → “Document may need further review — Information could not be clearly verified.”

Every state must include a clear statement that the check is advisory, does not approve or reject, and does not replace CAMO/human review.

## Reliability and User Experience

### Reusable current patterns

- `isBusy` and disabled buttons provide loading feedback for submission/PDF work.
- `globalError` and `.notice` provide mobile-visible messages.
- The submission failure page uses clear recovery wording and a reference ID.
- upload rows already have per-file actions and filenames;
- the wizard has consistent Back/Next navigation and scroll-to-error behavior.

Do not reuse global submission `isBusy` for AI checks. A check must not disable wizard navigation or final submission.

### Recommended states

| State | Presentation | Submission impact |
|---|---|---|
| Checking document | Inline spinner/status next to that file; `aria-live="polite"`; Cancel available | None |
| Check passed | Green/positive advisory with “likely” wording and human-review disclaimer | None |
| Further review suggested | Amber non-blocking advisory with the fixed reason text | None |
| Unable to verify | Neutral/amber advisory and Retry option | None |
| Service temporarily unavailable | Inline error, Retry button, explicit “You can continue without this check” | None |
| Unsupported file type | Inline fixed format guidance; original file remains available for normal submission if currently supported there | None |
| File too large for AI check | Offer screenshot/crop guidance; do not apply a new submission rejection | None |

Implementation details:

- Use an independent state machine per file: `idle | checking | result | unavailable`.
- Abort the request when the file is replaced/removed, the check is retried, or the component unmounts.
- Ignore late responses by comparing a request token/file identity before setting state.
- Allow only one or a small bounded number of concurrent checks per browser session.
- Do not automatically retry provider calls; a retry should be explicit to prevent duplicate spend.
- Make all notices accessible with `role="status"` or `role="alert"` as appropriate.
- Never call `setGlobalError`, `setSubmissionFailure`, or submission support notification code for an AI-check failure.

## Testing Readiness

### Current infrastructure

- **Unit/integration tests:** One Node `test`/`tsx` suite with eight synthetic submission-flow tests.
- **End-to-end tests:** None.
- **Component/browser tests:** None.
- **Mock API/provider support:** No dedicated mock boundary, but a future `provider.server.ts` interface would make route tests straightforward.
- **Fixtures:** No upload fixture directory. Current tests create synthetic Buffers and Files in memory.
- **CI:** No checked-in GitHub Actions or other CI workflow.
- **Type checking:** Available through `npx tsc --noEmit`; no package script.
- **Lint:** `npm run lint`.
- **Build:** `npm run build`.
- **PDF check:** `npm run inspect:pdfs`.
- **Mobile layout check:** `npm run check:mobile-layout`.

### Minimum tests before launch

Use generated, synthetic, or fully de-identified fixtures only. Do not commit real medical or identity documents.

| Case | Minimum expected behavior |
|---|---|
| MD credentials | Strict result maps to likely acceptable when all other required evidence is visible |
| DO credentials | Strict result maps to likely acceptable when all other required evidence is visible |
| NP credentials | Fixed provider-credential review advisory |
| PA-C credentials | Fixed provider-credential review advisory |
| Hepatitis B Surface Antigen | Distinguishable from antibody; acceptable only under the approved rule set |
| Hepatitis B Surface Antibody | Fixed antibody-vs-antigen review advisory |
| Blurry image | Unable-to-verify advisory; no submission block |
| Cropped image | Unable-to-verify advisory; no submission block |
| Missing signature | Unable-to-verify or approved fixed review code; no invented field values |
| Missing credentials | Provider-credential review or unable-to-verify per approved rule set |
| Large image | Rejected locally/server-side before provider; normal submission unchanged |
| Unsupported type | Fixed unsupported response before provider; normal submission unchanged |
| Malformed image/PDF | Safe fixed 400 response; no provider call; no details logged |
| Excessive pixel/page count | Safe fixed rejection; no decode/provider resource exhaustion |
| API timeout | Abort provider call; service-unavailable UI; continue submission |
| Malformed AI response | Zod rejection; unable/service error; no raw response shown or logged |
| AI provider failure | Fixed service-unavailable state; no support email; retry is manual |
| Prompt injection text in document | No schema escape, no changed rules, no tools/actions, no content echo |
| Navigate away during review | Request aborted or late response ignored; no state update warning |
| File removed/replaced after result | Result immediately cleared and cannot attach to the new file |
| Requirement deselected | Check/result cleared; file follows existing selected-upload filtering |
| Cache behavior | All success/error responses have no-store headers; provider fetch is no-store |
| Privacy regression | No localStorage/sessionStorage/IndexedDB/email/support/log/database writes of file or result |
| Rate limiting | Bounded requests receive fixed 429 without provider invocation |

Add route integration tests with an injected fake provider and assertions on the exact provider payload. Add browser-level tests for cancel/navigation/file replacement. Add a CI workflow that runs typecheck, lint, unit/integration tests, PDF inspection, mobile check, and production build.

## Estimated Implementation Scope

**Medium**

The actual happy path is small: one new POST route, one client control, one provider adapter, and strict schemas/messages. The work becomes Medium because safe launch also requires:

- byte-level file validation and decompression/page bounds;
- HEIC and multi-page PDF policy or conversion;
- request sizing below Vercel's 4.5 MB ceiling;
- timeout, abort, rate-limit, same-origin, and cost controls;
- provider retention/privacy approval;
- strict model-output and prompt-injection controls;
- a patched Next.js baseline;
- synthetic fixture, route, and browser testing;
- precise isolation from localStorage, submission, email, certification, support, analytics, and logs.

No submission architecture rewrite is required.

## Go/No-Go Recommendation

**No-go for immediate AI-provider integration. Remediate the blocking items first.**

It is appropriate to begin a short remediation/design phase immediately. Once the provider retention terms, framework patch, input contract, byte-level validator, payload budget, abuse controls, timeout/cancellation behavior, and test harness are approved, implementation can proceed as an isolated feature without altering normal CAMO submission behavior.

## Validation Results

All existing project validations passed on July 21, 2026:

| Command | Result |
|---|---|
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed; no warnings or errors |
| `npm test` | Passed; 8/8 tests |
| `npm run build` | Passed; Next.js 14.2.35 production build generated all 13 routes |
| `npm run inspect:pdfs` | Passed; 46 mapped athlete fields and 11 mapped national-ID fields present |
| `npm run check:mobile-layout` | Passed |
| `npm audit --omit=dev` | Did not pass cleanly: 1 high direct Next.js group, 1 moderate transitive PostCSS finding, 0 critical |

No validation failure was introduced by this audit. The dependency-audit findings are pre-existing. No environment-dependent command failed.

## Manual Acceptance Checks

1. **Application still builds without functional modifications:** Confirmed by `npm run build`.
2. **Existing upload flows were not changed:** Confirmed; this audit adds documentation only.
3. **Existing submission flows were not changed:** Confirmed; no application source file changed.
4. **Existing email routing was not changed:** Confirmed; no email or route implementation changed.
5. **No secrets or sensitive documents were added:** Confirmed by file review and credential-pattern scan; the report contains names only, no values or records.
6. **Exact future integration point identified:** Confirmed: manual per-file button in `StepUploads` on `/`, coordinated without persisted form state, calling a separate `/api/document-check` POST route.
7. **Storage/caching conflicts clearly stated:** Confirmed: full typed form and filenames persist in localStorage; existing submission files persist in external email systems; AI input/result must be isolated and no-store; provider and Vercel operational retention require separate verification.

## Files Inspected

Directly read or reviewed with targeted repository searches:

```text
.env.example
.eslintrc.json
.gitignore
README.md
next.config.mjs
package.json
package-lock.json
tsconfig.json
app/layout.tsx
app/page.tsx
app/admin/promoters/page.tsx
app/api/admin/login/route.ts
app/api/admin/promoters/route.ts
app/api/admin/promoters/[id]/route.ts
app/api/config-status/route.ts
app/api/promoter-registration/route.ts
app/api/promoters/route.ts
app/api/submit-application/route.ts
app/api/support-error/route.ts
components/AdminLoginForm.tsx
components/AdminPromotersDashboard.tsx
components/ApplicationWizard.tsx
components/PromoterRegistrationForm.tsx
components/StepReview.tsx
components/StepUploads.tsx
components/WizardBottomNav.tsx
lib/admin/auth.ts
lib/email/sendApplicationEmails.ts
lib/email/supportNotifications.ts
lib/pdf/fillAcroForm.ts
lib/pdf/generateAthleteLicensePdf.ts
lib/pdf/generateNationalIdPdf.ts
lib/pdf/generateSignatureCertificatePdf.ts
lib/pdf/pdfFieldNameMap.ts
lib/promoters/registrationSchema.ts
lib/signatureAudit.ts
lib/submission/filterSelectedUploads.ts
lib/submission/outgoingFileValidation.ts
lib/submission/validateRequiredUploads.ts
lib/supabase/client.ts
lib/supabase/database.types.ts
lib/supabase/server.ts
lib/types.ts
scripts/check-mobile-layout.ts
scripts/inspect-pdf-fields.ts
supabase/promoters.sql
tests/submission-flow.test.ts
public/templates/Camo_Athlete_License_Final.pdf (field structure via the existing inspector)
public/templates/National ID form 0 Fillable.pdf (field structure via the existing inspector)
```

Repository-wide searches also covered `app/`, `components/`, `lib/`, `scripts/`, and `supabase/` for storage, Base64, browser persistence, cookies, analytics, monitoring, logging, caching, service workers, middleware, file-system access, upload parsing, environment variables, and secret-like assignments.

## Final Conclusion

CAMO-Help's existing App Router and browser-memory upload design can support an isolated advisory vision check without changing submission, email routing, PDF generation, promoter validation, certification, admin protection, or fighter confirmation. The clean seam is real, but safe handling is not yet present. Complete the blockers first, then implement the check as a separate, manual, one-file-at-a-time, no-store route and ephemeral UI state.
