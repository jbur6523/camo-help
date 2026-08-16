import { NextResponse } from "next/server";
import {
  sendSupportErrorNotification,
  sendSupportPromoterRegistrationNotification
} from "@/lib/email/supportNotifications";
import { registerPromoterAccount } from "@/lib/promoters/accountRegistration";
import { promoterAccountRegistrationSchema } from "@/lib/promoters/accountRegistrationSchema";
import {
  PromoterRegistrationOperationalError,
  SupabasePromoterRegistrationGateway
} from "@/lib/promoters/supabaseRegistrationGateway";
import type { PromoterRegistration } from "@/lib/promoters/registrationSchema";
import { turnstileErrorStatus, turnstileUserMessage, verifyTurnstileToken } from "@/lib/security/turnstile";
import { logSuppressedOutboundEmail, outboundEmailEnabled } from "@/lib/security/outboundEmail";

export const runtime = "nodejs";

type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid registration payload.";
    await sendSupportErrorNotification({
      errorType: "Upload Parsing Failure",
      source: "app/api/promoter-registration POST",
      message,
      operation: "Parse promoter registration form data",
      userShownOutcome: "failure"
    });
    return NextResponse.json({ error: "Invalid registration payload." }, { status: 400 });
  }

  try {
    await verifyTurnstileToken(formData.get("turnstileToken"), clientIpFromHeaders(request.headers));
    console.info("Turnstile verification passed for promoter registration.");
  } catch (turnstileError) {
    const message = turnstileUserMessage(turnstileError);
    console.warn("Turnstile verification blocked promoter registration.", { message });
    return NextResponse.json(
      {
        error: message,
        code: turnstileErrorStatus(turnstileError) === 500 ? "turnstile_not_configured" : "turnstile_failed"
      },
      { status: turnstileErrorStatus(turnstileError) }
    );
  }

  const body = {
    promotionName: formValue(formData, "promotionName"),
    lastPromotionDate: formValue(formData, "lastPromotionDate"),
    promoterEmail: formValue(formData, "promoterEmail"),
    contactName: formValue(formData, "contactName"),
    websiteUrl: formValue(formData, "websiteUrl"),
    password: formValue(formData, "password"),
    confirmPassword: formValue(formData, "confirmPassword")
  };
  const parsed = promoterAccountRegistrationSchema.safeParse(body);
  const governmentId = await attachmentFromForm(formData, "governmentId");
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please complete the required promoter registration fields.",
        fieldErrors: parsed.error.flatten().fieldErrors
      },
      { status: 400 }
    );
  }
  if (!governmentId) {
    return NextResponse.json(
      {
        error: "Driver License / Government-Issued ID is required.",
        fieldErrors: { governmentId: ["Driver License / Government-Issued ID is required."] }
      },
      { status: 400 }
    );
  }
  if (!isAllowedGovernmentIdAttachment(governmentId)) {
    return NextResponse.json(
      {
        error: "Driver License / Government-Issued ID must be an image or PDF.",
        fieldErrors: { governmentId: ["Driver License / Government-Issued ID must be an image or PDF."] }
      },
      { status: 400 }
    );
  }

  try {
    const { password } = parsed.data;
    const registration = {
      promotionName: parsed.data.promotionName,
      lastPromotionDate: parsed.data.lastPromotionDate,
      promoterEmail: parsed.data.promoterEmail,
      contactName: parsed.data.contactName,
      websiteUrl: parsed.data.websiteUrl
    };
    await registerPromoterAccount(
      {
        ...registration,
        governmentIdFileName: governmentId.filename
      },
      password,
      new SupabasePromoterRegistrationGateway()
    );

    await sendSupportPromoterRegistrationNotification({
      promotionName: registration.promotionName,
      lastPromotionDate: registration.lastPromotionDate,
      promoterEmail: registration.promoterEmail,
      contactName: registration.contactName,
      websiteUrl: registration.websiteUrl,
      submittedAt: new Date(),
      governmentIdAttachment: governmentId
    });
    await sendPromoterPendingVerificationEmail(registration);

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    const reasonCode =
      error instanceof PromoterRegistrationOperationalError
        ? error.reasonCode
        : "PROMOTER_REGISTRATION_FAILED";
    console.warn("Promoter account registration failed.", { reasonCode });
    await sendSupportErrorNotification({
      errorType: "Promoter Registration Failure",
      source: "app/api/promoter-registration POST",
      message: reasonCode,
      operation: "Complete promoter registration",
      userShownOutcome: "failure"
    });
    return NextResponse.json(
      { error: "Promoter registration could not be completed at this time." },
      { status: 500, headers: { "Cache-Control": "no-store, private" } }
    );
  }
}

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function attachmentFromForm(formData: FormData, key: string) {
  const file = formData.get(key);
  if (!(file instanceof File) || file.size === 0) return undefined;
  return {
    filename: file.name || key,
    content: Buffer.from(await file.arrayBuffer()),
    contentType: file.type || "application/octet-stream"
  };
}

function isAllowedGovernmentIdAttachment(attachment: EmailAttachment) {
  const contentType = attachment.contentType || "";
  const filename = attachment.filename.toLowerCase();
  return contentType.startsWith("image/") || contentType === "application/pdf" || /\.(pdf|jpe?g|png|heic|heif|webp)$/i.test(filename);
}

function clientIpFromHeaders(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "Unavailable";
  return headers.get("x-real-ip") || "Unavailable";
}

async function sendPromoterPendingVerificationEmail(registration: PromoterRegistration) {
  if (!outboundEmailEnabled()) {
    logSuppressedOutboundEmail("sendPromoterPendingVerificationEmail");
    return;
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    await sendSupportErrorNotification({
      errorType: "Missing Required Environment Variable",
      source: "sendPromoterPendingVerificationEmail",
      message: "RESEND_API_KEY or EMAIL_FROM is not configured.",
      operation: "Send promoter pending verification email"
    });
    return;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: registration.promoterEmail,
      subject: "Promoter Registration Received",
      text: [
        "Thank you for registering your promotion with CAMO Help.",
        "",
        "Your promoter account has been created and your registration is pending review.",
        "",
        "After approval, you can log in using the email and password you selected during registration.",
        "",
        "If additional information is needed, we will contact you using the email address provided during registration.",
        "",
        "This is an automated message. Please do not reply to this email."
      ].join("\n")
    });

    if (error) {
      console.error(`Promoter registration confirmation email failed: ${error.message}`);
      await sendSupportErrorNotification({
        errorType: "Email Sending Failure",
        source: "sendPromoterPendingVerificationEmail",
        message: error.message,
        operation: "Send promoter pending verification email"
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email error.";
    console.error(`Promoter registration confirmation email failed: ${message}`);
    await sendSupportErrorNotification({
      errorType: "Email Sending Failure",
      source: "sendPromoterPendingVerificationEmail",
      message,
      operation: "Send promoter pending verification email"
    });
  }
}
