import { Resend } from "resend";
import { formatPacificDateTime } from "@/lib/dates";
import { independentPromoterId } from "@/lib/promoters/constants";
import type { ApplicationData, UploadKey } from "@/lib/types";
import { fullName, requirementLabels } from "@/lib/types";

type SupportNotification = {
  subject: string;
  text: string;
  html?: string;
  source: string;
  submissionId?: string;
  attachments?: SupportEmailAttachment[];
};

type SupportEmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

type SupportErrorNotification = {
  errorType: string;
  source: string;
  message: string;
  operation: string;
  details?: string[];
  submissionId?: string;
  fighterName?: string;
  fighterEmail?: string;
  promoterName?: string;
  promotionName?: string;
  userShownOutcome?: "none" | "failure" | "partial";
};

type PromoterRegistrationSupportPayload = {
  promotionName: string;
  lastPromotionDate: string;
  promoterEmail: string;
  contactName: string;
  websiteUrl: string;
  submittedAt: Date;
  governmentIdAttachment?: SupportEmailAttachment;
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
  athletePdfGenerated: boolean;
  nationalIdPdfGenerated: boolean;
  applicationEmailSent: boolean;
  medicalEmailSent: boolean;
  fighterConfirmationEmailSent: boolean;
  promoterNotificationStatus: "not_applicable" | "pending" | "sent" | "failed";
};

const adminPromotersUrl = "https://camo-help.com/admin/promoters";

export async function sendSupportNotification({ subject, text, html, source, submissionId, attachments }: SupportNotification) {
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
    console.info("Support notification send attempted.", {
      source,
      submissionId: submissionId || "not available",
      timestamp: new Date().toISOString()
    });
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
      ...(attachments?.length
        ? {
            attachments: attachments.map((attachment) => ({
              filename: attachment.filename,
              content: attachment.content,
              contentType: attachment.contentType
            }))
          }
        : {})
    });

    if (error) {
      console.warn("Support notification failed.", {
        source,
        submissionId: submissionId || "not available",
        timestamp: new Date().toISOString(),
        error: safeErrorMessage(error.message)
      });
      return null;
    }

    console.info("Support notification sent.", {
      source,
      submissionId: submissionId || "not available",
      timestamp: new Date().toISOString(),
      resendMessageId: data?.id || null
    });
    return data?.id || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown support notification error.";
    console.warn("Support notification failed.", {
      source,
      submissionId: submissionId || "not available",
      timestamp: new Date().toISOString(),
      error: safeErrorMessage(message)
    });
    return null;
  }
}

export async function sendSupportErrorNotification({
  errorType,
  source,
  message,
  operation,
  details,
  submissionId,
  fighterName,
  fighterEmail,
  promoterName,
  promotionName,
  userShownOutcome
}: SupportErrorNotification) {
  return sendSupportNotification({
    source,
    submissionId,
    subject: `CAMO Help Error: ${errorType}`,
    text: [
      `Submission/request ID: ${submissionId || "Not available"}`,
      `Error type: ${errorType}`,
      `Route/function: ${source}`,
      `Safe error message: ${safeErrorMessage(message)}`,
      `Timestamp: ${formatPacificDateTime(new Date())}`,
      ...(fighterName ? [`Fighter name: ${fighterName}`] : []),
      ...(fighterEmail ? [`Fighter email: ${fighterEmail}`] : []),
      ...(promoterName ? [`Promoter name: ${promoterName}`] : []),
      ...(promotionName ? [`Promotion name: ${promotionName}`] : []),
      `Operation failed: ${operation}`,
      ...(details?.length ? ["Details:", ...details.map((detail) => `- ${safeErrorMessage(detail)}`)] : []),
      `User-facing outcome: ${userShownOutcome || "none"}`
    ].join("\n")
  });
}

export async function sendSupportPromoterRegistrationNotification({
  promotionName,
  lastPromotionDate,
  promoterEmail,
  contactName,
  websiteUrl,
  submittedAt,
  governmentIdAttachment
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
      `Government ID attachment: ${governmentIdAttachment ? governmentIdAttachment.filename : "Not attached"}`,
      "",
      "Admin Review",
      `Review Promoter Registration: ${adminPromotersUrl}`
    ].join("\n"),
    html: buildPromoterRegistrationSupportHtml({
      promotionName,
      lastPromotionDate,
      promoterEmail,
      contactName,
      websiteUrl,
      submittedAt,
      governmentIdAttachment
    }),
    attachments: governmentIdAttachment ? [governmentIdAttachment] : undefined
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
      `Admin review path: ${adminPromotersUrl}`
    ].join("\n")
  });
}

