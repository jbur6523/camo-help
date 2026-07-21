import { z } from "zod";

const booleanSchema = z.enum(["true", "false", "1", "0"]).transform((value) => value === "true" || value === "1");
const positiveInt = z.coerce.number().int().positive();

export type DocumentCheckProviderName = "mock" | "openai";

export type DocumentCheckConfig = {
  enabled: boolean;
  provider: DocumentCheckProviderName;
  model: string;
  openAiApiKey?: string;
  upstashUrl?: string;
  upstashToken?: string;
  hashSecret?: string;
  burstLimit: number;
  dailyLimit: number;
  monthlyLimit: number;
  timeoutMs: number;
  valid: boolean;
  invalidReason?: string;
};

export function getDocumentCheckConfig(env: NodeJS.ProcessEnv = process.env): DocumentCheckConfig {
  const parsed = z
    .object({
      enabled: booleanSchema.default("false"),
      provider: z.enum(["mock", "openai"]).default("mock"),
      model: z.string().trim().min(1).default("gpt-5.6-luna"),
      openAiApiKey: z.string().trim().optional(),
      upstashUrl: z.string().url().optional(),
      upstashToken: z.string().trim().min(1).optional(),
      hashSecret: z.string().trim().min(32).optional(),
      burstLimit: positiveInt.default(3),
      dailyLimit: positiveInt.default(10),
      monthlyLimit: positiveInt.default(500),
      timeoutMs: positiveInt.default(20_000)
    })
    .safeParse({
      enabled: env.DOCUMENT_CHECK_ENABLED,
      provider: env.DOCUMENT_CHECK_PROVIDER,
      model: env.OPENAI_DOCUMENT_CHECK_MODEL,
      openAiApiKey: env.OPENAI_API_KEY || undefined,
      upstashUrl: env.UPSTASH_REDIS_REST_URL || undefined,
      upstashToken: env.UPSTASH_REDIS_REST_TOKEN || undefined,
      hashSecret: env.DOCUMENT_CHECK_HASH_SECRET || undefined,
      burstLimit: env.DOCUMENT_CHECK_BURST_LIMIT,
      dailyLimit: env.DOCUMENT_CHECK_DAILY_LIMIT,
      monthlyLimit: env.DOCUMENT_CHECK_MONTHLY_LIMIT,
      timeoutMs: env.DOCUMENT_CHECK_TIMEOUT_MS
    });

  if (!parsed.success) {
    return {
      enabled: false,
      provider: "mock",
      model: "gpt-5.6-luna",
      burstLimit: 3,
      dailyLimit: 10,
      monthlyLimit: 500,
      timeoutMs: 20_000,
      valid: false,
      invalidReason: "INVALID_CONFIGURATION"
    };
  }

  const value = parsed.data;
  const isTest = env.NODE_ENV === "test";
  let invalidReason: string | undefined;
  if (value.enabled && value.provider === "openai" && !value.openAiApiKey) invalidReason = "OPENAI_CONFIGURATION_MISSING";
  if (value.enabled && env.NODE_ENV === "production" && value.provider === "mock") invalidReason = "MOCK_PROVIDER_NOT_ALLOWED";
  if (value.enabled && !isTest && (!value.upstashUrl || !value.upstashToken || !value.hashSecret)) {
    invalidReason = "RATE_LIMIT_CONFIGURATION_MISSING";
  }
  return {
    enabled: value.enabled,
    provider: value.provider,
    model: value.model,
    openAiApiKey: value.openAiApiKey,
    upstashUrl: value.upstashUrl,
    upstashToken: value.upstashToken,
    hashSecret: value.hashSecret,
    burstLimit: value.burstLimit,
    dailyLimit: value.dailyLimit,
    monthlyLimit: value.monthlyLimit,
    timeoutMs: value.timeoutMs,
    valid: !invalidReason,
    invalidReason
  };
}
