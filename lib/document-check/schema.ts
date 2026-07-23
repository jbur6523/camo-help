import { z } from "zod";

export const documentCheckReasonCodeSchema = z.enum([
  "NO_OBVIOUS_ISSUE",
  "POSSIBLE_NP_OR_PA",
  "POSSIBLE_OTHER_NON_PHYSICIAN",
  "HEP_B_ANTIBODY_FOUND",
  "HEP_B_ANTIGEN_NOT_FOUND",
  "PROVIDER_CREDENTIALS_UNREADABLE",
  "PROVIDER_CREDENTIALS_MISSING",
  "SIGNATURE_NOT_FOUND",
  "DOCUMENT_UNREADABLE"
]);

export const documentCheckResultSchema = z
  .object({
    status: z.enum(["pass", "review", "unable_to_verify"]),
    reasonCodes: z.array(documentCheckReasonCodeSchema).min(1).max(3),
    confidence: z.enum(["high", "medium", "low"])
  })
  .strict()
  .superRefine((result, context) => {
    const uniqueReasons = new Set(result.reasonCodes);
    if (uniqueReasons.size !== result.reasonCodes.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate reason codes are not allowed." });
    }
    if (result.status === "pass" && (result.reasonCodes.length !== 1 || result.reasonCodes[0] !== "NO_OBVIOUS_ISSUE" || result.confidence === "low")) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid pass reason." });
    }
    if (result.status !== "pass" && result.reasonCodes.includes("NO_OBVIOUS_ISSUE")) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid review reason." });
    }
  });

export type DocumentCheckResult = z.infer<typeof documentCheckResultSchema>;
export type DocumentCheckReasonCode = z.infer<typeof documentCheckReasonCodeSchema>;

export const documentCheckResultJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["pass", "review", "unable_to_verify"] },
    reasonCodes: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: { type: "string", enum: documentCheckReasonCodeSchema.options }
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] }
  },
  required: ["status", "reasonCodes", "confidence"]
} as const;
