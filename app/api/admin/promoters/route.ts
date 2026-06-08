import { NextResponse, type NextRequest } from "next/server";
import { isAdminRequestAuthenticated } from "@/lib/admin/auth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAdminRequestAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("promoters")
      .select("id, promotion_name, license_number, email, contact_name, phone, website_or_social, status, created_at")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      promoters: (data || []).map((promoter) => ({
        id: promoter.id,
        promotionName: promoter.promotion_name,
        licenseNumber: promoter.license_number,
        promoterEmail: promoter.email,
        contactName: promoter.contact_name,
        phone: promoter.phone,
        websiteUrl: promoter.website_or_social,
        status: promoter.status,
        createdAt: promoter.created_at
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load promoters.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
