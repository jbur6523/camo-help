import { NextResponse } from "next/server";
import { outboundEmailEnabled } from "@/lib/security/outboundEmail";

export const runtime = "nodejs";

export function GET() {
  const betaMode = process.env.BETA_MODE !== "false";
  const emailDeliveryEnabled = outboundEmailEnabled();
  const emailConfigured =
    emailDeliveryEnabled &&
    Boolean(
      process.env.RESEND_API_KEY &&
      process.env.EMAIL_FROM &&
      process.env.LICENSE_EMAIL_TO &&
      process.env.MEDICAL_EMAIL_TO
    );

  return NextResponse.json({
    betaMode,
    emailConfigured,
    emailDeliveryEnabled
  });
}
