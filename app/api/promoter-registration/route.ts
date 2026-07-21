import { NextResponse } from "next/server";
import {
  sendSupportErrorNotification,
  sendSupportPromoterRegistrationNotification
} from "@/lib/email/supportNotifications";
import { promoterRegistrationSchema, type PromoterRegistration } from "@/lib/promoters/registrationSchema";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  DocumentValidationError,
  safeDocumentValidationMessage,
  validateUploadedDocument
} from "@/lib/files/serverDocumentValidation";

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

  const body = {
    promotionName: formValue(formData, "promotionName"),
    lastPromotionDate: formValue(formData, "lastPromotionDate"),
    promoterEmail: formValue(formData, "promoterEmail"),
    contactName: formValue(formData, "contactName"),
    websiteUrl: formValue(formData, "websiteUrl")
  };
  const parsed = promoterRegistrationSchema.safeParse(body);
  let governmentId: EmailAttachment | undefined;
  try {
    governmentId = await attachmentFromForm(formData, "governmentId");
  } catch (error) {
    const reasonCode = error instanceof DocumentValidationError ? error.reasonCode : "UPLOAD_PROCESSING_FAILED";
    console.warn("Promoter registration upload validation rejected.", { reasonCode });
    return NextResponse.json(
      { error: safeDocumentValidationMessage, fieldErrors: { governmentId: [safeDocumentValidationMessage] } },
      { status: 400 }
    );
  }
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
  try {
    const registration = parsed.data;
    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase.from("promoters").insert({
      promotion_name: registration.promotionName,
      license_number: registration.lastPromotionDate,
      email: registration.promoterEmail,
      contact_name: registration.contactName,
      phone: governmentId.filename,
      website_or_social: registration.websiteUrl,
      status: "pending",
      created_at: new Date().toISOString()
    });

    if (error) throw new Error(`Supabase promoter save failure: ${error.message}`);

    await sendSupportPromoterRegistrationNotification({
      ...registration,
      submittedAt: new Date(),
      governmentIdAttachment: governmentId
    });
    await sendPromoterPendingVerificationEmail(registration);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Promoter registration failed.";
    await sendSupportErrorNotification({
      errorType: message.startsWith("Supabase promoter save failure")
        ? "Supabase Promoter Save Failure"
        : "Promoter Registration Failure",
      source: "app/api/promoter-registration POST",
      message,
      operation: "Complete promoter registration",
      promoterName: body.contactName,
      promotionName: body.promotionName,
      userShownOutcome: "failure"
    });
    return NextResponse.json({ error: "Promoter registration could not be completed at this time." }, { status: 500 });
  }
}

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function attachmentFromForm(formData: FormData, key: string) {
  const file = formData.get(key);
  if (!(file instanceof File)) return undefined;
  const filename = file.name || key;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validated = await validateUploadedDocument(
    { bytes, declaredMimeType: file.type || "application/octet-stream", filename },
    "submission"
  );
  return {
    filename,
    content: Buffer.from(validated.bytes),
    contentType: validated.mimeType
  };
}

async function sendPromoterPendingVerificationEmail(registration: PromoterRegistration) {
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
        "Your promoter verification request has been received and is pending review.",
        "",
        "Once approved, your promotion will become available for fighter selection within CAMO Help.",
        "",
        "If additional information is needed, we will contact you using the email address provided during registration.",
        "",
        "This is an automated message. Please do not reply to this email."
      ].join("\n")
    });

    if (error) {
      console.error("Promoter registration confirmation email failed.", { reasonCode: "EMAIL_PROVIDER_FAILURE" });
      await sendSupportErrorNotification({
        errorType: "Email Sending Failure",
        source: "sendPromoterPendingVerificationEmail",
        message: error.message,
        operation: "Send promoter pending verification email"
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email error.";
    console.error("Promoter registration confirmation email failed.", { reasonCode: "EMAIL_PROVIDER_FAILURE" });
    await sendSupportErrorNotification({
      errorType: "Email Sending Failure",
      source: "sendPromoterPendingVerificationEmail",
      message,
      operation: "Send promoter pending verification email"
    });
  }
}
