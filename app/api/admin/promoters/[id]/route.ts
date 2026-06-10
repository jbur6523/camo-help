import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";
import { isAdminRequestAuthenticated } from "@/lib/admin/auth";
import {
  sendSupportErrorNotification,
  sendSupportPromoterStatusChangeNotification
} from "@/lib/email/supportNotifications";
import { nextPromoterStatus, type PromoterAdminAction } from "@/lib/promoters/statusTransitions";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { PromoterStatus } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequestAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { action?: PromoterAdminAction };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid promoter update request." }, { status: 400 });
  }

  const action = body.action;
  if (!action) {
    return NextResponse.json({ error: "Promoter action is required." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data: promoter, error: fetchError } = await supabase
      .from("promoters")
      .select("id, status, email, promotion_name, contact_name")
      .eq("id", params.id)
      .maybeSingle();

    if (fetchError) throw new Error(`Supabase promoter fetch failure: ${fetchError.message}`);
    if (!promoter) return NextResponse.json({ error: "Promoter was not found." }, { status: 404 });

    const nextStatus = nextPromoterStatus(promoter.status as PromoterStatus, action);
    if (!nextStatus) {
      return NextResponse.json({ error: "This status update is not allowed." }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("promoters")
      .update({
        status: nextStatus
      })
      .eq("id", params.id);

    if (updateError) throw new Error(`Supabase promoter status update failure: ${updateError.message}`);

    await sendSupportPromoterStatusChangeNotification({
      promotionName: promoter.promotion_name,
      promoterEmail: promoter.email,
      contactName: promoter.contact_name,
      oldStatus: promoter.status,
      newStatus: nextStatus,
      changedAt: new Date()
    });

    if (promoter.status === "pending" && nextStatus === "active") {
      await sendPromoterApprovalEmail({
        email: promoter.email,
        promotionName: promoter.promotion_name
      });
    }

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update promoter.";
    await sendSupportErrorNotification({
      errorType: message.startsWith("Supabase promoter status update failure")
        ? "Supabase Promoter Status Update Failure"
        : message.startsWith("Supabase promoter fetch failure")
          ? "Supabase Promoter Fetch Failure"
          : "Promoter Status Update Failure",
      source: "app/api/admin/promoters/[id] PATCH",
      message,
      operation: "Update promoter status"
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function sendPromoterApprovalEmail({
  email,
  promotionName
}: {
  email: string;
  promotionName: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from || !email) {
    await sendSupportErrorNotification({
      errorType: "Missing Required Environment Variable",
      source: "sendPromoterApprovalEmail",
      message: "RESEND_API_KEY, EMAIL_FROM, or promoter email is not configured.",
      operation: "Send promoter approval email"
    });
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject: "Promoter Registration Approved",
      text: [
        "Congratulations.",
        "",
        `Your promoter registration${promotionName ? ` for ${promotionName}` : ""} has been approved on CAMO Help and your promotion is now listed and available for fighter selection.`,
        "",
        "Fighters can now choose your promotion when submitting documents through CAMO Help.",
        "",
        "If you need to update your information in the future, please contact support."
      ].join("\n")
    });

    if (error) {
      console.error(`Promoter approval email failed: ${error.message}`);
      await sendSupportErrorNotification({
        errorType: "Email Sending Failure",
        source: "sendPromoterApprovalEmail",
        message: error.message,
        operation: "Send promoter approval email"
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email error.";
    console.error(`Promoter approval email failed: ${message}`);
    await sendSupportErrorNotification({
      errorType: "Email Sending Failure",
      source: "sendPromoterApprovalEmail",
      message,
      operation: "Send promoter approval email"
    });
  }
}
