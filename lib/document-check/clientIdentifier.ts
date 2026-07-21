import { createRateLimitIdentifierHash } from "@/lib/document-check/rateLimit";

export function resolveClientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown-client";
}

export function resolveClientIdentifierHash(request: Request, secret: string) {
  return createRateLimitIdentifierHash(resolveClientIdentifier(request), secret);
}
