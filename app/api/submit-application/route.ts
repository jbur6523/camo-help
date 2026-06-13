import { NextResponse } from "next/server";
import {
  NoSelectedEmailAttachmentsError,
  sendApplicationEmails,
  sendPromoterNotificationEmail,
  SubmissionEmailDeliveryError
} from "@/lib/email/sendApplicationEmails";
import { generateSignatureCertificatePdf } from "@/lib/pdf/generateSignatureCertificatePdf";
import {
  safeErrorMessage,
  sendSupportErrorNotification,
  sendSupportFighterSubmissionNotification
} from "@/lib/email/supportNotifications";
import { createSubmissionReferenceId } from "@/lib/submission/referenceId";
import { assertRequiredUploadsPresent, MissingRequiredUploadsError } from "@/lib/submission/validateRequiredUploads";
import type { SignatureAuditPayload, SignatureLocationAudit } from "@/lib/signatureAudit";
import type { ApplicationData, UploadKey } from "@/lib/types";
import { fullName } from "@/lib/types";
import { independentPromoterId } from "@/lib/promoters/constants";

export const runtime = "nodejs";

const uploadKeys: UploadKey[] = ["bloodwork", "physical", "headshot", "photoId", "cardio", "additional"];
const submissionIdTtlMs = 10 * 60 * 1000;
const processedSubmissionIds = new Map<string, number>();

type DeliveryState = {
  completedStep: string;
  applicationEmailSent: boolean;
  medicalEmailSent: boolean;
  fighterConfirmationEmailSent: boolean;
  supportNotificationAttempted: boolean;
};

