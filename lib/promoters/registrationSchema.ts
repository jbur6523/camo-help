import { z } from "zod";

export const promoterRegistrationSchema = z
  .object({
    promotionName: z.string().trim().min(1, "Promotion name is required."),
    lastPromotionDate: z.string().trim().min(1, "Date of last promotion is required."),
    promoterEmail: z.string().trim().min(1, "Promoter email is required.").email("Enter a valid promoter email."),
    contactName: z.string().trim().min(1, "Promoter name is required."),
    websiteUrl: z.string().trim().min(1, "Website / social link is required.")
  });

export type PromoterRegistrationInput = z.input<typeof promoterRegistrationSchema>;
export type PromoterRegistration = z.output<typeof promoterRegistrationSchema>;
