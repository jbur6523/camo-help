import { NextResponse, type NextRequest } from "next/server";
import {
  adminSessionCookieName,
  adminSessionCookieOptions,
  createAdminSessionCookieValue,
  verifyAdminPassword
} from "@/lib/admin/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid login request." }, { status: 400 });
  }

  if (!verifyAdminPassword(body.password || "")) {
    return NextResponse.json({ error: "Invalid admin credentials." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminSessionCookieName, createAdminSessionCookieValue(), adminSessionCookieOptions());
  return response;
}
