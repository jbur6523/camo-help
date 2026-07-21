import { documentCheckPerFileLimitBytes } from "@/lib/files/documentPolicies";

export const documentCheckMaxRequestBytes = 3.5 * 1024 * 1024;
export const documentCheckRequestRejectedMessage =
  "AI check unavailable — We could not review this document automatically. You may continue with your submission.";

export type DocumentCheckRequestPolicyReason = "REQUEST_TOO_LARGE" | "UNSUPPORTED_CONTENT_TYPE";

export class DocumentCheckRequestPolicyError extends Error {
  constructor(readonly reasonCode: DocumentCheckRequestPolicyReason) {
    super(documentCheckRequestRejectedMessage);
    this.name = "DocumentCheckRequestPolicyError";
  }
}

export function assertDocumentCheckRequestHeaders(headers: Headers) {
  const contentType = headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new DocumentCheckRequestPolicyError("UNSUPPORTED_CONTENT_TYPE");
  }
  const contentLength = Number(headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > documentCheckMaxRequestBytes) {
    throw new DocumentCheckRequestPolicyError("REQUEST_TOO_LARGE");
  }
}

if (documentCheckMaxRequestBytes <= documentCheckPerFileLimitBytes) {
  throw new Error("The document-check request allowance must exceed the file allowance.");
}
