import { NextResponse } from "next/server";
import { NoSelectedEmailAttachmentsError, sendApplicationEmails } from "@/lib/email/sendApplicationEmails";
import {
  sendSupportErrorNotification,
  sendSupportFighterSubmissionNotification
} from "@/lib/email/supportNotifications";
import { assertRequiredUploadsPresent, MissingRequiredUploadsError } from "@/lib/submission/validateRequiredUploads";
import type { ApplicationData, UploadKey } from "@/lib/types";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const uploadKeys: UploadKey[] = ["bloodwork", "physical", "headshot", "photoId", "cardio", "additional"];
const submissionIdTtlMs = 10 * 60 * 1000;
const processedSubmissionIds = new Map<string, number>();

export async function POST(request: Request) {
  let submissionId = "unknown";
  try {
    const formData = await request.formData();
    const submittedId = formData.get("submissionId");
    submissionId = typeof submittedId === "string" && submittedId.trim() ? submittedId.trim() : randomUUID();
    pruneProcessedSubmissionIds();
    console.info("API submission request received.", { submissionId });

    if (processedSubmissionIds.has(submissionId)) {
      console.warn("Duplicate API submission skipped.", { submissionId });
      return NextResponse.json({ ok: true, duplicate: true, submissionId });
    }

    processedSubmissionIds.set(submissionId, Date.now());

    const applicationJson = formData.get("application");
    if (typeof applicationJson !== "string") {
      return NextResponse.json({ error: "Application payload is missing." }, { status: 400 });
    }

    const application = JSON.parse(applicationJson) as ApplicationData;
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
      applicationEmailSent: Boolean(result.applicationRecipient),
      medicalEmailSent: Boolean(result.medicalRecipient),
      promoterNotificationSent: Boolean(result.promoterRecipient)
    });

    return NextResponse.json({ ok: true, submissionId, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Submission failed.";
    console.error("API submission failed.", { submissionId, error: message });
    if (!(error instanceof NoSelectedEmailAttachmentsError) && !(error instanceof MissingRequiredUploadsError)) {
      await sendSupportErrorNotification({
        errorType: classifySubmissionError(message),
        source: "app/api/submit-application POST",
        message,
        operation: "Complete fighter document submission",
        submissionId
      });
    }
    return NextResponse.json(
      { error: message },
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

function classifySubmissionError(message: string) {
  if (message.startsWith("Missing required email environment variable")) return "Missing Required Environment Variable";
  if (message.startsWith("Resend email failed")) return "Email Sending Failure";
  if (message.toLowerCase().includes("formdata") || message.toLowerCase().includes("file")) return "Upload Parsing Failure";
  return "Fighter Submission Failure";
}
