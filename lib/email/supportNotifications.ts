import { Resend } from "resend";
import { formatPacificDateTime } from "@/lib/dates";
import { independentPromoterId } from "@/lib/promoters/constants";
import type { ApplicationData, UploadKey } from "@/lib/types";
import { fullName, requirementLabels } from "@/lib/types";

type SupportNotification = {
  subject: string;
  text: string;
  source: string;
};

type SupportErrorNotification = {
  errorType: string;
  source: string;
  message: string;
  operation: string;
  submissionId?: string;
};

type PromoterRegistrationSupportPayload = {
  promotionName: string;
  lastPromotionDate: string;
  promoterEmail: string;
  contactName: string;
  websiteUrl: string;
  submittedAt: Date;
};

type PromoterStatusChangeSupportPayload = {
  promotionName: string;
  promoterEmail: string;
  contactName: string;
  oldStatus: string;
  newStatus: string;
  changedAt: Date;
};

type FighterSubmissionSupportPayload = {
  application: ApplicationData;
  uploads: Partial<Record<UploadKey, unknown[]>>;
  submittedAt: Date;
  submissionId: string;
  applicationEmailSent: boolean;
  medicalEmailSent: boolean;
  promoterNotificationSent: boolean;
};

const adminPromotersPath = "/admin/promoters";

export async function sendSupportNotification({ subject, text, source }: SupportNotification) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const to = process.env.SUPPORT_EMAIL_TO;

  if (!to) {
    console.warn("Support notification skipped: SUPPORT_EMAIL_TO is not configured.", { source });
    return null;
  }

  if (!apiKey || !from) {
    console.warn("Support notification skipped: required Resend environment is not configured.", {
      source,
      hasResendApiKey: Boolean(apiKey),
      hasEmailFrom: Boolean(from)
    });
    return null;
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      text
    });

    if (error) {
      console.warn("Support notification failed.", { source, error: error.message });
      return null;
    }

    console.info("Support notification sent.", { source, resendMessageId: data?.id || null });
    return data?.id || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown support notification error.";
    console.warn("Support notification failed.", { source, error: message });
    return null;
  }
}

export async function sendSupportErrorNotification({
  errorType,
  source,
  message,
  operation,
  submissionId
}: SupportErrorNotification) {
  return sendSupportNotification({
    source,
    subject: `CAMO Help Error: ${errorType}`,
    text: [
      `Error type: ${errorType}`,
      `Route/function: ${source}`,
      `Safe error message: ${message}`,
      `Timestamp: ${formatPacificDateTime(new Date())}`,
      `Submission/request ID: ${submissionId || "Not available"}`,
      `Operation failed: ${operation}`
    ].join("\n")
  });
}

export async function sendSupportPromoterRegistrationNotification({
  promotionName,
  lastPromotionDate,
  promoterEmail,
  contactName,
  websiteUrl,
  submittedAt
}: PromoterRegistrationSupportPayload) {
  return sendSupportNotification({
    source: "app/api/promoter-registration POST",
    subject: "New Promoter Registration Pending Review",
    text: [
      `Promotion Name: ${promotionName}`,
      `Date of Last Promotion: ${lastPromotionDate}`,
      `Promoter Name: ${contactName}`,
      `Promoter Email: ${promoterEmail}`,
      `Website / Social Link: ${websiteUrl}`,
      `Submitted date/time: ${formatPacificDateTime(submittedAt)}`,
      "Status: pending",
      `Admin review path: ${adminPromotersPath}`
    ].join("\n")
  });
}

export async function sendSupportPromoterStatusChangeNotification({
  promotionName,
  promoterEmail,
  contactName,
  oldStatus,
  newStatus,
  changedAt
}: PromoterStatusChangeSupportPayload) {
  return sendSupportNotification({
    source: "app/api/admin/promoters/[id] PATCH",
    subject: `${promoterStatusSubjectPrefix(oldStatus, newStatus)}: ${promotionName}`,
    text: [
      `Promotion Name: ${promotionName}`,
      `Promoter Name: ${contactName}`,
      `Promoter Email: ${promoterEmail}`,
      `Old status: ${oldStatus}`,
      `New status: ${newStatus}`,
      `Date/time of change: ${formatPacificDateTime(changedAt)}`,
      `Admin review path: ${adminPromotersPath}`
    ].join("\n")
  });
}

export async function sendSupportFighterSubmissionNotification({
  application,
  uploads,
  submittedAt,
  submissionId,
  applicationEmailSent,
  medicalEmailSent,
  promoterNotificationSent
}: FighterSubmissionSupportPayload) {
  const name = fullName(application);
  return sendSupportNotification({
    source: "app/api/submit-application POST",
    subject: `New Fighter Submission: ${name || "Unknown Fighter"}`,
    text: [
      `Fighter Name: ${name || "Not provided"}`,
      `Fighter Email: ${application.email}`,
      `DOB: ${application.birthDate}`,
      `Selected Promoter: ${selectedPromoterLabel(application)}`,
      "Submission types selected:",
      ...fighterSubmissionTypeLines(application, uploads),
      `Submitted date/time: ${formatPacificDateTime(submittedAt)}`,
      `Submission ID: ${submissionId}`,
      `Application email sent: ${applicationEmailSent ? "yes" : "no"}`,
      `Medical email sent: ${medicalEmailSent ? "yes" : "no"}`,
      `Promoter notification sent: ${promoterNotificationSent ? "yes" : "no"}`
    ].join("\n")
  });
}

function promoterStatusSubjectPrefix(oldStatus: string, newStatus: string) {
  if (oldStatus === "pending" && newStatus === "active") return "Promoter Approved";
  if (newStatus === "denied") return "Promoter Denied";
  if (newStatus === "disabled") return "Promoter Disabled";
  if (newStatus === "active") return "Promoter Re-activated";
  return "Promoter Status Changed";
}

function selectedPromoterLabel(application: ApplicationData) {
  if (!application.selectedPromoterId || application.selectedPromoterId === independentPromoterId) return "None";
  return application.selectedPromotionName || application.selectedPromoterId;
}

function fighterSubmissionTypeLines(application: ApplicationData, uploads: Partial<Record<UploadKey, unknown[]>>) {
  const requirementsNeeded = application.requirementsNeeded || [];
  const lines = [
    ...(requirementsNeeded.includes("athleteLicenseApplication") ? [`- ${requirementLabels.athleteLicenseApplication}`] : []),
    ...(requirementsNeeded.includes("nationalMmaIdApplication") ? [`- ${requirementLabels.nationalMmaIdApplication}`] : []),
    ...(requirementsNeeded.includes("bloodwork") || uploads.bloodwork?.length ? ["- Blood Work"] : []),
    ...(requirementsNeeded.includes("physical") || uploads.physical?.length ? ["- Physical Exam"] : []),
    ...(uploads.cardio?.length ? ["- Cardio/EKG optional upload included"] : []),
    ...(uploads.additional?.length ? ["- Additional Documentation optional upload included"] : [])
  ];

  return lines.length ? lines : ["- None"];
}
