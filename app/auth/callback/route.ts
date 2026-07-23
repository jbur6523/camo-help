import { NextResponse, type NextRequest } from "next/server";
import { safeAuthDestination } from "@/lib/promoters/redirects";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export async function GET(request: NextRequest) {
  const destination = safeAuthDestination(request.nextUrl.searchParams.get("next"));
  const code = request.nextUrl.searchParams.get("code");
  const fallback = new URL("/promoters/login?error=reset-link", request.url);

  if (!destination || !code) {
    return NextResponse.redirect(fallback);
  }

  const supabase = await createSupabaseAuthServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.warn("Promoter password reset callback failed.", {
      reasonCode: "PASSWORD_RESET_CODE_EXCHANGE_FAILED"
    });
    return NextResponse.redirect(fallback);
  }

  return NextResponse.redirect(new URL(destination, request.url));
}
