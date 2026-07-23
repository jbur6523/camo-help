import { documentCheckResultSchema, type DocumentCheckResult } from "@/lib/document-check/schema";
import type { ValidatedDocument } from "@/lib/files/serverDocumentValidation";

export type DocumentCheckCategory = "bloodwork" | "physical";
export type DocumentCheckInput = { document: ValidatedDocument; category: DocumentCheckCategory };

export type DocumentCheckProvider = {
  check(input: DocumentCheckInput, signal: AbortSignal): Promise<unknown>;
};

export type DocumentCheckUnavailableReason =
  | "INVALID_STRUCTURED_OUTPUT_SCHEMA"
  | "INCOMPLETE_MAX_OUTPUT_TOKENS"
  | "INCOMPLETE_PROVIDER_RESPONSE"
  | "EMPTY_PROVIDER_OUTPUT"
  | "MALFORMED_PROVIDER_OUTPUT"
  | "PROVIDER_AUTHENTICATION_OR_CONFIGURATION_FAILURE"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "REQUEST_CANCELLED"
  | "RATE_LIMIT_REACHED"
  | "RATE_LIMIT_INFRASTRUCTURE_FAILURE"
  | "USAGE_LIMIT_REACHED"
  | "UNSUPPORTED_FILE"
  | "PROCESSING_ERROR"
  | "DUPLICATE_REQUEST";

export class DocumentCheckProviderError extends Error {
  constructor(readonly reasonCode: DocumentCheckUnavailableReason) {
    super("Document-check provider operation failed.");
    this.name = "DocumentCheckProviderError";
  }
}

export type DocumentCheckOutcome =
  | { kind: "result"; result: DocumentCheckResult }
  | { kind: "unavailable"; reasonCode: DocumentCheckUnavailableReason };

export async function runDocumentCheck({
  provider,
  document,
  category,
  timeoutMs,
  signal
}: {
  provider: DocumentCheckProvider;
  document: ValidatedDocument;
  category?: DocumentCheckCategory;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<DocumentCheckOutcome> {
  const controller = new AbortController();
  let timedOut = false;
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(new Error("Document check aborted.")), { once: true });
  });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });

  try {
    const rawResult = await Promise.race([provider.check({ document, category: category || "bloodwork" }, controller.signal), aborted]);
    const parsed = documentCheckResultSchema.safeParse(rawResult);
    if (!parsed.success) return { kind: "unavailable", reasonCode: "MALFORMED_PROVIDER_OUTPUT" };
    return { kind: "result", result: parsed.data };
  } catch (error) {
    if (timedOut) return { kind: "unavailable", reasonCode: "PROVIDER_TIMEOUT" };
    if (signal?.aborted || controller.signal.aborted) return { kind: "unavailable", reasonCode: "REQUEST_CANCELLED" };
    if (error instanceof DocumentCheckProviderError) {
      return { kind: "unavailable", reasonCode: error.reasonCode };
    }
    return { kind: "unavailable", reasonCode: "PROVIDER_UNAVAILABLE" };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
