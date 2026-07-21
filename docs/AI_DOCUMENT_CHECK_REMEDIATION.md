# CAMO-Help AI Document Check Infrastructure Remediation

## Status

This phase prepares the repository for a later, manual and optional document pre-check. It does not create `POST /api/document-check`, call an AI service, add a provider SDK or API key, or add an AI user interface. The existing submission route remains independent of all document-check code.

Infrastructure readiness after this phase: **not yet approved for live AI traffic**. The code boundary, validation, request policy, cancellation model, fixed messages, and test provider are ready. A durable production rate-limit/usage backend and a provider privacy/contract decision remain blocking work.

## Completed remediation

- Updated Next.js and `eslint-config-next` from 14.2.35 to 15.5.21, kept React 18, and pinned the transitive PostCSS implementation to 8.5.10. The Next 15 cookie and dynamic-route parameter APIs were migrated without changing admin authorization behavior. See the [Next.js 15 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-15).
- Added authoritative server validation for normal uploads and a separate future document-check policy.
- Added signature, MIME, extension, byte-size, empty-file, malformed-image, and PDF structure checks.
- Added in-memory PDF inspection for encryption and page count. No PDF text is extracted and no page is written to disk.
- Replaced the unversioned browser draft with a versioned 24-hour draft envelope, removed filename persistence, excluded higher-risk signing and SSN fields, and clear the draft after successful submission.
- Removed filenames, per-document labels, raw response previews, and provider error text from submission diagnostic details and logs. Attachment logging remains aggregate-only.
- Added a document-check provider interface, strict result schema, deterministic no-network mock, timeout handling, cancellation/late-response protection, and duplicate-request protection.
- Added a durable rate-limiter interface, keyed identifier hashing, and a deterministic memory-backed test double. The memory implementation is explicitly test-only.
- Added synthetic tests. No real medical record, identity document, fighter data, provider data, or lab result is used.

## Supported file policies

### Normal CAMO submission

Normal application submission retains its existing **4 MiB per-file** limit. There is no combined attachment-size limit in application code. Selected-upload filtering occurs before server byte parsing and validation, so a previously selected but later deselected file is not processed or sent.

The server accepts and verifies the formats needed by current flows:

- JPEG (`.jpg`, `.jpeg`)
- PNG (`.png`)
- PDF (`.pdf`)
- HEIC (`.heic`)
- HEIF (`.heif`)
- WebP (`.webp`)
- GIF (`.gif`)

The normal submission validator does not impose the future AI page-count rule. A readable three-page or longer PDF can still be submitted normally. Encrypted PDFs are also not newly blocked from normal email submission, preserving existing behavior, although they are ineligible for the future check.

### Future AI document check, Version 1

One selected bloodwork or physical-examination file per request:

- JPEG
- PNG
- Readable, unencrypted PDF containing one or two pages

HEIC and HEIF are not Version 1 AI-check formats. They remain normal submission formats. A later UI may offer the check only after reliable client conversion to JPEG, but an unsupported check must never detach or reject the normal upload.

Both pages of a two-page PDF must be supplied to and inspected by the selected provider. PDFs over two pages, encrypted PDFs, parsing failures, unsupported formats, and files over the separate check limit map to the fixed **check unavailable** state, not a submission failure.

## Future request-size policy

Vercel documents an approximately 4.5 MB Function request-body limit. Multipart overhead means a 4 MiB file is not safe inside a 4.5 MB request. The prepared policy therefore uses:

- Maximum file bytes: **3 MiB (3,145,728 bytes)**
- Maximum declared multipart request length: **3.5 MiB (3,670,016 bytes)**
- Exactly one document file per request

This leaves about 1 MiB below the platform body limit and 0.5 MiB between the file and application request ceilings for multipart headers and fixed metadata. The future route should call `assertDocumentCheckRequestHeaders(request.headers)` before `request.formData()`, then immediately call `validateUploadedDocument(..., "document-check")` before PDF conversion or provider work. A missing `Content-Length` cannot be trusted as proof of a small request, so byte validation remains mandatory after parsing.

