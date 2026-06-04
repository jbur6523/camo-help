import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  const betaMode = process.env.BETA_MODE !== "false";
  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  const applicationRecipientConfigured = betaMode
    ? Boolean(process.env.APPLICATION_EMAIL_BETA)
    : Boolean(process.env.APPLICATION_EMAIL_PROD);
  const medicalRecipientConfigured = betaMode
    ? Boolean(process.env.MEDICAL_EMAIL_BETA)
    : Boolean(process.env.MEDICAL_EMAIL_PROD);

  return NextResponse.json({
    betaMode,
    paymentConfigured: Boolean(process.env.NEXT_PUBLIC_CAMO_PAYMENT_URL),
    emailConfigured: smtpConfigured && applicationRecipientConfigured && medicalRecipientConfigured
  });
}
