import { NextResponse } from "next/server";
import { getDocumentCheckConfig } from "@/lib/document-check/config";
import { resolveClientIdentifierHash } from "@/lib/document-check/clientIdentifier";
import { MockDocumentCheckProvider } from "@/lib/document-check/mockProvider";
import {
  publicReasons,
  type PublicDocumentCheckReason
} from "@/lib/document-check/messages";
import { OpenAIDocumentCheckProvider } from "@/lib/document-check/openaiProvider";
import { runDocumentCheck, type DocumentCheckCategory } from "@/lib/document-check/provider";
import { MemoryDocumentCheckRateLimiter } from "@/lib/document-check/testing/MemoryRateLimiter";
import type { DocumentCheckRateLimiter } from "@/lib/document-check/rateLimit";
import { assertDocumentCheckRequestHeaders } from "@/lib/document-check/requestPolicy";
import { validateUploadedDocument, DocumentValidationError } from "@/lib/files/serverDocumentValidation";
import { UpstashDocumentCheckRateLimiter } from "@/lib/document-check/upstashRateLimiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PublicResponse =
  | { state: "passed" }
  | { state: "review"; reasons: PublicDocumentCheckReason[] }
  | { state: "unable_to_verify" }
  | { state: "unavailable"; retryable: boolean };

function json(response: PublicResponse, status = 200) {
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

export async function POST(request: Request) {
  const config = getDocumentCheckConfig();
  if (!config.enabled) return unavailable(false);
  if (!config.valid || !config.hashSecret) return unavailable(false);
  try {
    assertDocumentCheckRequestHeaders(request.headers);
  } catch {
    return unavailable(false);
  }

  const limiter = createRateLimiter(config);
  if (!limiter) return unavailable(true);
  let leaseId: string | undefined;
  try {
    const decision = await limiter.acquire({
      clientIdentifierHash: resolveClientIdentifierHash(request, config.hashSecret),
      now: Date.now()
    });
    if (!decision.allowed) return unavailable(decision.reasonCode !== "MONTHLY_USAGE_LIMIT");
    leaseId = decision.leaseId;

    const formData = await request.formData();
    if (formData.has("prompt")) return unavailable(false);
    const categoryValue = formData.get("category");
    const files = formData.getAll("file");
    if (files.length !== 1 || !(files[0] instanceof File)) return unavailable(false);
    const file = files[0];
    let document;
    try {
      document = await validateUploadedDocument(
        { bytes: new Uint8Array(await file.arrayBuffer()), declaredMimeType: file.type, filename: file.name },
        "document-check"
      );
    } catch (error) {
      if (error instanceof DocumentValidationError) return unavailable(false);
      return unavailable(false);
    }
    if (categoryValue !== "bloodwork" && categoryValue !== "physical") return unavailable(false);

    const provider = createProvider(config);
    if (!provider) return unavailable(false);
    if (config.provider === "openai") {
      const budget = await limiter.consumeProviderBudget(leaseId);
      if (!budget.allowed) return unavailable(budget.reasonCode !== "MONTHLY_USAGE_LIMIT");
    }
    const outcome = await runDocumentCheck({
      provider,
      document,
      category: categoryValue as DocumentCheckCategory,
      timeoutMs: config.timeoutMs,
      signal: request.signal
    });
    if (outcome.kind === "unavailable") {
      return unavailable(!["REQUEST_CANCELLED", "UNSUPPORTED_FILE"].includes(outcome.reasonCode));
    }
    if (outcome.result.status === "pass") return json({ state: "passed" });
    if (outcome.result.status === "unable_to_verify") return json({ state: "unable_to_verify" });
    return json({ state: "review", reasons: publicReasons(outcome.result) });
  } catch {
    return unavailable(true);
  } finally {
    if (leaseId) {
      try {
        await limiter.release(leaseId);
      } catch {
        // Release is best effort; the lock TTL is the recovery boundary.
      }
    }
  }
}

export async function GET() {
  return unavailable(false, 405);
}
