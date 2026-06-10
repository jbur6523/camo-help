import { NextResponse } from "next/server";
import { sendSupportErrorNotification, safeErrorMessage } from "@/lib/email/supportNotifications";

export const runtime = "nodejs";

type ClientSupportErrorPayload = {
  submissionId?: string;
  errorType?: string;
  source?: string;
  message?: string;
  operation?: string;
  details?: string[];
  fighterName?: string;
  fighterEmail?: string;
  userShownOutcome?: "none" | "failure" | "partial";
};

export async function POST(request: Request) {
  let payload: ClientSupportErrorPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await sendSupportErrorNotification({
    errorType: payload.errorType || "Client Submission Failure",
    source: payload.source || "client",
    message: safeErrorMessage(payload.message || "Client-side submission error."),
    operation: payload.operation || "Complete client-side submission step",
    details: Array.isArray(payload.details) ? payload.details.slice(0, 30) : undefined,
    submissionId: payload.submissionId,
    fighterName: payload.fighterName,
    fighterEmail: payload.fighterEmail,
    userShownOutcome: payload.userShownOutcome || "failure"
  });

  return NextResponse.json({ ok: true });
}
