import { Resend } from "resend";
import type { ApplicationData } from "@/lib/types";
import { fullName, uploadLabels, type UploadKey } from "@/lib/types";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SubmissionEmailPayload = {
  application: ApplicationData;
  athletePdf: EmailAttachment;
  nationalIdPdf: EmailAttachment;
  uploads: Partial<Record<UploadKey, EmailAttachment[]>>;
};

export async function sendApplicationEmails(payload: SubmissionEmailPayload) {
  const betaMode = process.env.BETA_MODE !== "false";
  const resend = new Resend(requiredEnv("RESEND_API_KEY"));
  const from = requiredEnv("EMAIL_FROM");
  const applicationRecipient = requiredEnv("LICENSE_EMAIL_TO");
  const medicalRecipient = requiredEnv("MEDICAL_EMAIL_TO");

  const name = fullName(payload.application);
  const summary = buildSummary(payload.application, payload.uploads, betaMode);

  await sendResendEmail(resend, {
    from,
    to: applicationRecipient,
    subject: `CAMO Application Documents - ${name}`,
    text: summary,
    attachments: [
      payload.athletePdf,
      payload.nationalIdPdf,
      ...(payload.uploads.headshot || []),
      ...(payload.uploads.photoId || []),
      ...(payload.uploads.additional || [])
    ]
  });

  await sendResendEmail(resend, {
    from,
    to: medicalRecipient,
    subject: `CAMO Medical Documents - ${name}`,
    text: summary,
    attachments: [
      ...(payload.uploads.bloodwork || []),
      ...(payload.uploads.physical || []),
      ...(payload.uploads.cardio || [])
    ]
  });

  return { applicationRecipient, medicalRecipient, betaMode };
}

async function sendResendEmail(
  resend: Resend,
  email: {
    from: string;
    to: string;
    subject: string;
    text: string;
    attachments: EmailAttachment[];
  }
) {
  const { error } = await resend.emails.send({
    from: email.from,
    to: email.to,
    subject: email.subject,
    text: email.text,
    attachments: email.attachments.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.contentType
    }))
  });

  if (error) {
    throw new Error(`Resend email failed: ${error.message}`);
  }
}

function buildSummary(application: ApplicationData, uploads: Partial<Record<UploadKey, EmailAttachment[]>>, betaMode: boolean) {
  const uploadedList = (Object.keys(uploadLabels) as UploadKey[])
    .filter((key) => uploads[key]?.length)
    .flatMap((key) => (uploads[key] || []).map((file) => `- ${uploadLabels[key]}: ${file.filename}`))
    .join("\n");

  return [
    `Applicant name: ${fullName(application)}`,
    `Date of birth: ${application.birthDate}`,
    `Email: ${application.email}`,
    `Phone: ${application.phone}`,
    `Athlete License type: ${application.athleteLicenseType}`,
    `National MMA ID type: ${application.nationalIdType}`,
    "",
    "Uploaded files:",
    uploadedList || "- None",
    "",
    betaMode ? "Routing note: This submission was sent using beta/testing routing." : "Routing note: Production recipient routing was used."
  ].join("\n");
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required email environment variable: ${name}`);
  return value;
}
