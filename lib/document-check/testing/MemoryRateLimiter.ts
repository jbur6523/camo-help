import type {
  DocumentCheckRateLimitDecision,
  DocumentCheckRateLimiter,
  DocumentCheckRateLimitRequest
} from "@/lib/document-check/rateLimit";

// Deterministic test double only. This is intentionally not a production Vercel limiter.
export class MemoryDocumentCheckRateLimiter implements DocumentCheckRateLimiter {
  private readonly bursts = new Map<string, number[]>();
  private readonly daily = new Map<string, number>();
  private readonly leases = new Map<string, string>();
  private monthlyUsage = 0;
  private nextLease = 1;

  constructor(
    private readonly limits = { burst: 2, burstWindowMs: 60_000, daily: 10, monthly: 1_000, concurrent: 1 }
  ) {}

  async acquire(request: DocumentCheckRateLimitRequest): Promise<DocumentCheckRateLimitDecision> {
    const client = request.clientIdentifierHash;
    if (this.monthlyUsage >= this.limits.monthly) return { allowed: false, reasonCode: "MONTHLY_USAGE_LIMIT" };
    if ([...this.leases.values()].filter((value) => value === client).length >= this.limits.concurrent) {
      return { allowed: false, reasonCode: "CONCURRENT_LIMIT" };
    }
    const dayKey = `${client}:${new Date(request.now).toISOString().slice(0, 10)}`;
    if ((this.daily.get(dayKey) || 0) >= this.limits.daily) return { allowed: false, reasonCode: "DAILY_CLIENT_LIMIT" };
    const recent = (this.bursts.get(client) || []).filter((timestamp) => request.now - timestamp < this.limits.burstWindowMs);
    if (recent.length >= this.limits.burst) {
      return { allowed: false, reasonCode: "BURST_LIMIT", retryAfterSeconds: Math.ceil(this.limits.burstWindowMs / 1000) };
    }

    const leaseId = `test-lease-${this.nextLease++}`;
    this.bursts.set(client, [...recent, request.now]);
    this.daily.set(dayKey, (this.daily.get(dayKey) || 0) + 1);
    this.leases.set(leaseId, client);
    return { allowed: true, leaseId };
  }

  async release(leaseId: string) {
    this.leases.delete(leaseId);
  }

  async consumeProviderBudget(leaseId: string): Promise<DocumentCheckRateLimitDecision> {
    if (!this.leases.has(leaseId)) return { allowed: false, reasonCode: "BACKEND_UNAVAILABLE" };
    if (this.monthlyUsage >= this.limits.monthly) return { allowed: false, reasonCode: "MONTHLY_USAGE_LIMIT" };
    this.monthlyUsage += 1;
    return { allowed: true, leaseId };
  }
}
