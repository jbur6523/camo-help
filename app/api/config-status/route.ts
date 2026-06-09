import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  const betaMode = process.env.BETA_MODE !== "false";
  const emailConfigured = Boolean(
    process.env.RESEND_API_KEY &&
      process.env.EMAIL_FROM &&
      process.env.LICENSE_EMAIL_TO &&
      process.env.MEDICAL_EMAIL_TO
  );

  return NextResponse.json({
    betaMode,
    emailConfigured
  });
}
