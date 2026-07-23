import { z } from "zod";
import { promoterRegistrationSchema } from "@/lib/promoters/registrationSchema";

export const promoterAccountRegistrationSchema = promoterRegistrationSchema
  .extend({
    password: z.string().min(8, "Password must be at least eight characters."),
    confirmPassword: z.string().min(1, "Confirm your password.")
  })
  .superRefine(({ password, confirmPassword }, context) => {
    if (password !== confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords must match."
      });
    }
  });

export type PromoterAccountRegistrationInput = z.input<typeof promoterAccountRegistrationSchema>;
export type PromoterAccountRegistration = z.output<typeof promoterAccountRegistrationSchema>;