export async function POST(request: Request) {
  let submissionId = "unknown";
  let applicationForError: ApplicationData | null = null;
  const deliveryState: DeliveryState = {
    completedStep: "request_received",
    applicationEmailSent: false,
    medicalEmailSent: false,
    fighterConfirmationEmailSent: false,
    supportNotificationAttempted: false
  };
  try {
    const formData = await request.formData();
    const submittedId = formData.get("submissionId");
    submissionId = typeof submittedId === "string" && submittedId.trim() ? submittedId.trim() : createSubmissionReferenceId();
    pruneProcessedSubmissionIds();
    console.info("API submission request received.", { submissionId });

    if (processedSubmissionIds.has(submissionId)) {
      console.warn("Duplicate API submission skipped.", { submissionId });
      return NextResponse.json({ ok: true, duplicate: true, submissionId, deliveryState });
    }

    processedSubmissionIds.set(submissionId, Date.now());

    const applicationJson = formData.get("application");
    if (typeof applicationJson !== "string") {
      throw new Error("Application payload is missing.");
    }

    const application = JSON.parse(applicationJson) as ApplicationData;
    applicationForError = application;
    deliveryState.completedStep = "application_payload_parsed";
    const signatureAudit = parseSignatureAudit(formData.get("signatureAudit"));
    const ipAddress = clientIpFromHeaders(request.headers);
    const userAgent = request.headers.get("user-agent") || "Unavailable";
    const athletePdf = await attachmentFromForm(formData, "athletePdf", "completed-athlete-license.pdf");
    const nationalIdPdf = await attachmentFromForm(formData, "nationalIdPdf", "completed-national-mma-id.pdf");
    const requirementsNeeded = application.requirementsNeeded || [];

    if (requirementsNeeded.includes("athleteLicenseApplication") && !athletePdf) {
      return NextResponse.json({ error: "Completed Athlete License PDF is missing.", submissionId, deliveryState }, { status: 400 });
    }

    if (requirementsNeeded.includes("nationalMmaIdApplication") && !nationalIdPdf) {
      return NextResponse.json({ error: "Completed National MMA ID PDF is missing.", submissionId, deliveryState }, { status: 400 });
    }

    const uploads: Record<string, Awaited<ReturnType<typeof attachmentsFromForm>>> = {};
    for (const key of uploadKeys) {
      uploads[key] = await attachmentsFromForm(formData, key);
    }
    deliveryState.completedStep = "attachments_parsed";

    assertRequiredUploadsPresent(application, uploads);
    deliveryState.completedStep = "required_uploads_validated";

    const submittedAt = new Date();
    const certifiedDocuments = certifiedApplicationDocuments(application);
    const signatureCertificatePdf = certifiedDocuments.length
      ? await signatureCertificateAttachment({
          submissionId,
          submittedAt,
          application,
          certifiedDocuments,
          ipAddress,
          userAgent,
          location: signatureAudit.location
        })
      : undefined;
    deliveryState.completedStep = "signature_certificate_generated";

    const result = await sendApplicationEmails({
      submissionId,
      application,
      athletePdf,
      nationalIdPdf,
      signatureCertificatePdf,
      uploads
    });
    deliveryState.applicationEmailSent = Boolean(result.applicationRecipient);
    deliveryState.medicalEmailSent = Boolean(result.medicalRecipient);
    deliveryState.fighterConfirmationEmailSent = Boolean(result.fighterConfirmationRecipient);
    deliveryState.completedStep = "critical_camo_emails_sent";

    try {
      deliveryState.supportNotificationAttempted = true;
      await sendSupportFighterSubmissionNotification({
        application,
        uploads,
        submittedAt,
        submissionId,
        athletePdfGenerated: Boolean(athletePdf),
        nationalIdPdfGenerated: Boolean(nationalIdPdf),
        applicationEmailSent: Boolean(result.applicationRecipient),
        medicalEmailSent: Boolean(result.medicalRecipient),
        fighterConfirmationEmailSent: Boolean(result.fighterConfirmationRecipient),
        promoterNotificationStatus: promoterNotificationStatusBeforeSend(application)
      });
    } catch (supportError) {
      const supportMessage = supportError instanceof Error ? supportError.message : "Support notification failed.";
      console.warn("Support fighter submission notification failed without blocking submission.", {
        submissionId,
        error: safeErrorMessage(supportMessage)
      });
    }

    const promoterRecipient = await sendPromoterNotificationEmail(application, submissionId);
    deliveryState.completedStep = "secondary_notifications_attempted";

    return NextResponse.json({ ok: true, submissionId, ...result, promoterRecipient, deliveryState });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Submission failed.";
    const isPartial = error instanceof SubmissionEmailDeliveryError && error.sentKinds.length > 0;
    if (error instanceof SubmissionEmailDeliveryError) {
      deliveryState.applicationEmailSent = error.sentKinds.includes("application");
      deliveryState.medicalEmailSent = error.sentKinds.includes("medical");
      deliveryState.completedStep = error.sentKinds.length ? `${error.sentKinds.join("_and_")}_email_sent` : "critical_email_send_started";
    }
    console.error("API submission failed.", { submissionId, error: message });
    await sendSupportErrorNotification({
      errorType: classifySubmissionError(message, error),
      source: "app/api/submit-application POST",
      message,
      operation: "Complete fighter document submission",
      details: deliveryStateDetails(deliveryState),
      submissionId,
      fighterName: applicationForError ? fullName(applicationForError) : undefined,
      fighterEmail: applicationForError?.email,
      userShownOutcome: isPartial ? "partial" : "failure"
    });
    return NextResponse.json(
      {
        error: isPartial
          ? "Some of your documents may not have been delivered successfully."
          : "We were unable to submit your documents at this time.",
        submissionId,
        failureKind: isPartial ? "partial" : "failed",
        deliveryState
      },
      { status: error instanceof NoSelectedEmailAttachmentsError || error instanceof MissingRequiredUploadsError ? 400 : 500 }
    );
  }
}

async function attachmentFromForm(formData: FormData, key: string, fallbackName?: string) {
  const file = formData.get(key);
  if (!(file instanceof File) || file.size === 0) return undefined;
  return {
    filename: file.name || fallbackName || key,
    content: Buffer.from(await file.arrayBuffer()),
    contentType: file.type || "application/octet-stream"
  };
}

async function attachmentsFromForm(formData: FormData, key: string) {
  const files = formData.getAll(key).filter((file): file is File => file instanceof File && file.size > 0);
  return Promise.all(
    files.map(async (file) => ({
      filename: file.name || key,
      content: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream"
    }))
  );
}

function pruneProcessedSubmissionIds() {
  const cutoff = Date.now() - submissionIdTtlMs;
  for (const [submissionId, timestamp] of processedSubmissionIds.entries()) {
    if (timestamp < cutoff) processedSubmissionIds.delete(submissionId);
  }
}

