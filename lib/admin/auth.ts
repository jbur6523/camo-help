import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export const adminSessionCookieName = "camo_admin_session";

const sessionMaxAgeSeconds = 60 * 60 * 12;

export function verifyAdminPassword(password: string) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  return safeEqual(password, adminPassword);
}

export function createAdminSessionCookieValue(now = Date.now()) {
  const expiresAt = now + sessionMaxAgeSeconds * 1000;
  const payload = String(expiresAt);
  return `${payload}.${sign(payload)}`;
}

export function isAdminSessionCookieValid(value: string | undefined) {
  if (!value) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  return safeEqual(signature, sign(payload));
}

export function isAdminPageAuthenticated() {
  return isAdminSessionCookieValid(cookies().get(adminSessionCookieName)?.value);
}

export function isAdminRequestAuthenticated(request: NextRequest) {
  if (isAdminSessionCookieValid(request.cookies.get(adminSessionCookieName)?.value)) return true;

  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) return false;

  const authorization = request.headers.get("authorization") || "";
  const bearerToken = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  const headerToken = request.headers.get("x-admin-token") || "";

  return safeEqual(bearerToken, adminToken) || safeEqual(headerToken, adminToken);
}

export function adminSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds
  };
}

function sign(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

function sessionSecret() {
  const secret = process.env.ADMIN_TOKEN || process.env.ADMIN_PASSWORD;
  if (!secret) throw new Error("Missing admin authentication environment variable.");
  return secret;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
