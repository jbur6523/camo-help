import { NextResponse, type NextRequest } from "next/server";
import { isAdminRequestAuthenticated } from "@/lib/admin/auth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequestAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { id } = await params;
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("promoter_accounts")
      .update({ link_status: "confirmed" })
      .eq("promoter_id", id)
      .eq("link_status", "pending_admin_confirmation")
      .select("id")
      .maybeSingle();

    if (error) throw new Error("ACCOUNT_LINK_UPDATE_FAILED");
    if (!data) {
      return NextResponse.json({ error: "No pending account link was found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    console.warn("Admin promoter account-link confirmation failed.", {
      reasonCode: "ACCOUNT_LINK_UPDATE_FAILED"
    });
    return NextResponse.json(
      { error: "The promoter account link could not be confirmed at this time." },
      { status: 500 }
    );
  }
}
