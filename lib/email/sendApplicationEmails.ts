import { Resend } from "resend";
import { formatPacificDateTime, formatPacificLongDate } from "@/lib/dates";
import { sendSupportErrorNotification } from "@/lib/email/supportNotifications";
import { independentPromoterId } from "@/lib/promoters/constants";
import type { ApplicationData } from "@/lib/types";
import { fullName, requirementLabels, type UploadKey } from "@/lib/types";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SubmissionEmailPayload = {
  submissionId?: string;
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

const submissionEmailSendDelayMs = 2000;

export class NoSelectedEmailAttachmentsError extends Error {
  constructor() {
    super("No selected requirements have valid attachments to send.");
    this.name = "NoSelectedEmailAttachmentsError";
  }
}

export async function sendApplicationEmails(payload: SubmissionEmailPayload) {
  const submissionId = payload.submissionId || "unknown";
  console.info("sendApplicationEmails started.", { submissionId });
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
  const resendMessageIds: Partial<Record<SubmissionEmailMessage["kind"], string | null>> = {};

  for (const [index, message] of messages.entries()) {
    if (index > 0) await delay(submissionEmailSendDelayMs);
    console.info("Submission email send attempted.", {
      submissionId,
      kind: message.kind,
      attachmentCount: message.attachments.length
    });
    const resendMessageId = await sendResendEmail(resend, {
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      attachments: message.attachments
    });
    resendMessageIds[message.kind] = resendMessageId;
    console.info("Submission email send completed.", {
      submissionId,
      kind: message.kind,
      resendMessageId
    });
  }

  const promoterRecipient = await sendPromoterNotificationEmail(resend, from, payload.application, submissionId);
  const fighterConfirmationRecipient = await sendFighterConfirmationEmail(resend, from, payload.application, submissionId);

  return {
    applicationRecipient: messages.some((message) => message.kind === "application") ? applicationRecipient : null,
    medicalRecipient: messages.some((message) => message.kind === "medical") ? medicalRecipient : null,
    promoterRecipient,
    fighterConfirmationRecipient,
    resendMessageIds,
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
  const uploadedMedicalAttachments = [
    ...(payload.uploads.bloodwork || []),
    ...(payload.uploads.physical || []),
    ...(payload.uploads.cardio || [])
  ];
  const medicalAttachments = [
    ...uploadedMedicalAttachments,
    ...(uploadedMedicalAttachments.length ? payload.uploads.additional || [] : [])
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
  const { data, error } = await resend.emails.send({
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

  return data?.id || null;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function sendPromoterNotificationEmail(resend: Resend, from: string, application: ApplicationData, submissionId: string) {
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
      await sendSupportErrorNotification({
        errorType: "Supabase Promoter Fetch Failure",
        source: "sendPromoterNotificationEmail",
        message: error.message,
        operation: "Fetch selected promoter for fighter notification",
        submissionId
      });
      return null;
    }

    if (!promoter || promoter.status !== "active" || !promoter.email) {
      console.warn(`Promoter notification skipped: selected promoter is not active (${selectedPromoterId}).`);
      return null;
    }

    console.info("Promoter notification send attempted.", { submissionId });
    const { data, error: emailError } = await resend.emails.send({
      from,
      to: promoter.email,
      subject: `New Fighter Submission - ${fullName(application)}`,
      text: buildPromoterNotificationBody(application, new Date())
    });

    if (emailError) {
      console.warn(`Promoter notification email failed: ${emailError.message}`);
      await sendSupportErrorNotification({
        errorType: "Email Sending Failure",
        source: "sendPromoterNotificationEmail",
        message: emailError.message,
        operation: "Send promoter fighter-submission notification",
        submissionId
      });
      return null;
    }

    console.info("Promoter notification send completed.", { submissionId, resendMessageId: data?.id || null });
    return promoter.email as string;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown promoter notification error.";
    console.warn(`Promoter notification skipped: ${message}`);
    await sendSupportErrorNotification({
      errorType: "Promoter Notification Failure",
      source: "sendPromoterNotificationEmail",
      message,
      operation: "Send promoter fighter-submission notification",
      submissionId
    });
    return null;
  }
}

async function sendFighterConfirmationEmail(resend: Resend, from: string, application: ApplicationData, submissionId: string) {
  if (!application.email) return null;

  try {
    console.info("Fighter confirmation email send attempted.", { submissionId });
    const { data, error } = await resend.emails.send({
      from,
      to: application.email,
      subject: "CAMO Help Submission Received",
      text: [
        `Hi ${application.firstName || "there"},`,
        "",
        "Your selected documents have been submitted by email.",
        "",
        "Submitted documents:",
        ...selectedSubmissionLines(application),
        "",
        "If you do not receive this email within a few minutes, check your spam folder or contact support@camo-help.com.",
        "",
        "This is an automated message. Please do not reply to this email."
      ].join("\n")
    });

    if (error) {
      console.warn(`Fighter confirmation email failed: ${error.message}`);
      await sendSupportErrorNotification({
        errorType: "Email Sending Failure",
        source: "sendFighterConfirmationEmail",
        message: error.message,
        operation: "Send fighter submission confirmation email",
        submissionId
      });
      return null;
    }

    console.info("Fighter confirmation email send completed.", { submissionId, resendMessageId: data?.id || null });
    return application.email;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fighter confirmation email error.";
    console.warn(`Fighter confirmation email failed: ${message}`);
    await sendSupportErrorNotification({
      errorType: "Email Sending Failure",
      source: "sendFighterConfirmationEmail",
      message,
      operation: "Send fighter submission confirmation email",
      submissionId
    });
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
    `Submission date/time: ${formatPacificDateTime(submittedAt)}`,
    "",
    "No medical documents, IDs, headshots, or PDFs are included in this promoter notification."
  ].join("\n");
}

function selectedRequirementLabels(application: ApplicationData) {
  return (application.requirementsNeeded || []).map((key) => requirementLabels[key]).join(", ") || "None";
}

function complianceContactLine(fighterEmail: string) {
  return [
    "This submission was prepared and sent through CAMO Help, an independent document preparation service.",
    "For any issues with this application or submitted paperwork, please contact the fighter directly at:",
    fighterEmail
  ].join("\n");
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
    ...(uploads.cardio?.length ? ["* Cardio/EKG"] : []),
    ...(uploads.additional?.length ? ["* Additional Documentation"] : [])
  ];
}

function selectedSubmissionLines(application: ApplicationData) {
  const requirementsNeeded = application.requirementsNeeded || [];
  const lines = [
    ...(requirementsNeeded.includes("athleteLicenseApplication") ? ["- Athlete License Application"] : []),
    ...(requirementsNeeded.includes("nationalMmaIdApplication") ? ["- National MMA ID Application"] : []),
    ...(requirementsNeeded.includes("bloodwork") ? ["- Blood Work"] : []),
    ...(requirementsNeeded.includes("physical") ? ["- Physical Exam"] : []),
    ...(requirementsNeeded.includes("headshot") ? ["- Headshot Photo"] : []),
    ...(requirementsNeeded.includes("photoId") ? ["- Driver's License / State ID"] : [])
  ];

  return lines.length ? lines : ["- Selected documents"];
}

function formatEmailDate(date: Date) {
  return formatPacificLongDate(date);
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required email environment variable: ${name}`);
  return value;
}
