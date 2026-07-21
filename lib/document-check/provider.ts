import { documentCheckResultSchema, type DocumentCheckResult } from "@/lib/document-check/schema";
import type { ValidatedDocument } from "@/lib/files/serverDocumentValidation";

export type DocumentCheckProvider = {
  check(document: ValidatedDocument, signal: AbortSignal): Promise<unknown>;
};

export type DocumentCheckUnavailableReason =
  | "TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "MALFORMED_PROVIDER_RESPONSE"
  | "REQUEST_CANCELLED"
  | "RATE_LIMIT_REACHED"
  | "USAGE_LIMIT_REACHED"
  | "UNSUPPORTED_FILE"
  | "PROCESSING_ERROR"
  | "DUPLICATE_REQUEST";

export type DocumentCheckOutcome =
  | { kind: "result"; result: DocumentCheckResult }
  | { kind: "unavailable"; reasonCode: DocumentCheckUnavailableReason };

export async function runDocumentCheck({
  provider,
  document,
  timeoutMs,
  signal
}: {
  provider: DocumentCheckProvider;
  document: ValidatedDocument;
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
    const rawResult = await Promise.race([provider.check(document, controller.signal), aborted]);
    const parsed = documentCheckResultSchema.safeParse(rawResult);
    if (!parsed.success) return { kind: "unavailable", reasonCode: "MALFORMED_PROVIDER_RESPONSE" };
    return { kind: "result", result: parsed.data };
  } catch (error) {
    if (timedOut) return { kind: "unavailable", reasonCode: "TIMEOUT" };
    if (signal?.aborted || controller.signal.aborted) return { kind: "unavailable", reasonCode: "REQUEST_CANCELLED" };
    return { kind: "unavailable", reasonCode: "PROVIDER_UNAVAILABLE" };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
