import { z } from "zod";

export const documentCheckReasonCodeSchema = z.enum([
  "NO_OBVIOUS_ISSUE",
  "POSSIBLE_NP_OR_PA",
  "HEP_B_ANTIBODY_FOUND",
  "HEP_B_ANTIGEN_NOT_FOUND",
  "PROVIDER_CREDENTIALS_UNREADABLE",
  "SIGNATURE_NOT_FOUND",
  "IMAGE_UNREADABLE",
  "UNSUPPORTED_DOCUMENT"
]);

export const documentCheckResultSchema = z
  .object({
    status: z.enum(["pass", "review", "unable_to_verify"]),
    reasonCode: documentCheckReasonCodeSchema,
    confidence: z.enum(["high", "medium", "low"])
  })
  .strict()
  .superRefine((result, context) => {
    if (result.status === "pass" && result.reasonCode !== "NO_OBVIOUS_ISSUE") {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid pass reason." });
    }
    if (result.status !== "pass" && result.reasonCode === "NO_OBVIOUS_ISSUE") {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid review reason." });
    }
  });

export type DocumentCheckResult = z.infer<typeof documentCheckResultSchema>;
export type DocumentCheckReasonCode = z.infer<typeof documentCheckReasonCodeSchema>;
