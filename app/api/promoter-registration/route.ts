import { NextResponse } from "next/server";
import { Resend } from "resend";
import { promoterRegistrationSchema, type PromoterRegistration } from "@/lib/promoters/registrationSchema";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid registration payload." }, { status: 400 });
  }

  const parsed = promoterRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please complete the required promoter registration fields.",
        fieldErrors: parsed.error.flatten().fieldErrors
      },
      { status: 400 }
    );
  }

  try {
    const registration = parsed.data;
    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase.from("promoters").insert({
      promotion_name: registration.promotionName,
      promoter_license_number: registration.licenseNumber,
      promoter_email: registration.promoterEmail,
      contact_name: registration.contactName,
      phone: registration.phone,
      website_url: registration.websiteUrl,
      status: "pending",
      created_at: new Date().toISOString()
    });

    if (error) {
      throw new Error(error.message);
    }

    await sendAdminNotification(registration);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Promoter registration failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function sendAdminNotification(registration: PromoterRegistration) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const to = process.env.ADMIN_EMAIL_TO;

  if (!apiKey || !from || !to) return;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to,
    subject: "New promoter registration submitted",
    text: [
      `Promotion name: ${registration.promotionName}`,
      `License number: ${registration.licenseNumber}`,
      `Promoter email: ${registration.promoterEmail}`,
      `Contact person: ${registration.contactName}`,
      `Phone: ${registration.phone}`,
      `Website/social: ${registration.websiteUrl || "Not provided"}`,
      "Status: pending"
    ].join("\n")
  });

  if (error) {
    console.error(`Promoter registration admin email failed: ${error.message}`);
  }
}
