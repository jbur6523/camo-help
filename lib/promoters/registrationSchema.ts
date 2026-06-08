import { z } from "zod";

export const promoterRegistrationSchema = z
  .object({
    promotionName: z.string().trim().min(1, "Promotion name is required."),
    licenseNumber: z.string().trim().min(1, "Promoter license number is required."),
    promoterEmail: z.string().trim().min(1, "Promoter email is required.").email("Enter a valid promoter email."),
    contactName: z.string().trim().min(1, "Contact person name is required."),
    phone: z.string().trim().min(1, "Phone number is required."),
    websiteUrl: z.string().trim().optional()
  })
  .transform((value) => ({
    ...value,
    websiteUrl: value.websiteUrl || null
  }));

export type PromoterRegistrationInput = z.input<typeof promoterRegistrationSchema>;
export type PromoterRegistration = z.output<typeof promoterRegistrationSchema>;
