import { publicReasons, type PublicDocumentCheckReason } from "@/lib/document-check/messages";
import type { DocumentCheckOutcome, DocumentCheckUnavailableReason } from "@/lib/document-check/provider";

export type PublicDocumentCheckResponse =
  | { state: "passed" }
  | { state: "review"; reasons: PublicDocumentCheckReason[] }
  | { state: "unable_to_verify" }
  | { state: "unavailable"; retryable: boolean };

export function documentCheckOutcomeToPublicResponse(outcome: DocumentCheckOutcome): PublicDocumentCheckResponse {
  if (outcome.kind === "unavailable") {
    const nonRetryableReasons: DocumentCheckUnavailableReason[] = [
      "REQUEST_CANCELLED",
      "UNSUPPORTED_FILE",
      "INVALID_STRUCTURED_OUTPUT_SCHEMA",
      "PROVIDER_AUTHENTICATION_OR_CONFIGURATION_FAILURE"
    ];
    return { state: "unavailable", retryable: !nonRetryableReasons.includes(outcome.reasonCode) };
  }
  if (outcome.result.status === "pass") return { state: "passed" };
  if (outcome.result.status === "unable_to_verify") return { state: "unable_to_verify" };
  return { state: "review", reasons: publicReasons(outcome.result) };
}
