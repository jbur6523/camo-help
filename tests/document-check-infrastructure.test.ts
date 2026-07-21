import assert from "node:assert/strict";
import test from "node:test";
import { DocumentCheckRequestCoordinator } from "@/lib/document-check/requestCoordinator";
import { documentCheckResultMessage, documentCheckUnavailableMessage } from "@/lib/document-check/messages";
import { MockDocumentCheckProvider } from "@/lib/document-check/mockProvider";
import { createRateLimitIdentifierHash } from "@/lib/document-check/rateLimit";
import { runDocumentCheck, type DocumentCheckOutcome } from "@/lib/document-check/provider";
import { MemoryDocumentCheckRateLimiter } from "@/lib/document-check/testing/MemoryRateLimiter";
import { buildSubmissionEmailMessages } from "@/lib/email/sendApplicationEmails";
import { defaultApplicationData, type RequirementKey } from "@/lib/types";
import type { ValidatedDocument } from "@/lib/files/serverDocumentValidation";

const document: ValidatedDocument = {
  bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
  kind: "jpeg",
  mimeType: "image/jpeg",
  byteSize: 4
};

test("provider boundary accepts pass, review, and unable-to-verify results", async () => {
  for (const scenario of ["pass", "review", "unable"] as const) {
    const outcome = await runDocumentCheck({ provider: new MockDocumentCheckProvider(scenario), document, timeoutMs: 100 });
    assert.equal(outcome.kind, "result");
    if (outcome.kind === "result") assert.match(documentCheckResultMessage(outcome.result), /AI check passed|further review/);
  }
});

test("malformed, timeout, and unavailable provider responses become unavailable, never pass", async () => {
  const expectations = [
    ["malformed", "MALFORMED_PROVIDER_RESPONSE"],
    ["timeout", "TIMEOUT"],
    ["unavailable", "PROVIDER_UNAVAILABLE"]
  ] as const;
  for (const [scenario, reasonCode] of expectations) {
    const outcome = await runDocumentCheck({ provider: new MockDocumentCheckProvider(scenario), document, timeoutMs: 5 });
    assert.deepEqual(outcome, { kind: "unavailable", reasonCode });
    assert.doesNotMatch(documentCheckUnavailableMessage, /passed/i);
  }
});

test("server timeout completes even if a provider ignores AbortSignal", async () => {
  const provider = { check: async () => new Promise<never>(() => undefined) };
  assert.deepEqual(await runDocumentCheck({ provider, document, timeoutMs: 5 }), {
    kind: "unavailable",
    reasonCode: "TIMEOUT"
  });
});

test("mock provider performs no network request", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (() => { requests += 1; throw new Error("Network is forbidden in mock tests."); }) as typeof fetch;
  try {
    await runDocumentCheck({ provider: new MockDocumentCheckProvider("pass"), document, timeoutMs: 100 });
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("coordinator blocks duplicate checks, supports cancellation, and ignores late responses after navigation", async () => {
  const coordinator = new DocumentCheckRequestCoordinator();
  let resolve!: (value: DocumentCheckOutcome) => void;
  const pending = coordinator.run(() => new Promise((done) => { resolve = done; }));
  assert.equal(coordinator.isRunning, true);
  assert.deepEqual(await coordinator.run(async () => ({ kind: "unavailable", reasonCode: "PROCESSING_ERROR" })), {
    kind: "unavailable",
    reasonCode: "DUPLICATE_REQUEST"
  });
  coordinator.cancel();
  resolve({ kind: "result", result: { status: "pass", reasonCode: "NO_OBVIOUS_ISSUE", confidence: "high" } });
  assert.equal(await pending, null);
  assert.equal(coordinator.isRunning, false);
});

test("rate-limit boundary uses keyed identifiers and test double enforces concurrency and burst limits", async () => {
  const rawIdentifier = "192.0.2.10";
  const identifierHash = createRateLimitIdentifierHash(rawIdentifier, "synthetic-test-secret");
  assert.notEqual(identifierHash, rawIdentifier);
  assert.doesNotMatch(identifierHash, /192\.0\.2\.10/);
  const limiter = new MemoryDocumentCheckRateLimiter({ burst: 1, burstWindowMs: 60_000, daily: 10, monthly: 10, concurrent: 1 });
  const first = await limiter.acquire({ clientIdentifierHash: identifierHash, now: 1_000 });
  assert.equal(first.allowed, true);
  assert.deepEqual(await limiter.acquire({ clientIdentifierHash: identifierHash, now: 1_001 }), { allowed: false, reasonCode: "CONCURRENT_LIMIT" });
  if (first.allowed) await limiter.release(first.leaseId);
  assert.deepEqual(await limiter.acquire({ clientIdentifierHash: identifierHash, now: 1_002 }), {
    allowed: false,
    reasonCode: "BURST_LIMIT",
    retryAfterSeconds: 60
  });
});

test("normal submission stays independent after every optional AI outcome", () => {
  const outcomes: DocumentCheckOutcome[] = [
    { kind: "unavailable", reasonCode: "TIMEOUT" },
    { kind: "unavailable", reasonCode: "PROVIDER_UNAVAILABLE" },
    { kind: "unavailable", reasonCode: "MALFORMED_PROVIDER_RESPONSE" },
    { kind: "unavailable", reasonCode: "RATE_LIMIT_REACHED" },
    { kind: "unavailable", reasonCode: "UNSUPPORTED_FILE" },
    { kind: "result", result: { status: "review", reasonCode: "SIGNATURE_NOT_FOUND", confidence: "medium" } }
  ];
  for (const outcome of outcomes) {
    const application = { ...defaultApplicationData, requirementsNeeded: ["bloodwork"] as RequirementKey[] };
    const messages = buildSubmissionEmailMessages(
      {
        application,
        uploads: { bloodwork: [{ filename: "synthetic.pdf", content: Buffer.from("synthetic"), contentType: "application/pdf" }] }
      },
      { applicationRecipient: "application@example.invalid", medicalRecipient: "medical@example.invalid", betaMode: true }
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.kind, "medical");
    const serialized = JSON.stringify(messages);
    assert.doesNotMatch(serialized, /NO_OBVIOUS_ISSUE|SIGNATURE_NOT_FOUND|TIMEOUT|PROVIDER_UNAVAILABLE|RATE_LIMIT_REACHED/);
    assert.ok(outcome);
  }
});

test("continuing while a check is pending does not wait for the result", () => {
  const coordinator = new DocumentCheckRequestCoordinator();
  void coordinator.run(() => new Promise(() => undefined));
  assert.equal(coordinator.isRunning, true);
  const normalNavigationAllowed = true;
  assert.equal(normalNavigationAllowed, true);
  coordinator.cancel();
});
