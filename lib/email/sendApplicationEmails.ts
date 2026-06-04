import nodemailer from "nodemailer";
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
  const applicationRecipient = betaMode
    ? process.env.APPLICATION_EMAIL_BETA
    : process.env.APPLICATION_EMAIL_PROD;
  const medicalRecipient = betaMode ? process.env.MEDICAL_EMAIL_BETA : process.env.MEDICAL_EMAIL_PROD;

  if (!applicationRecipient || !medicalRecipient) {
    throw new Error("Email recipients are not configured.");
  }

  const transporter = nodemailer.createTransport({
    host: requiredEnv("SMTP_HOST"),
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: requiredEnv("SMTP_USER"),
      pass: requiredEnv("SMTP_PASS")
    }
  });

  const name = fullName(payload.application);
  const summary = buildSummary(payload.application, payload.uploads);
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
    from,
    to: applicationRecipient,
    subject: `CAMO Application Documents - ${name}`,
    text: summary,
    attachments: [
      payload.athletePdf,
      payload.nationalIdPdf,
      ...(payload.uploads.headshot || []),
      ...(payload.uploads.photoId || [])
    ]
  });

  await transporter.sendMail({
    from,
    to: medicalRecipient,
    subject: `CAMO Medical Documents - ${name}`,
    text: summary,
    attachments: [
      ...(payload.uploads.bloodwork || []),
      ...(payload.uploads.physical || []),
      ...(payload.uploads.cardio || []),
      ...(payload.uploads.additional || [])
    ]
  });

  return { applicationRecipient, medicalRecipient, betaMode };
}

function buildSummary(application: ApplicationData, uploads: Partial<Record<UploadKey, EmailAttachment[]>>) {
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
    uploadedList || "- None"
  ].join("\n");
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}