function classifySubmissionError(message: string, error: unknown) {
  if (error instanceof SubmissionEmailDeliveryError) {
    return error.failedKind === "application" ? "Application Email Failure" : "Medical Email Failure";
  }
  if (error instanceof MissingRequiredUploadsError) return "Upload Validation Failure";
  if (error instanceof NoSelectedEmailAttachmentsError) return "No Selected Email Attachments";
  if (message.toLowerCase().includes("signature certification pdf")) return "PDF Generation Failure";
  if (message.startsWith("Missing required email environment variable")) return "Missing Required Environment Variable";
  if (message.startsWith("Resend email failed")) return "Email Sending Failure";
  if (message.toLowerCase().includes("formdata") || message.toLowerCase().includes("file")) return "Upload Parsing Failure";
  return "Fighter Submission Failure";
}

function promoterNotificationStatusBeforeSend(application: ApplicationData) {
  if (!application.selectedPromoterId || application.selectedPromoterId === independentPromoterId) return "not_applicable";
  return "pending";
}

function deliveryStateDetails(deliveryState: DeliveryState) {
  return [
    `Email step completed before failure: ${deliveryState.completedStep}`,
    `CAMO application email sent: ${deliveryState.applicationEmailSent ? "yes" : "no"}`,
    `CAMO medical email sent: ${deliveryState.medicalEmailSent ? "yes" : "no"}`,
    `Fighter confirmation email sent: ${deliveryState.fighterConfirmationEmailSent ? "yes" : "no"}`,
    `Support notification email attempted: ${deliveryState.supportNotificationAttempted ? "yes" : "no"}`
  ];
}

async function signatureCertificateAttachment({
  submissionId,
  submittedAt,
  application,
  certifiedDocuments,
  ipAddress,
  userAgent,
  location
}: {
  submissionId: string;
  submittedAt: Date;
  application: ApplicationData;
  certifiedDocuments: string[];
  ipAddress: string;
  userAgent: string;
  location: SignatureLocationAudit;
}) {
  try {
    const certificateBytes = await generateSignatureCertificatePdf({
      submissionId,
      submittedAt,
      application,
      certifiedDocuments,
      ipAddress,
      userAgent,
      location
    });
    console.info("Signature certificate PDF generated.", {
      submissionId,
      certifiedDocumentCount: certifiedDocuments.length
    });
    return {
      filename: `signature-certificate-${submissionId}.pdf`,
      content: Buffer.from(certificateBytes),
      contentType: "application/pdf"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PDF generation error.";
    throw new Error(`Signature Certification PDF generation failed: ${message}`);
  }
}

function certifiedApplicationDocuments(application: ApplicationData) {
  const requirementsNeeded = application.requirementsNeeded || [];
  return [
    ...(requirementsNeeded.includes("athleteLicenseApplication") ? ["CAMO Athlete License Application"] : []),
    ...(requirementsNeeded.includes("nationalMmaIdApplication") ? ["National MMA ID Application"] : [])
  ];
}

function parseSignatureAudit(value: FormDataEntryValue | null): { location: SignatureLocationAudit } {
  if (typeof value !== "string" || !value.trim()) {
    return { location: unavailableLocation("Not collected") };
  }

  try {
    const parsed = JSON.parse(value) as SignatureAuditPayload;
    return { location: normalizeLocation(parsed.location) };
  } catch {
    return { location: unavailableLocation("Invalid location audit payload") };
  }
}

function normalizeLocation(location: SignatureAuditPayload["location"]): SignatureLocationAudit {
  if (!location) return unavailableLocation("Not collected");
  if (location.status === "denied") {
    return { status: "denied", timestamp: stringOrUndefined(location.timestamp) };
  }
  if (location.status === "granted") {
    return {
      status: "granted",
      latitude: finiteNumber(location.latitude),
      longitude: finiteNumber(location.longitude),
      accuracy: finiteNumber(location.accuracy),
      timestamp: stringOrUndefined(location.timestamp) || new Date().toISOString()
    };
  }
  return {
    status: "unavailable",
    reason: stringOrUndefined(location.reason) || "Not collected",
    timestamp: stringOrUndefined(location.timestamp)
  };
}

function unavailableLocation(reason: string): SignatureLocationAudit {
  return { status: "unavailable", reason, timestamp: new Date().toISOString() };
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function clientIpFromHeaders(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "Unavailable";
  return headers.get("x-real-ip") || "Unavailable";
}