The future endpoint must be a Node.js App Router route with dynamic execution and explicit response headers:

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Pragma: "no-cache",
  Expires: "0"
};
```

It must not use `unstable_cache`, React `cache`, cached fetches, CDN cache directives, a service worker, filesystem writes, or persistence of request/result data.

## PDF processing recommendation

Prefer direct PDF input only if the selected provider contract and API explicitly support private, non-retained PDF processing and can inspect every supplied page. Otherwise render page 1 and, when present, page 2 entirely in memory within the Node.js function, bound rendered dimensions and decoded pixel count, and send only those pages. Never write pages to `/tmp`, extract medical text into logs, or silently inspect only the first page.

The current parser checks structural readability, encryption markers/provider parser state, and page count using `pdf-lib`. A live implementation should add provider-specific rendering tests and explicit decompression/pixel limits before enabling in-memory conversion.

## Browser draft behavior

Typed draft recovery uses `camo-help-application-v2` with schema version 2 plus `createdAt` and `updatedAt` timestamps. A draft expires 24 hours after its last update. Expired, malformed, future-dated, legacy-schema, and inaccessible-storage cases are ignored safely without logging draft contents. The legacy `camo-help-application-v1` entry is cleared.

The draft does not contain:

- File bytes or Base64 data
- Filenames or upload metadata
- AI check inputs or results
- Last four SSN digits
- Typed signature, signature date, or certification checkbox state

Successful submission calls `clearApplicationDraft`. Files remain only in current page memory and cannot be restored after reload; the user must select them again.

The application must not claim that no personal information is stored. Accurate wording is that typed draft fields are saved temporarily in that browser for up to 24 hours, while uploaded files and the excluded sensitive fields above are not saved in browser draft storage.

## Logging and error restrictions

Allowed operational telemetry is limited to route outcome, generic reason code, request duration, attachment count, and aggregate bytes where needed. Do not log or add to diagnostic payloads:

- Names, email addresses, birth dates, addresses, application answers, or certifications
- Filenames or a document/medical type tied to a person
- Provider names or credentials extracted from a document
- Medical test names or medical information
- File bytes, Base64, PDF/image content, or extracted text
- Provider response bodies, AI results, stack traces, or configuration values

Validation returns a fixed safe client message and logs only a reason code. Future operational failures always use: “AI check unavailable — We could not review this document automatically. You may continue with your submission.” Detailed provider errors must remain transient and must not be forwarded to the fighter, support email, analytics, or logs.

## Rate limiting and usage control

`DocumentCheckRateLimiter` defines an atomic acquire/release lease boundary for:

- Per-client throttling and burst limits
- One concurrent request per client
- Daily per-client quotas
- A global monthly usage/budget guardrail
- Fail-closed behavior when the limiter backend is unavailable

Raw IP addresses must not be persisted. `createRateLimitIdentifierHash` produces a keyed HMAC; production must use a dedicated server-only secret and apply a documented key-rotation/retention policy. The result is still an identifier and should have the shortest feasible retention.

The included memory limiter is a deterministic **test double only**. It is not reliable across Vercel instances or deployments. Before creating a public route, choose and configure an atomic durable backend such as a managed Redis/ratelimit service or a narrowly scoped Supabase table plus transactional RPC. A plain select-then-insert sequence is not sufficient for concurrency accounting. Service failure must return check unavailable and must never affect normal submission.

Suggested initial product limits should be finalized against cost and expected traffic: one concurrent check per client, a small short-window burst, a daily client quota, and a hard global monthly budget.

## Timeout, cancellation, and optional behavior

`runDocumentCheck` creates an `AbortController`, imposes a server timeout, validates the provider response at runtime, and converts timeouts, cancellation, malformed responses, and provider errors to unavailable outcomes. `DocumentCheckRequestCoordinator` permits one browser request at a time, blocks duplicate button presses, cancels on navigation when practical, and ignores a response that arrives after cancellation.

The implementation phase should use a manual **Run AI Check** button next to each eligible bloodwork/physical file. Navigation and submission remain enabled. The UI may cancel or ignore a pending request on navigation and may offer one manual retry, but must not automatically retry in a loop.

The normal submission route must never call the checker, wait for it, consume its result, or include a result in FormData, email, support notifications, certification, Supabase, browser storage, analytics, or logs.

## Provider boundary and fixed result wording

The provider accepts only an already validated in-memory document and an abort signal. The strict Zod result has `status`, an application-owned `reasonCode`, and `confidence`. It intentionally excludes free-form evidence to prevent extracted medical text from propagating through the application. Unknown keys and invalid status/reason combinations are rejected as malformed.

The application owns all display wording. It supports passed, further-review, unable-to-verify, and operationally unavailable states plus the required disclaimer. An unavailable outcome is never rendered as a pass.

No provider SDK or network implementation is present. `MockDocumentCheckProvider` returns deterministic synthetic results and performs no network requests.

## Remaining blockers before live integration

1. Select and deploy an atomic durable rate-limit and monthly budget backend; add fail-closed integration tests.
2. Select the provider and document its data flow, regions, subprocessors, security controls, retention defaults, training policy, abuse-monitoring retention, deletion behavior, and incident terms.
3. Obtain legal/privacy review on whether a BAA or a contractually enforced zero-data-retention arrangement is required for medical/identity data. Do not claim the provider stores nothing until both contract and technical settings confirm it.
4. Decide direct-PDF versus bounded in-memory rendering based on provider capability and test both pages. Add pixel/decompression-bomb limits if rendering is used.
5. Implement and security-review `app/api/document-check/route.ts` with no-store headers, dynamic execution, single-file parsing, durable rate limiting, timeouts, fixed errors, and no submission coupling.
6. Add the manual UI with cancellation on unmount/navigation, accessible status announcements, late-result suppression, and the mandatory disclaimer.
7. Add deployment tests for Vercel request rejection behavior and provider timeouts. Confirm environment variables are server-only and none use a `NEXT_PUBLIC_` prefix.

## Proposed future files

Existing preparation:

- `lib/files/documentPolicies.ts`
- `lib/files/serverDocumentValidation.ts`
- `lib/document-check/schema.ts`
- `lib/document-check/messages.ts`
- `lib/document-check/provider.ts`
- `lib/document-check/requestPolicy.ts`
- `lib/document-check/requestCoordinator.ts`
- `lib/document-check/rateLimit.ts`

Future implementation:

- `app/api/document-check/route.ts`
- `lib/document-check/providers/<selected-provider>.server.ts`
- `lib/document-check/rateLimit/<durable-backend>.server.ts`
- `components/document-check/DocumentCheck.tsx`

## Privacy claims that must not be made yet

- “No personal information is stored.” Typed draft fields persist locally for up to 24 hours.
- “The AI provider stores nothing” or “zero retention,” until confirmed contractually and technically.
- “HIPAA compliant,” “covered by a BAA,” or equivalent legal/security claims without formal confirmation.
- “AI approved,” “AI rejected,” or any statement implying the check controls CAMO acceptance or submission.
- “Every PDF is supported.” Version 1 is limited to readable, unencrypted one- or two-page PDFs under the separate size limit.

## Validation scope

Synthetic tests cover JPEG/PNG/PDF signatures; one-, two-, and three-page policies; encryption markers; corrupt/empty/mismatched files; separate size ceilings; draft restoration/expiry/clearing; exclusion of bytes, filenames and AI results; strict provider results; timeout/unavailability/malformed behavior; no-network mock behavior; duplicate/cancel/late response behavior; rate-limit boundaries; and normal submission isolation after every AI outcome.

The final validation record is reported with the remediation commit. No live AI request is part of validation.