function buildPromoterRegistrationSupportHtml({
  promotionName,
  lastPromotionDate,
  promoterEmail,
  contactName,
  websiteUrl,
  submittedAt,
  governmentIdAttachment
}: PromoterRegistrationSupportPayload) {
  const details = [
    ["Promotion Name", promotionName],
    ["Date of Last Promotion", lastPromotionDate],
    ["Promoter Name", contactName],
    ["Promoter Email", promoterEmail],
    ["Website / Social Link", websiteUrl],
    ["Submitted Date/Time", formatPacificDateTime(submittedAt)],
    ["Status", "pending"],
    ["Government ID Attachment", governmentIdAttachment ? governmentIdAttachment.filename : "Not attached"]
  ];

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f8f7;color:#1d2529;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:24px 16px;">
      <div style="background:#ffffff;border:1px solid #d9e0dc;border-radius:10px;padding:22px;">
        <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#0f6b4f;">New Promoter Registration Pending Review</h1>
        <p style="margin:0 0 22px;font-size:16px;line-height:1.5;color:#3f4a45;">
          A new promoter registration has been submitted and is waiting for admin review.
        </p>

        <h2 style="margin:0 0 12px;font-size:17px;line-height:1.3;color:#1d2529;">Promoter Details</h2>
        <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 24px;">
          <tbody>
            ${details
              .map(
                ([label, value]) => `
            <tr>
              <td style="display:block;padding:10px 0 2px;font-size:13px;font-weight:700;color:#1d2529;">${escapeHtml(label)}</td>
              <td style="display:block;padding:0 0 10px;border-bottom:1px solid #edf1ef;font-size:15px;line-height:1.45;color:#3f4a45;">${escapeHtml(value || "Not provided")}</td>
            </tr>`
              )
              .join("")}
          </tbody>
        </table>

        <h2 style="margin:0 0 12px;font-size:17px;line-height:1.3;color:#1d2529;">Admin Review</h2>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#3f4a45;">Review this promoter registration:</p>
        <p style="margin:0 0 16px;">
          <a href="${adminPromotersUrl}" style="display:inline-block;background:#0f6b4f;color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 18px;font-weight:700;font-size:15px;">
            Review Promoter Registration
          </a>
        </p>
        <p style="margin:0;font-size:14px;line-height:1.5;">
          <a href="${adminPromotersUrl}" style="color:#0f6b4f;text-decoration:underline;">${adminPromotersUrl}</a>
        </p>
      </div>
    </div>
  </body>
</html>`;
}

export async function sendSupportFighterSubmissionNotification({
  application,
  uploads,
  submittedAt,
  submissionId,
  athletePdfGenerated,
  nationalIdPdfGenerated,
  applicationEmailSent,
  medicalEmailSent,
  fighterConfirmationEmailSent
}: FighterSubmissionSupportPayload) {
  const name = fullName(application);
  return sendSupportNotification({
    source: "app/api/submit-application POST",
    submissionId,
    subject: `New Fighter Submission: ${name || "Unknown Fighter"}`,
    text: [
      "CAMO Help Submission Received",
      "",
      "Submission Details",
      "",
      `Submission ID: ${submissionId}`,
      `Submitted date/time: ${formatPacificDateTime(submittedAt)}`,
      `Workflow type: ${submissionWorkflowType(application, uploads)}`,
      "",
      "Fighter Information",
      "",
      `Fighter Name: ${name || "Not provided"}`,
      `Fighter Email: ${application.email}`,
      `DOB: ${application.birthDate}`,
      `Selected Promoter: ${selectedPromoterLabel(application)}`,
      "",
      "Submitted Items",
      "",
      ...fighterSubmissionTypeLines(application, uploads),
      "",
      "Processing Status",
      "",
      `Athlete License PDF generated: ${athletePdfGenerated ? "yes" : "no"}`,
      `National MMA ID PDF generated: ${nationalIdPdfGenerated ? "yes" : "no"}`,
      `Application email sent: ${applicationEmailSent ? "yes" : "no"}`,
      `Medical email sent: ${medicalEmailSent ? "yes" : "no"}`,
      `Fighter confirmation email sent: ${fighterConfirmationEmailSent ? "yes" : "no"}`
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
    ...(requirementsNeeded.includes("headshot") || uploads.headshot?.length ? ["- Headshot Photo"] : []),
    ...(requirementsNeeded.includes("photoId") || uploads.photoId?.length ? ["- Driver's License / State ID"] : []),
    ...(uploads.cardio?.length ? ["- Cardio/EKG Document"] : []),
    ...(uploads.additional?.length ? ["- Additional Documentation"] : [])
  ];

  return lines.length ? lines : ["- None"];
}

function submissionWorkflowType(application: ApplicationData, uploads: Partial<Record<UploadKey, unknown[]>>) {
  const requirementsNeeded = application.requirementsNeeded || [];
  const hasAthlete = requirementsNeeded.includes("athleteLicenseApplication");
  const hasNational = requirementsNeeded.includes("nationalMmaIdApplication");
  const hasMedical = requirementsNeeded.includes("bloodwork") || requirementsNeeded.includes("physical") || Boolean(uploads.cardio?.length) || Boolean(uploads.additional?.length);

  if (hasAthlete && hasNational) return "Full application";
  if (hasAthlete && !hasNational && !hasMedical) return "Athlete License only";
  if (hasNational && !hasAthlete && !hasMedical) return "National MMA ID only";
  if (!hasAthlete && !hasNational && hasMedical) return "Medical documents only";
  if (!hasAthlete && !hasNational) return "Documents-only";
  return "Documents-only";
}

export function safeErrorMessage(message: string) {
  return message
    .replace(/(RESEND_API_KEY|SUPABASE_SERVICE_ROLE_KEY|ADMIN_TOKEN|ADMIN_PASSWORD|NEXT_PUBLIC_SUPABASE_ANON_KEY)=\S+/gi, "$1=[redacted]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]")
    .slice(0, 500);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
