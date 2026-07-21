import { createHmac } from "node:crypto";

export type DocumentCheckRateLimitReason =
  | "BURST_LIMIT"
  | "CONCURRENT_LIMIT"
  | "DAILY_CLIENT_LIMIT"
  | "MONTHLY_USAGE_LIMIT"
  | "BACKEND_UNAVAILABLE";

export type DocumentCheckRateLimitDecision =
  | { allowed: true; leaseId: string }
  | { allowed: false; reasonCode: DocumentCheckRateLimitReason; retryAfterSeconds?: number };

export type DocumentCheckRateLimitRequest = {
  clientIdentifierHash: string;
  now: number;
};

export interface DocumentCheckRateLimiter {
  acquire(request: DocumentCheckRateLimitRequest): Promise<DocumentCheckRateLimitDecision>;
  consumeProviderBudget(leaseId: string): Promise<DocumentCheckRateLimitDecision>;
  release(leaseId: string): Promise<void>;
}

export function createRateLimitIdentifierHash(identifier: string, secret: string) {
  if (!identifier || !secret) throw new Error("Rate-limit identifier and secret are required.");
  return createHmac("sha256", secret).update(identifier).digest("hex");
}
