import { Resend } from "resend";
import { independentPromoterId } from "@/lib/promoters/constants";
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
    medicalRecipient
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
      subject: `Submission: ${name} - ${formatEmailDate(new Date())}`,
      text: buildApplicationEmailBody(payload.application, applicationAttachments),
      attachments: applicationAttachments
    });
  }

  if (medicalAttachments.length) {
    messages.push({
      kind: "medical",
      to: medicalRecipient,
      subject: buildMedicalEmailSubject(name, payload.uploads),
      text: buildMedicalEmailBody(payload.application, payload.uploads),
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

function buildApplicationEmailBody(application: ApplicationData, applicationAttachments: EmailAttachment[]) {
  return [
    complianceContactLine(application.email),
    "",
    `Applicant: ${fullName(application)}`,
    `Email: ${application.email}`,
    `DOB: ${application.birthDate}`,
    "",
    "Requirements Submitted:",
    "",
    ...applicationRequirementLines(application, applicationAttachments)
  ].join("\n");
}

function buildMedicalEmailBody(application: ApplicationData, uploads: Partial<Record<UploadKey, EmailAttachment[]>>) {
  return [
    complianceContactLine(application.email),
    "",
    `Applicant: ${fullName(application)}`,
    `Email: ${application.email}`,
    `DOB: ${application.birthDate}`,
    "",
    "Requirements Submitted:",
    "",
    ...medicalRequirementLines(uploads)
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

function complianceContactLine(fighterEmail: string) {
  return `This is being submitted by a third-party service. For issues of non-compliance, please reply all to this email or contact the fighter directly at ${fighterEmail}.`;
}

function applicationRequirementLines(application: ApplicationData, applicationAttachments: EmailAttachment[]) {
  const requirementsNeeded = application.requirementsNeeded || [];
  const lines = [
    ...(requirementsNeeded.includes("athleteLicenseApplication") ? ["* Athlete License Application"] : []),
    ...(requirementsNeeded.includes("nationalMmaIdApplication") ? ["* National MMA ID Application"] : [])
  ];

  if (lines.length) return lines;
  return applicationAttachments.map((attachment) => `* ${attachment.filename}`);
}

function buildMedicalEmailSubject(name: string, uploads: Partial<Record<UploadKey, EmailAttachment[]>>) {
  const hasBloodwork = Boolean(uploads.bloodwork?.length);
  const hasPhysical = Boolean(uploads.physical?.length);

  if (hasBloodwork && hasPhysical) return `Submission: ${name} - Blood Work & Physical Exam`;
  if (hasBloodwork) return `Submission: ${name} - Blood Work`;
  if (hasPhysical) return `Submission: ${name} - Physical Exam`;
  return `Submission: ${name} - Medical Documents`;
}

function medicalRequirementLines(uploads: Partial<Record<UploadKey, EmailAttachment[]>>) {
  return [
    ...(uploads.bloodwork?.length ? ["* Blood Work"] : []),
    ...(uploads.physical?.length ? ["* Physical Exam"] : []),
    ...(uploads.cardio?.length ? ["* Cardio/EKG"] : [])
  ];
}

function formatEmailDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles"
  }).format(date);
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required email environment variable: ${name}`);
  return value;
}
