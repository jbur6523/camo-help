import { Resend } from "resend";
import { independentPromoterId, independentPromotionName } from "@/lib/promoters/constants";
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

  const promoterRecipient = await sendPromoterNotificationEmail(resend, from, payload.application);

  return {
    applicationRecipient: messages.some((message) => message.kind === "application") ? applicationRecipient : null,
    medicalRecipient: messages.some((message) => message.kind === "medical") ? medicalRecipient : null,
    promoterRecipient,
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
    ...(requirementsNeeded.includes("physical") ? payload.uploads.physical || [] : []),
    ...(requirementsNeeded.includes("cardio") ? payload.uploads.cardio || [] : [])
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

async function sendPromoterNotificationEmail(resend: Resend, from: string, application: ApplicationData) {
  const selectedPromoterId = application.selectedPromoterId;
  if (!selectedPromoterId || selectedPromoterId === independentPromoterId) return null;

  try {
    const { createSupabaseServiceRoleClient } = await import("@/lib/supabase/server");
    const supabase = createSupabaseServiceRoleClient();
    const { data: promoter, error } = await supabase
      .from("promoters")
      .select("id, promotion_name, email, status")
      .eq("id", selectedPromoterId)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      console.warn(`Promoter notification skipped: ${error.message}`);
      return null;
    }

    if (!promoter || promoter.status !== "active" || !promoter.email) {
      console.warn(`Promoter notification skipped: selected promoter is not active (${selectedPromoterId}).`);
      return null;
    }

    const { error: emailError } = await resend.emails.send({
      from,
      to: promoter.email,
      subject: `New Fighter Submission - ${fullName(application)}`,
      text: buildPromoterNotificationBody(application, new Date())
    });

    if (emailError) {
      console.warn(`Promoter notification email failed: ${emailError.message}`);
      return null;
    }

    return promoter.email as string;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown promoter notification error.";
    console.warn(`Promoter notification skipped: ${message}`);
    return null;
  }
}

function buildApplicationEmailBody(application: ApplicationData, betaMode: boolean) {
  return [
    `Applicant name: ${fullName(application)}`,
    `Date of birth: ${application.birthDate}`,
    `Email: ${application.email}`,
    `Phone: ${application.phone}`,
    `Selected promotion: ${selectedPromotionName(application)}`,
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
    `Selected promotion: ${selectedPromotionName(application)}`,
    `Requirements selected for submission: ${selectedRequirementLabels(application)}`,
    "",
    "Attached are the selected medical documents.",
    "",
    routingNote(betaMode)
  ].join("\n");
}

export function buildPromoterNotificationBody(application: ApplicationData, submittedAt: Date) {
  return [
    `Fighter name: ${fullName(application)}`,
    `Fighter email: ${application.email}`,
    `Fighter phone: ${application.phone}`,
    `Date of birth: ${application.birthDate}`,
    `Requirements submitted: ${selectedRequirementLabels(application)}`,
    `Submission date/time: ${submittedAt.toISOString()}`,
    "",
    "No medical documents, IDs, headshots, or PDFs are included in this promoter notification."
  ].join("\n");
}

function selectedRequirementLabels(application: ApplicationData) {
  return (application.requirementsNeeded || []).map((key) => requirementLabels[key]).join(", ") || "None";
}

function selectedPromotionName(application: ApplicationData) {
  return application.selectedPromotionName || independentPromotionName;
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
