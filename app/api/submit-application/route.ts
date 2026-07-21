import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  NoSelectedEmailAttachmentsError,
  sendApplicationEmails,
  sendPromoterNotificationEmail,
  SubmissionEmailDeliveryError
} from "@/lib/email/sendApplicationEmails";
import { generateSignatureCertificatePdf } from "@/lib/pdf/generateSignatureCertificatePdf";
import {
  sendSupportErrorNotification,
  sendSupportFighterSubmissionNotification
} from "@/lib/email/supportNotifications";
import { formatPacificDate } from "@/lib/dates";
import { generateAthleteLicensePdf } from "@/lib/pdf/generateAthleteLicensePdf";
import { generateNationalIdPdf } from "@/lib/pdf/generateNationalIdPdf";
import { athleteLicenseTemplatePath, nationalIdTemplatePath } from "@/lib/pdf/pdfFieldNameMap";
import { filterSelectedUploads } from "@/lib/submission/filterSelectedUploads";
import { createSubmissionReferenceId, normalizeSubmissionReferenceId } from "@/lib/submission/referenceId";
import { assertRequiredUploadsPresent, MissingRequiredUploadsError } from "@/lib/submission/validateRequiredUploads";
import type { ApproximateIpLocation } from "@/lib/signatureAudit";
import type { ApplicationData, UploadKey } from "@/lib/types";
import { independentPromoterId } from "@/lib/promoters/constants";
import {
  DocumentValidationError,
  safeDocumentValidationMessage,
  validateUploadedDocument
} from "@/lib/files/serverDocumentValidation";

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
    submissionId = normalizeSubmissionReferenceId(submittedId) || createSubmissionReferenceId();
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
    deliveryState.completedStep = "application_payload_parsed";
    const ipAddress = clientIpFromHeaders(request.headers);
    const approximateIpLocation = approximateIpLocationFromHeaders(request.headers);
    const requirementsNeeded = application.requirementsNeeded || [];
    const submittedAthleteFile = fileFromForm(formData, "athletePdf");
    const submittedNationalIdFile = fileFromForm(formData, "nationalIdPdf");

    if (requirementsNeeded.includes("athleteLicenseApplication") && !submittedAthleteFile) {
      return NextResponse.json({ error: "Completed Athlete License PDF is missing.", submissionId, deliveryState }, { status: 400 });
    }

    if (requirementsNeeded.includes("nationalMmaIdApplication") && !submittedNationalIdFile) {
      return NextResponse.json({ error: "Completed National MMA ID PDF is missing.", submissionId, deliveryState }, { status: 400 });
    }

    if (requirementsNeeded.includes("athleteLicenseApplication") && submittedAthleteFile) {
      await attachmentFromFile(submittedAthleteFile, "completed-athlete-license.pdf");
    }
    if (requirementsNeeded.includes("nationalMmaIdApplication") && submittedNationalIdFile) {
      await attachmentFromFile(submittedNationalIdFile, "completed-national-mma-id.pdf");
    }

    const parsedUploadFiles: Record<UploadKey, File[]> = {
      bloodwork: [],
      physical: [],
      headshot: [],
      photoId: [],
      cardio: [],
      additional: []
    };
    for (const key of uploadKeys) {
      parsedUploadFiles[key] = filesFromForm(formData, key);
    }
    const selectedUploadFiles = filterSelectedUploads(requirementsNeeded, parsedUploadFiles);
    const uploads: Partial<Record<UploadKey, Awaited<ReturnType<typeof attachmentsFromFiles>>>> = {};
    for (const [key, files] of Object.entries(selectedUploadFiles) as Array<[UploadKey, File[]]>) {
      uploads[key] = await attachmentsFromFiles(files, key);
    }
    deliveryState.completedStep = "attachments_parsed";

    assertRequiredUploadsPresent(application, uploads);
    deliveryState.completedStep = "required_uploads_validated";

    const submittedAt = new Date();
    const applicationWithSubmissionDate = {
      ...application,
      signatureDate: formatPacificDate(submittedAt)
    };
    const athletePdf = requirementsNeeded.includes("athleteLicenseApplication")
      ? await serverGeneratedOfficialPdf("athlete", applicationWithSubmissionDate)
      : undefined;
    const nationalIdPdf = requirementsNeeded.includes("nationalMmaIdApplication")
      ? await serverGeneratedOfficialPdf("nationalId", applicationWithSubmissionDate)
      : undefined;
    deliveryState.completedStep = "official_pdfs_generated";

    const certifiedDocuments = certifiedApplicationDocuments(applicationWithSubmissionDate);
    const signatureCertificatePdf = certifiedDocuments.length
      ? await signatureCertificateAttachment({
          submissionId,
          submittedAt,
          application: applicationWithSubmissionDate,
          certifiedDocuments,
          ipAddress,
          approximateIpLocation
        })
      : undefined;
    deliveryState.completedStep = "signature_certificate_generated";

    console.info("Submission outgoing attachment summary.", {
      attachmentCount: outgoingAttachmentCount({ athletePdf, nationalIdPdf, signatureCertificatePdf, uploads }),
      totalBytes: outgoingAttachmentBytes({ athletePdf, nationalIdPdf, signatureCertificatePdf, uploads })
    });

    const result = await sendApplicationEmails({
      submissionId,
      application: applicationWithSubmissionDate,
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
        application: applicationWithSubmissionDate,
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
    } catch {
      console.warn("Support fighter submission notification failed without blocking submission.", {
        submissionId,
        reasonCode: "SUPPORT_NOTIFICATION_FAILED"
      });
    }

    const promoterRecipient = await sendPromoterNotificationEmail(applicationWithSubmissionDate, submissionId, submittedAt);
    deliveryState.completedStep = "secondary_notifications_attempted";

    return NextResponse.json({ ok: true, submissionId, ...result, promoterRecipient, deliveryState });
  } catch (error) {
    if (error instanceof DocumentValidationError) {
      processedSubmissionIds.delete(submissionId);
      console.warn("API submission upload validation rejected.", { reasonCode: error.reasonCode });
      return NextResponse.json({ error: safeDocumentValidationMessage, submissionId, deliveryState }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Submission failed.";
    const errorType = classifySubmissionError(message, error);
    const isPartial = error instanceof SubmissionEmailDeliveryError && error.sentKinds.length > 0;
    if (error instanceof SubmissionEmailDeliveryError) {
      deliveryState.applicationEmailSent = error.sentKinds.includes("application");
      deliveryState.medicalEmailSent = error.sentKinds.includes("medical");
      deliveryState.completedStep = error.sentKinds.length ? `${error.sentKinds.join("_and_")}_email_sent` : "critical_email_send_started";
    }
    console.error("API submission failed.", { submissionId, errorType });
    await sendSupportErrorNotification({
      errorType,
      source: "app/api/submit-application POST",
      message,
      operation: "Complete fighter document submission",
      details: deliveryStateDetails(deliveryState),
      submissionId,
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

function fileFromForm(formData: FormData, key: string) {
  const file = formData.get(key);
  return file instanceof File ? file : undefined;
}

async function attachmentFromFile(file: File, fallbackName?: string) {
  const filename = file.name || fallbackName || "upload";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validated = await validateUploadedDocument(
    { bytes, declaredMimeType: file.type || "application/octet-stream", filename },
    "submission"
  );
  return {
    filename,
    content: Buffer.from(validated.bytes),
    contentType: validated.mimeType
  };
}

function filesFromForm(formData: FormData, key: string) {
  return formData.getAll(key).filter((file): file is File => file instanceof File);
}

async function attachmentsFromFiles(files: File[], fallbackName: string) {
  return Promise.all(files.map((file) => attachmentFromFile(file, fallbackName)));
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
  if (message.toLowerCase().includes("official pdf generation failed")) return "PDF Generation Failure";
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

async function serverGeneratedOfficialPdf(kind: "athlete" | "nationalId", application: ApplicationData) {
  try {
    const templatePath = kind === "athlete" ? athleteLicenseTemplatePath : nationalIdTemplatePath;
    const templateBytes = await readPublicTemplate(templatePath);
    const pdfBytes =
      kind === "athlete"
        ? await generateAthleteLicensePdf(templateBytes, application)
        : await generateNationalIdPdf(templateBytes, application);

    return {
      filename: kind === "athlete" ? "completed-athlete-license.pdf" : "completed-national-mma-id.pdf",
      content: Buffer.from(pdfBytes),
      contentType: "application/pdf"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PDF generation error.";
    throw new Error(`Official PDF generation failed: ${message}`);
  }
}

async function readPublicTemplate(templatePath: string) {
  const relativePath = templatePath.replace(/^\/+/, "");
  const file = await readFile(path.join(process.cwd(), "public", ...relativePath.split("/")));
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}

async function signatureCertificateAttachment({
  submissionId,
  submittedAt,
  application,
  certifiedDocuments,
  ipAddress,
  approximateIpLocation
}: {
  submissionId: string;
  submittedAt: Date;
  application: ApplicationData;
  certifiedDocuments: string[];
  ipAddress: string;
  approximateIpLocation: ApproximateIpLocation;
}) {
  try {
    const certificateBytes = await generateSignatureCertificatePdf({
      submissionId,
      submittedAt,
      application,
      certifiedDocuments,
      ipAddress,
      approximateIpLocation
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

function clientIpFromHeaders(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "Unavailable";
  return headers.get("x-real-ip") || "Unavailable";
}

function approximateIpLocationFromHeaders(headers: Headers): ApproximateIpLocation {
  const city = decodedHeader(headers, "x-vercel-ip-city");
  const region = decodedHeader(headers, "x-vercel-ip-country-region");
  const country = decodedHeader(headers, "x-vercel-ip-country");
  const latitude = decodedHeader(headers, "x-vercel-ip-latitude");
  const longitude = decodedHeader(headers, "x-vercel-ip-longitude");
  const postalCode = decodedHeader(headers, "x-vercel-ip-postal-code");
  const display = [city, region, country].filter(Boolean).join(", ") || "Unavailable";

  return {
    display,
    ...(latitude ? { latitude } : {}),
    ...(longitude ? { longitude } : {}),
    ...(postalCode ? { postalCode } : {})
  };
}

function decodedHeader(headers: Headers, name: string) {
  const value = headers.get(name);
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function outgoingAttachmentCount({
  athletePdf,
  nationalIdPdf,
  signatureCertificatePdf,
  uploads
}: {
  athletePdf?: { content: Buffer };
  nationalIdPdf?: { content: Buffer };
  signatureCertificatePdf?: { content: Buffer };
  uploads: Partial<Record<UploadKey, Array<{ content: Buffer }>>>;
}) {
  return [
    athletePdf,
    nationalIdPdf,
    signatureCertificatePdf,
    ...Object.values(uploads).flat()
  ].filter(Boolean).length;
}

function outgoingAttachmentBytes({
  athletePdf,
  nationalIdPdf,
  signatureCertificatePdf,
  uploads
}: {
  athletePdf?: { content: Buffer };
  nationalIdPdf?: { content: Buffer };
  signatureCertificatePdf?: { content: Buffer };
  uploads: Partial<Record<UploadKey, Array<{ content: Buffer }>>>;
}) {
  return [
    athletePdf,
    nationalIdPdf,
    signatureCertificatePdf,
    ...Object.values(uploads).flat()
  ].reduce((total, attachment) => total + (attachment?.content.length || 0), 0);
}
