import { Resend } from "resend";
import type { ApplicationData } from "@/lib/types";
import { fullName, requirementLabels, type UploadKey } from "@/lib/types";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SubmissionEmailPayload = {
  application: ApplicationData;
  athletePdf?: EmailAttachment;
  nationalIdPdf?: EmailAttachment;
  uploads: Partial<Record<UploadKey, EmailAttachment[]>>;
};

type SubmissionEmailMessage = {
  kind: "application" | "medical";
  to: string;
  subject: string;
  text: string;
  attachments: EmailAttachment[];
};

export class NoSelectedEmailAttachmentsError extends Error {
  constructor() {
    super("No selected requirements have valid attachments to send.");
    this.name = "NoSelectedEmailAttachmentsError";
  }
}

export async function sendApplicationEmails(payload: SubmissionEmailPayload) {
  const betaMode = process.env.BETA_MODE !== "false";
  const hasSelectedAttachments = buildSubmissionEmailMessages(payload, {
    applicationRecipient: "",
    medicalRecipient: "",
    betaMode
  }).length > 0;
  if (!hasSelectedAttachments) throw new NoSelectedEmailAttachmentsError();

  const resend = new Resend(requiredEnv("RESEND_API_KEY"));
  const from = requiredEnv("EMAIL_FROM");
  const applicationRecipient = requiredEnv("LICENSE_EMAIL_TO");
  const medicalRecipient = requiredEnv("MEDICAL_EMAIL_TO");

  const messages = buildSubmissionEmailMessages(payload, {
    applicationRecipient,
    medicalRecipient,
    betaMode
  });

  await Promise.all(messages.map((message) => sendResendEmail(resend, {
    from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    attachments: message.attachments
  })));

  return {
    applicationRecipient: messages.some((message) => message.kind === "application") ? applicationRecipient : null,
    medicalRecipient: messages.some((message) => message.kind === "medical") ? medicalRecipient : null,
    betaMode
  };
}

export function buildSubmissionEmailMessages(
  payload: SubmissionEmailPayload,
  {
    applicationRecipient,
    medicalRecipient,
    betaMode
  }: {
    applicationRecipient: string;
    medicalRecipient: string;
    betaMode: boolean;
  }
) {
  const name = fullName(payload.application);
  const requirementsNeeded = payload.application.requirementsNeeded || [];
  const applicationAttachments = [
    ...(requirementsNeeded.includes("athleteLicenseApplication") && payload.athletePdf ? [payload.athletePdf] : []),
    ...(requirementsNeeded.includes("nationalMmaIdApplication") && payload.nationalIdPdf ? [payload.nationalIdPdf] : []),
    ...(requirementsNeeded.includes("headshot") ? payload.uploads.headshot || [] : []),
    ...(requirementsNeeded.includes("photoId") ? payload.uploads.photoId || [] : [])
  ];
  const medicalAttachments = [
    ...(requirementsNeeded.includes("bloodwork") ? payload.uploads.bloodwork || [] : []),
    ...(requirementsNeeded.includes("physical") ? payload.uploads.physical || [] : [])
  ];
  const messages: SubmissionEmailMessage[] = [];

  if (applicationAttachments.length) {
    messages.push({
      kind: "application",
      to: applicationRecipient,
      subject: `CAMO Application Documents - ${name}`,
      text: buildApplicationEmailBody(payload.application, betaMode),
      attachments: applicationAttachments
    });
  }

  if (medicalAttachments.length) {
    messages.push({
      kind: "medical",
      to: medicalRecipient,
      subject: `CAMO Medical Documents - ${name}`,
      text: buildMedicalEmailBody(payload.application, betaMode),
      attachments: medicalAttachments
    });
  }

  return messages;
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

function buildApplicationEmailBody(application: ApplicationData, betaMode: boolean) {
  return [
    `Applicant name: ${fullName(application)}`,
    `Date of birth: ${application.birthDate}`,
    `Email: ${application.email}`,
    `Phone: ${application.phone}`,
    `Requirements selected for submission: ${selectedRequirementLabels(application)}`,
    "",
    "Attached are the selected CAMO application documents and identification documents.",
    "",
    routingNote(betaMode)
  ].join("\n");
}

function buildMedicalEmailBody(application: ApplicationData, betaMode: boolean) {
  return [
    `Applicant name: ${fullName(application)}`,
    `Date of birth: ${application.birthDate}`,
    `Email: ${application.email}`,
    `Phone: ${application.phone}`,
    `Requirements selected for submission: ${selectedRequirementLabels(application)}`,
    "",
    "Attached are the selected medical documents.",
    "",
    routingNote(betaMode)
  ].join("\n");
}

function selectedRequirementLabels(application: ApplicationData) {
  return (application.requirementsNeeded || []).map((key) => requirementLabels[key]).join(", ") || "None";
}

function routingNote(betaMode: boolean) {
  return betaMode
    ? "Routing note: This submission was sent using beta/testing routing."
    : "Routing note: Production recipient routing was used.";
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required email environment variable: ${name}`);
  return value;
}
