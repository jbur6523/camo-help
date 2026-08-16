const liveMode = "live";
const disabledMode = "disabled";

export type OutboundEmailMode = typeof liveMode | typeof disabledMode;

export function outboundEmailMode(): OutboundEmailMode {
  const previewDefault = process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production" ? disabledMode : liveMode;
  const configured = process.env.CAMO_OUTBOUND_EMAIL_MODE || previewDefault;
  if (configured === liveMode || configured === disabledMode) return configured;
  throw new Error("CAMO_OUTBOUND_EMAIL_MODE must be either live or disabled.");
}

export function outboundEmailEnabled() {
  return outboundEmailMode() === liveMode;
}

export function logSuppressedOutboundEmail(source: string) {
  console.info("Outbound email suppressed by environment policy.", { source });
}
