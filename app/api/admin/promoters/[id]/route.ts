import { NextResponse, type NextRequest } from "next/server";
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
      .select("id, status")
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
        status: nextStatus,
        approved_at: nextStatus === "active" ? new Date().toISOString() : null
      })
      .eq("id", params.id);

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update promoter.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
