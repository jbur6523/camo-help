import { NextResponse } from "next/server";
import { getDocumentCheckConfig } from "@/lib/document-check/config";
import { resolveClientIdentifierHash } from "@/lib/document-check/clientIdentifier";
import { MockDocumentCheckProvider } from "@/lib/document-check/mockProvider";
import {
  logDocumentCheckOperationalFailure,
  type DocumentCheckOperationalReasonCode
} from "@/lib/document-check/operationalLogging";
import { OpenAIDocumentCheckProvider } from "@/lib/document-check/openaiProvider";
import {
  runDocumentCheck,
  type DocumentCheckCategory
} from "@/lib/document-check/provider";
import {
  documentCheckOutcomeToPublicResponse,
  type PublicDocumentCheckResponse
} from "@/lib/document-check/publicResponse";
import { MemoryDocumentCheckRateLimiter } from "@/lib/document-check/testing/MemoryRateLimiter";
import type { DocumentCheckRateLimiter, DocumentCheckRateLimitReason } from "@/lib/document-check/rateLimit";
import { assertDocumentCheckRequestHeaders } from "@/lib/document-check/requestPolicy";
import { validateUploadedDocument } from "@/lib/files/serverDocumentValidation";
import { UpstashDocumentCheckRateLimiter } from "@/lib/document-check/upstashRateLimiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(response: PublicDocumentCheckResponse, status = 200) {
  return NextResponse.json(response, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function unavailable(retryable = true, status = 200) {
  return json({ state: "unavailable", retryable }, status);
}

function createRateLimiter(config: ReturnType<typeof getDocumentCheckConfig>): DocumentCheckRateLimiter | null {
  if (process.env.NODE_ENV === "test") {
    return new MemoryDocumentCheckRateLimiter({
      burst: config.burstLimit,
      burstWindowMs: 60_000,
      daily: config.dailyLimit,
      monthly: config.monthlyLimit,
      concurrent: 1
    });
  }
  if (!config.upstashUrl || !config.upstashToken) return null;
  return new UpstashDocumentCheckRateLimiter({
    url: config.upstashUrl,
    token: config.upstashToken,
    burstLimit: config.burstLimit,
    dailyLimit: config.dailyLimit,
    monthlyLimit: config.monthlyLimit,
    timeoutMs: config.timeoutMs
  });
}

function createProvider(config: ReturnType<typeof getDocumentCheckConfig>) {
  if (config.provider === "mock") return new MockDocumentCheckProvider("pass");
  if (!config.openAiApiKey) return null;
  return new OpenAIDocumentCheckProvider({ apiKey: config.openAiApiKey, model: config.model });
}

function rateLimitOperationalReason(reasonCode: DocumentCheckRateLimitReason): DocumentCheckOperationalReasonCode {
  if (reasonCode === "BACKEND_UNAVAILABLE") return "RATE_LIMIT_INFRASTRUCTURE_FAILURE";
  if (reasonCode === "MONTHLY_USAGE_LIMIT") return "USAGE_LIMIT_REACHED";
  return "RATE_LIMIT_REACHED";
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let providerInvoked = false;
  const fail = (
    reasonCode: DocumentCheckOperationalReasonCode,
    retryable = true,
    status = 200
  ) => {
    logDocumentCheckOperationalFailure({ reasonCode, startedAt, providerInvoked });
    return unavailable(retryable, status);
  };

  const config = getDocumentCheckConfig();
  if (!config.valid) {
    return fail(
      config.invalidReason === "RATE_LIMIT_CONFIGURATION_MISSING"
        ? "RATE_LIMIT_INFRASTRUCTURE_FAILURE"
        : "PROVIDER_AUTHENTICATION_OR_CONFIGURATION_FAILURE",
      false
    );
  }
  if (!config.enabled) return fail("FEATURE_DISABLED", false);
  if (!config.hashSecret) return fail("RATE_LIMIT_INFRASTRUCTURE_FAILURE", false);
  try {
    assertDocumentCheckRequestHeaders(request.headers);
  } catch {
    return fail("REQUEST_POLICY_REJECTED", false);
  }

  const limiter = createRateLimiter(config);
  if (!limiter) return fail("RATE_LIMIT_INFRASTRUCTURE_FAILURE", true);
  let leaseId: string | undefined;
  try {
    let decision;
    try {
      decision = await limiter.acquire({
        clientIdentifierHash: resolveClientIdentifierHash(request, config.hashSecret),
        now: Date.now()
      });
    } catch {
      return fail("RATE_LIMIT_INFRASTRUCTURE_FAILURE", true);
    }
    if (!decision.allowed) {
      const reasonCode = rateLimitOperationalReason(decision.reasonCode);
      return fail(reasonCode, decision.reasonCode !== "MONTHLY_USAGE_LIMIT");
    }
    leaseId = decision.leaseId;

    let formData;
    try {
      formData = await request.formData();
    } catch {
      return fail("INVALID_REQUEST", false);
    }
    if (formData.has("prompt")) return fail("INVALID_REQUEST", false);
    const categoryValue = formData.get("category");
    const files = formData.getAll("file");
    if (files.length !== 1 || !(files[0] instanceof File)) return fail("INVALID_REQUEST", false);
    const file = files[0];
    let document;
    try {
      document = await validateUploadedDocument(
        { bytes: new Uint8Array(await file.arrayBuffer()), declaredMimeType: file.type, filename: file.name },
        "document-check"
      );
    } catch {
      return fail("DOCUMENT_VALIDATION_FAILED", false);
    }
    if (categoryValue !== "bloodwork" && categoryValue !== "physical") return fail("INVALID_REQUEST", false);

    const provider = createProvider(config);
    if (!provider) return fail("PROVIDER_AUTHENTICATION_OR_CONFIGURATION_FAILURE", false);
    if (config.provider === "openai") {
      let budget;
      try {
        budget = await limiter.consumeProviderBudget(leaseId);
      } catch {
        return fail("RATE_LIMIT_INFRASTRUCTURE_FAILURE", true);
      }
      if (!budget.allowed) {
        const reasonCode = rateLimitOperationalReason(budget.reasonCode);
        return fail(reasonCode, budget.reasonCode !== "MONTHLY_USAGE_LIMIT");
      }
    }
    providerInvoked = true;
    const outcome = await runDocumentCheck({
      provider,
      document,
      category: categoryValue as DocumentCheckCategory,
      timeoutMs: config.timeoutMs,
      signal: request.signal
    });
    if (outcome.kind === "unavailable") {
      logDocumentCheckOperationalFailure({ reasonCode: outcome.reasonCode, startedAt, providerInvoked });
    }
    return json(documentCheckOutcomeToPublicResponse(outcome));
  } catch {
    return fail("PROCESSING_ERROR", true);
  } finally {
    if (leaseId) {
      try {
        await limiter.release(leaseId);
      } catch {
        logDocumentCheckOperationalFailure({
          reasonCode: "RATE_LIMIT_INFRASTRUCTURE_FAILURE",
          startedAt,
          providerInvoked,
          outcome: "cleanup_failure"
        });
      }
    }
  }
}

export async function GET() {
  return unavailable(false, 405);
}
