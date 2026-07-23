const allowedAuthDestinations = new Set(["/promoters/reset-password"]);

export function safeAuthDestination(value: string | null | undefined) {
  return value && allowedAuthDestinations.has(value) ? value : null;
}

export function promoterPasswordResetRedirectUrl(origin: string) {
  const parsed = new URL(origin);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Password-reset origin must use HTTP or HTTPS.");
  }
  return `${parsed.origin}/auth/callback?next=%2Fpromoters%2Freset-password`;
}
