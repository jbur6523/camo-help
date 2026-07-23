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

    const promoterIds = (data || []).map((promoter) => promoter.id);
    const { data: accounts, error: accountsError } = promoterIds.length
      ? await supabase
          .from("promoter_accounts")
          .select("promoter_id, link_status")
          .in("promoter_id", promoterIds)
      : { data: [], error: null };

    if (accountsError) throw new Error(accountsError.message);
    const accountStatusByPromoterId = new Map(
      (accounts || []).map((account) => [account.promoter_id, account.link_status])
    );

    return NextResponse.json({
      promoters: (data || []).map((promoter) => ({
        id: promoter.id,
        promotionName: promoter.promotion_name,
        lastPromotionDate: promoter.license_number,
        promoterEmail: promoter.email,
        contactName: promoter.contact_name,
        governmentIdFileName: promoter.phone,
        websiteUrl: promoter.website_or_social,
        status: promoter.status,
        accountLinkStatus: accountStatusByPromoterId.get(promoter.id) || null,
        createdAt: promoter.created_at
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load promoters.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
