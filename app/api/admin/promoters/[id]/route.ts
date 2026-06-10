import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";
import { isAdminRequestAuthenticated } from "@/lib/admin/auth";
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
      .select("id, status, email, promotion_name")
      .eq("id", params.id)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
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

    if (updateError) throw new Error(updateError.message);

    if (promoter.status === "pending" && nextStatus === "active") {
      await sendPromoterApprovalEmail({
        email: promoter.email,
        promotionName: promoter.promotion_name
      });
    }

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update promoter.";
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

  if (!apiKey || !from || !email) return;

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
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email error.";
    console.error(`Promoter approval email failed: ${message}`);
  }
}
