import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";
import type {
  DocumentCheckRateLimitDecision,
  DocumentCheckRateLimitRequest,
  DocumentCheckRateLimiter
} from "@/lib/document-check/rateLimit";

const acquireLockScript = `return redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2]) and 1 or 0`;
const releaseLockScript = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`;
const consumeMonthlyScript = `local n = redis.call('INCR', KEYS[1]); if n > tonumber(ARGV[1]) then redis.call('DECR', KEYS[1]); return 0 end; redis.call('EXPIRE', KEYS[1], ARGV[2]); return 1`;

export class UpstashDocumentCheckRateLimiter implements DocumentCheckRateLimiter {
  private readonly redis: Redis;
  private readonly burst: Ratelimit;
  private readonly daily: Ratelimit;

  constructor(
    private readonly options: {
      url: string;
      token: string;
      burstLimit: number;
      dailyLimit: number;
      monthlyLimit: number;
      timeoutMs: number;
    }
  ) {
    this.redis = new Redis({ url: options.url, token: options.token });
    this.burst = new Ratelimit({
      redis: this.redis,
      limiter: Ratelimit.slidingWindow(options.burstLimit, "60 s"),
      analytics: false,
      ephemeralCache: false,
      timeout: Math.max(1_000, options.timeoutMs)
    });
    this.daily = new Ratelimit({
      redis: this.redis,
      limiter: Ratelimit.fixedWindow(options.dailyLimit, "1 d"),
      analytics: false,
      ephemeralCache: false,
      timeout: Math.max(1_000, options.timeoutMs)
    });
  }

  async acquire(request: DocumentCheckRateLimitRequest): Promise<DocumentCheckRateLimitDecision> {
    const leaseId = randomUUID();
    const lockKey = `document-check:lock:${request.clientIdentifierHash}`;
    const lockTtl = Math.max(this.options.timeoutMs + 5_000, 30_000);
    const lock = await this.redis.eval(acquireLockScript, [lockKey], [leaseId, lockTtl]);
    if (Number(lock) !== 1) return { allowed: false, reasonCode: "CONCURRENT_LIMIT", retryAfterSeconds: Math.ceil(lockTtl / 1000) };
    await this.redis.set(`document-check:lease:${leaseId}`, lockKey, { px: lockTtl });
    try {
      const [burst, daily] = await Promise.all([
        this.burst.limit(request.clientIdentifierHash),
        this.daily.limit(request.clientIdentifierHash)
      ]);
      if (burst.reason === "timeout" || daily.reason === "timeout") throw new Error("Rate-limit backend timed out.");
      if (!burst.success) {
        await this.release(leaseId);
        return { allowed: false, reasonCode: "BURST_LIMIT", retryAfterSeconds: Math.max(1, Math.ceil((burst.reset - Date.now()) / 1000)) };
      }
      if (!daily.success) {
        await this.release(leaseId);
        return { allowed: false, reasonCode: "DAILY_CLIENT_LIMIT", retryAfterSeconds: Math.max(1, Math.ceil((daily.reset - Date.now()) / 1000)) };
      }
      return { allowed: true, leaseId };
    } catch (error) {
      await this.release(leaseId);
      throw error;
    }
  }

  async consumeProviderBudget(leaseId: string): Promise<DocumentCheckRateLimitDecision> {
    const monthKey = `document-check:monthly:${new Date().toISOString().slice(0, 7)}`;
    const secondsInMonth = 32 * 24 * 60 * 60;
    const consumed = await this.redis.eval(consumeMonthlyScript, [monthKey], [this.options.monthlyLimit, secondsInMonth]);
    if (Number(consumed) !== 1) return { allowed: false, reasonCode: "MONTHLY_USAGE_LIMIT" };
    return { allowed: true, leaseId };
  }

  async release(leaseId: string) {
    const lockKey = await this.redis.get<string>(`document-check:lease:${leaseId}`);
    if (lockKey) await this.redis.eval(releaseLockScript, [lockKey], [leaseId]);
    await this.redis.del(`document-check:lease:${leaseId}`);
  }
}
