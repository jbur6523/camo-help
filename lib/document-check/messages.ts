import type { DocumentCheckReasonCode, DocumentCheckResult } from "@/lib/document-check/schema";

export const documentCheckDisclaimer =
  "AI checks may be inaccurate and do not guarantee acceptance. CAMO makes the final determination.";

export const documentCheckUnavailableMessage =
  "AI check unavailable — We could not review this document automatically. You may continue with your submission.";

export type PublicDocumentCheckReason =
  | "POSSIBLE_NON_PHYSICIAN"
  | "POSSIBLE_OTHER_NON_PHYSICIAN"
  | "HEP_B_ANTIBODY"
  | "HEP_B_ANTIGEN_NOT_FOUND"
  | "PROVIDER_CREDENTIALS_UNREADABLE"
  | "SIGNATURE_NOT_FOUND";

const publicReasonByCode: Partial<Record<DocumentCheckReasonCode, PublicDocumentCheckReason>> = {
  POSSIBLE_NP_OR_PA: "POSSIBLE_NON_PHYSICIAN",
  POSSIBLE_OTHER_NON_PHYSICIAN: "POSSIBLE_OTHER_NON_PHYSICIAN",
  HEP_B_ANTIBODY_FOUND: "HEP_B_ANTIBODY",
  HEP_B_ANTIGEN_NOT_FOUND: "HEP_B_ANTIGEN_NOT_FOUND",
  PROVIDER_CREDENTIALS_UNREADABLE: "PROVIDER_CREDENTIALS_UNREADABLE",
  PROVIDER_CREDENTIALS_MISSING: "PROVIDER_CREDENTIALS_UNREADABLE",
  SIGNATURE_NOT_FOUND: "SIGNATURE_NOT_FOUND"
};

export const publicReasonMessages: Record<PublicDocumentCheckReason, string> = {
  POSSIBLE_NON_PHYSICIAN: "Provider credentials may indicate an NP or PA rather than an MD or DO.",
  POSSIBLE_OTHER_NON_PHYSICIAN: "The provider credentials may not meet CAMO’s physician requirement.",
  HEP_B_ANTIBODY: "The document may show a Hepatitis B Surface Antibody test rather than the required Hepatitis B Surface Antigen test.",
  HEP_B_ANTIGEN_NOT_FOUND: "A Hepatitis B Surface Antigen test could not be clearly identified.",
  PROVIDER_CREDENTIALS_UNREADABLE: "The provider credentials could not be clearly verified.",
  SIGNATURE_NOT_FOUND: "A provider signature could not be clearly identified."
};

export function publicReasons(result: DocumentCheckResult): PublicDocumentCheckReason[] {
  return [...new Set(result.reasonCodes.map((code) => publicReasonByCode[code]).filter(Boolean) as PublicDocumentCheckReason[])].slice(0, 3);
}

export function documentCheckResultMessage(result: DocumentCheckResult) {
  if (result.status === "pass") return "AI check passed — No obvious issues were detected. Documents are likely to be accepted.";
  if (result.status === "unable_to_verify") return "Document may need further review — The required information could not be clearly verified from this document.";
  const reason = publicReasons(result)[0];
  return `Document may need further review — ${reason ? publicReasonMessages[reason] : "The required information could not be clearly verified from this document."}`;
}
