import type { DocumentCheckUnavailableReason } from "@/lib/document-check/provider";

export type DocumentCheckOperationalReasonCode =
  | DocumentCheckUnavailableReason
  | "FEATURE_DISABLED"
  | "REQUEST_POLICY_REJECTED"
  | "INVALID_REQUEST"
  | "DOCUMENT_VALIDATION_FAILED";

type OperationalLog = {
  outcome: "unavailable" | "cleanup_failure";
  reasonCode: DocumentCheckOperationalReasonCode;
  providerInvoked: boolean;
  timedOut: boolean;
  requestDurationMs: number;
};

type LogSink = (message: string, details: OperationalLog) => void;

export function logDocumentCheckOperationalFailure({
  reasonCode,
  startedAt,
  providerInvoked,
  outcome = "unavailable",
  sink
}: {
  reasonCode: DocumentCheckOperationalReasonCode;
  startedAt: number;
  providerInvoked: boolean;
  outcome?: OperationalLog["outcome"];
  sink?: LogSink;
}) {
  const selectedSink = sink || (process.env.NODE_ENV === "test" ? undefined : console.warn);
  if (!selectedSink) return;
  selectedSink("Document check unavailable.", {
    outcome,
    reasonCode,
    providerInvoked,
    timedOut: reasonCode === "PROVIDER_TIMEOUT",
    requestDurationMs: Math.max(0, Date.now() - startedAt)
  });
}
