import type { DocumentCheckReasonCode, DocumentCheckResult } from "@/lib/document-check/schema";

export const documentCheckDisclaimer =
  "AI checks may be inaccurate and do not guarantee acceptance. CAMO makes the final determination.";

export const documentCheckUnavailableMessage =
  "AI check unavailable — We could not review this document automatically. You may continue with your submission.";

const reviewReasons: Partial<Record<DocumentCheckReasonCode, string>> = {
  POSSIBLE_NP_OR_PA: "Possible provider credential issue.",
  HEP_B_ANTIBODY_FOUND: "Possible Hepatitis B Surface Antibody test instead of Hepatitis B Surface Antigen.",
  HEP_B_ANTIGEN_NOT_FOUND: "The required Hepatitis B Surface Antigen could not be verified.",
  PROVIDER_CREDENTIALS_UNREADABLE: "Provider credentials could not be clearly verified.",
  SIGNATURE_NOT_FOUND: "A required signature could not be clearly verified.",
  IMAGE_UNREADABLE: "The document image was not clear enough to verify.",
  UNSUPPORTED_DOCUMENT: "The required information could not be clearly verified from this document."
};

export function documentCheckResultMessage(result: DocumentCheckResult) {
  if (result.status === "pass") {
    return "AI check passed — No obvious issues were detected. Documents are likely to be accepted.";
  }
  if (result.status === "unable_to_verify") {
    return "Document may need further review — The required information could not be clearly verified from this document.";
  }
  return `Document may need further review — ${reviewReasons[result.reasonCode] || "The required information could not be clearly verified."}`;
}
