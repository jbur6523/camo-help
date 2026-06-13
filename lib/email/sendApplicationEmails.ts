import { Resend } from "resend";
import { formatPacificDateTime, formatPacificLongDate } from "@/lib/dates";
import { safeErrorMessage, sendSupportErrorNotification } from "@/lib/email/supportNotifications";
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
  signatureCertificatePdf?: EmailAttachment;
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

export class SubmissionEmailDeliveryError extends Error {
  failedKind: SubmissionEmailMessage["kind"];
  sentKinds: SubmissionEmailMessage["kind"][];

  constructor({
    failedKind,
    sentKinds,
    message
  }: {
    failedKind: SubmissionEmailMessage["kind"];
    sentKinds: SubmissionEmailMessage["kind"][];
    message: string;
  }) {
    super(message);
    this.name = "SubmissionEmailDeliveryError";
    this.failedKind = failedKind;
    this.sentKinds = sentKinds;
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
  const sentKinds: SubmissionEmailMessage["kind"][] = [];

  for (const [index, message] of messages.entries()) {
    if (index > 0) await delay(submissionEmailSendDelayMs);
    console.info("Submission email send attempted.", {
      submissionId,
      kind: message.kind,
      timestamp: new Date().toISOString(),
      attachmentCount: message.attachments.length
    });
    let resendMessageId: string | null;
    try {
      resendMessageId = await sendResendEmail(resend, {
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        attachments: message.attachments
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Submission email failed.";
      console.warn("Submission email send failed.", {
        submissionId,
        kind: message.kind,
        timestamp: new Date().toISOString(),
        error: safeErrorMessage(errorMessage)
      });
      throw new SubmissionEmailDeliveryError({
        failedKind: message.kind,
        sentKinds,
        message: errorMessage
      });
    }
    resendMessageIds[message.kind] = resendMessageId;
    sentKinds.push(message.kind);
    console.info("Submission email send completed.", {
      submissionId,
      kind: message.kind,
      timestamp: new Date().toISOString(),
      resendMessageId
    });
  }

  const fighterConfirmationRecipient = await sendFighterConfirmationEmail(resend, from, payload.application, submissionId);

  return {
    applicationRecipient: messages.some((message) => message.kind === "application") ? applicationRecipient : null,
    medicalRecipient: messages.some((message) => message.kind === "medical") ? medicalRecipient : null,
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
    ...(payload.signatureCertificatePdf ? [payload.signatureCertificatePdf] : []),
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
      text: buildApplicationEmailBody(payload.application, applicationAttachments, payload.submissionId),
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

export async function sendPromoterNotificationEmail(application: ApplicationData, submissionId: string, submittedAt = new Date()) {
  const selectedPromoterId = application.selectedPromoterId;
  if (!selectedPromoterId || selectedPromoterId === independentPromoterId) return null;

  try {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
      console.warn("Promoter notification skipped: required email environment is missing.", {
        submissionId,
        timestamp: new Date().toISOString()
      });
      await sendSupportErrorNotification({
        errorType: "Missing Required Environment Variable",
        source: "sendPromoterNotificationEmail",
        message: "RESEND_API_KEY or EMAIL_FROM is not configured.",
        operation: "Send promoter fighter-submission notification",
        submissionId
      });
      return null;
    }

    const resend = new Resend(apiKey);
    const { createSupabaseServiceRoleClient } = await import("@/lib/supabase/server");
    const supabase = createSupabaseServiceRoleClient();
    const { data: promoter, error } = await supabase
      .from("promoters")
      .select("id, promotion_name, email, status")
      .eq("id", selectedPromoterId)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      console.warn("Promoter notification skipped.", {
        submissionId,
        timestamp: new Date().toISOString(),
        error: safeErrorMessage(error.message)
      });
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
      console.warn("Promoter notification skipped: selected promoter is not active.", {
        submissionId,
        selectedPromoterId,
        timestamp: new Date().toISOString()
      });
      return null;
    }

    console.info("Promoter notification send attempted.", {
      submissionId,
      timestamp: new Date().toISOString()
    });
    const { data, error: emailError } = await resend.emails.send({
      from,
      to: promoter.email,
      subject: `New Fighter Submission - ${fullName(application)}`,
      text: buildPromoterNotificationBody(application, submittedAt, submissionId)
    });

    if (emailError) {
      console.warn("Promoter notification email failed.", {
        submissionId,
        timestamp: new Date().toISOString(),
        error: safeErrorMessage(emailError.message)
      });
      await sendSupportErrorNotification({
        errorType: "Email Sending Failure",
        source: "sendPromoterNotificationEmail",
        message: emailError.message,
        operation: "Send promoter fighter-submission notification",
        submissionId
      });
      return null;
    }

    console.info("Promoter notification send completed.", {
      submissionId,
      timestamp: new Date().toISOString(),
      resendMessageId: data?.id || null
    });
    return promoter.email as string;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown promoter notification error.";
    console.warn("Promoter notification skipped.", {
      submissionId,
      timestamp: new Date().toISOString(),
      error: safeErrorMessage(message)
    });
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
    console.info("Fighter confirmation email send attempted.", {
      submissionId,
      timestamp: new Date().toISOString()
    });
    const { data, error } = await resend.emails.send({
      from,
      to: application.email,
      subject: "CAMO Help Submission Received",
      text: [
        `Hi ${application.firstName || "there"},`,
        "",
        "Your selected documents have been submitted by email.",
        `Reference ID: ${submissionId}`,
        "",
        "Submitted documents:",
        ...selectedSubmissionLines(application),
        "",
        "This is an automated message. Please do not reply to this email."
      ].join("\n")
    });

    if (error) {
      console.warn("Fighter confirmation email failed.", {
        submissionId,
        timestamp: new Date().toISOString(),
        error: safeErrorMessage(error.message)
      });
      await sendSupportErrorNotification({
        errorType: "Email Sending Failure",
        source: "sendFighterConfirmationEmail",
        message: error.message,
        operation: "Send fighter submission confirmation email",
        submissionId
      });
      return null;
    }

    console.info("Fighter confirmation email send completed.", {
      submissionId,
      timestamp: new Date().toISOString(),
      resendMessageId: data?.id || null
    });
    return application.email;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fighter confirmation email error.";
    console.warn("Fighter confirmation email failed.", {
      submissionId,
      timestamp: new Date().toISOString(),
      error: safeErrorMessage(message)
    });
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

function buildApplicationEmailBody(application: ApplicationData, applicationAttachments: EmailAttachment[], submissionId?: string) {
  return [
    complianceContactLine(application.email),
    "",
    `Applicant: ${fullName(application)}`,
    `Email: ${application.email}`,
    `DOB: ${application.birthDate}`,
    `Reference ID: ${submissionId || "Not assigned"}`,
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

export function buildPromoterNotificationBody(application: ApplicationData, submittedAt: Date, submissionId?: string) {
  return [
    "New Fighter Submission",
    "",
    "A fighter selected your promotion during their CAMO Help submission.",
    "",
    "Fighter Contact",
    "",
    `Fighter name: ${fullName(application)}`,
    `Fighter email: ${application.email || "Not provided"}`,
    `Fighter phone: ${application.phone || "Not provided"}`,
    "",
    "Submission Details",
    "",
    `Date of birth: ${application.birthDate || "Not provided"}`,
    `Submission date/time: ${formatPacificDateTime(submittedAt)}`,
    `Reference ID: ${submissionId || "Not assigned"}`,
    "",
    "Requirements Submitted:",
    "",
    ...selectedRequirementLines(application)
  ].join("\n");
}

function selectedRequirementLines(application: ApplicationData) {
  const lines = (application.requirementsNeeded || []).map((key) => `- ${requirementLabels[key]}`);
  return lines.length ? lines : ["- None selected"];
}

function complianceContactLine(fighterEmail: string) {
  return `This is being submitted by a third-party service. For issues of non-compliance, please contact the fighter directly at ${fighterEmail}.`;
}

function applicationRequirementLines(application: ApplicationData, applicationAttachments: EmailAttachment[]) {
  const requirementsNeeded = application.requirementsNeeded || [];
  const lines = [
    ...(requirementsNeeded.includes("athleteLicenseApplication") ? ["* Athlete License Application"] : []),
    ...(requirementsNeeded.includes("nationalMmaIdApplication") ? ["* National MMA ID Application"] : []),
    ...(requirementsNeeded.includes("photoId") ? ["* Driver's License / Government-Issued ID"] : []),
    ...(requirementsNeeded.includes("headshot") ? ["* Headshot / Face Photo"] : [])
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
