import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseAuthServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/promoters/login", request.url), 303);
}
