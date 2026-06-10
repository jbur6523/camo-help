import { NextResponse } from "next/server";
import { NoSelectedEmailAttachmentsError, sendApplicationEmails, SubmissionEmailDeliveryError } from "@/lib/email/sendApplicationEmails";
import {
  sendSupportErrorNotification,
  sendSupportFighterSubmissionNotification
} from "@/lib/email/supportNotifications";
import { createSubmissionReferenceId } from "@/lib/submission/referenceId";
import { assertRequiredUploadsPresent, MissingRequiredUploadsError } from "@/lib/submission/validateRequiredUploads";
import type { ApplicationData, UploadKey } from "@/lib/types";
import { fullName } from "@/lib/types";

export const runtime = "nodejs";

const uploadKeys: UploadKey[] = ["bloodwork", "physical", "headshot", "photoId", "cardio", "additional"];
const submissionIdTtlMs = 10 * 60 * 1000;
const processedSubmissionIds = new Map<string, number>();

export async function POST(request: Request) {
  let submissionId = "unknown";
  let applicationForError: ApplicationData | null = null;
  try {
    const formData = await request.formData();
    const submittedId = formData.get("submissionId");
    submissionId = typeof submittedId === "string" && submittedId.trim() ? submittedId.trim() : createSubmissionReferenceId();
    pruneProcessedSubmissionIds();
    console.info("API submission request received.", { submissionId });

    if (processedSubmissionIds.has(submissionId)) {
      console.warn("Duplicate API submission skipped.", { submissionId });
      return NextResponse.json({ ok: true, duplicate: true, submissionId });
    }

    processedSubmissionIds.set(submissionId, Date.now());

    const applicationJson = formData.get("application");
    if (typeof applicationJson !== "string") {
      throw new Error("Application payload is missing.");
    }

    const application = JSON.parse(applicationJson) as ApplicationData;
    applicationForError = application;
    const athletePdf = await attachmentFromForm(formData, "athletePdf", "completed-athlete-license.pdf");
    const nationalIdPdf = await attachmentFromForm(formData, "nationalIdPdf", "completed-national-mma-id.pdf");
    const requirementsNeeded = application.requirementsNeeded || [];

    if (requirementsNeeded.includes("athleteLicenseApplication") && !athletePdf) {
      return NextResponse.json({ error: "Completed Athlete License PDF is missing." }, { status: 400 });
    }

    if (requirementsNeeded.includes("nationalMmaIdApplication") && !nationalIdPdf) {
      return NextResponse.json({ error: "Completed National MMA ID PDF is missing." }, { status: 400 });
    }

    const uploads: Record<string, Awaited<ReturnType<typeof attachmentsFromForm>>> = {};
    for (const key of uploadKeys) {
      uploads[key] = await attachmentsFromForm(formData, key);
    }

    assertRequiredUploadsPresent(application, uploads);

    const submittedAt = new Date();
    const result = await sendApplicationEmails({
      submissionId,
      application,
      athletePdf,
      nationalIdPdf,
      uploads
    });

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
      promoterNotificationSent: Boolean(result.promoterRecipient)
    });

    return NextResponse.json({ ok: true, submissionId, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Submission failed.";
    const isPartial = error instanceof SubmissionEmailDeliveryError && error.sentKinds.length > 0;
    console.error("API submission failed.", { submissionId, error: message });
    await sendSupportErrorNotification({
      errorType: classifySubmissionError(message, error),
      source: "app/api/submit-application POST",
      message,
      operation: "Complete fighter document submission",
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
        failureKind: isPartial ? "partial" : "failed"
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
  if (message.startsWith("Missing required email environment variable")) return "Missing Required Environment Variable";
  if (message.startsWith("Resend email failed")) return "Email Sending Failure";
  if (message.toLowerCase().includes("formdata") || message.toLowerCase().includes("file")) return "Upload Parsing Failure";
  return "Fighter Submission Failure";
}
