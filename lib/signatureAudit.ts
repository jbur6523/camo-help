export type SignatureLocationAudit =
  | {
      status: "granted";
      latitude: number;
      longitude: number;
      accuracy: number;
      timestamp: string;
    }
  | {
      status: "denied";
      timestamp?: string;
    }
  | {
      status: "unavailable";
      reason?: string;
      timestamp?: string;
    };

export type SignatureAuditPayload = {
  location?: SignatureLocationAudit | null;
};

export const signatureConfirmationCheckboxLanguage = [
  "I certify that the information I provided is true and correct.",
  "I understand that false, incomplete, or inaccurate information may result in denial or revocation.",
  "I understand this app helps prepare and send documents but does not replace CAMO's official review or approval process.",
  "I understand payment must be completed separately through CAMO."
];

export const signatureCertificationStatement =
  "The signer confirmed that their typed legal name and submission confirmation were intended to serve as their electronic signature for the certified document(s) listed above. This certificate records the signature and submission information collected by CAMO Help. CAMO may require additional verification or official signing if needed.";
