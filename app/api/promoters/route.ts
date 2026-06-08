import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("promoters")
      .select("id, promotion_name")
      .eq("status", "active")
      .order("promotion_name", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      promoters: (data || []).map((promoter) => ({
        id: promoter.id,
        promotionName: promoter.promotion_name
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load approved promoters.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
