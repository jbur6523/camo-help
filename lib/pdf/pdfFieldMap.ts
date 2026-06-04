import type { ApplicationData } from "@/lib/types";
import { fullName } from "@/lib/types";

export type PdfValue = keyof ApplicationData | ((data: ApplicationData) => string);

export type PdfOverlayField = {
  page: number;
  x: number;
  y: number;
  size?: number;
  maxWidth?: number;
  value: PdfValue;
};

export type PdfCheckbox = {
  page: number;
  x: number;
  y: number;
  when: (data: ApplicationData) => boolean;
};

export type PdfFieldMap = {
  templatePath: string;
  // If the source PDF has AcroForm fields, add exact field names here.
  // Example: { "Applicant Name": (data) => fullName(data) }
  fillableFields: Record<string, PdfValue>;
  overlays: PdfOverlayField[];
  checkboxes: PdfCheckbox[];
};

const address = (data: ApplicationData) => `${data.street}, ${data.city}, ${data.state} ${data.zip}, ${data.country}`;
const height = (data: ApplicationData) => `${data.heightFeet}' ${data.heightInches}"`;
const record = (data: ApplicationData) =>
  `${data.recordWins}-${data.recordLosses}-${data.recordDraws}, ${data.recordNoContests} NC`;
const yesNo = (value: string) => (value === "yes" ? "Yes" : "No");
const compactHistory = (data: ApplicationData) =>
  [
    `Other names: ${data.otherNames === "yes" ? data.otherNamesList : "No"}`,
    `Disqualified: ${data.disqualified === "yes" ? data.disqualifiedExplanation : "No"}`,
    `Medical license issue: ${data.medicalLicenseIssue === "yes" ? data.medicalLicenseExplanation : "No"}`,
    `Record: ${record(data)}`,
    data.fights.length
      ? `Fights: ${data.fights
          .map((fight) => `${fight.date} ${fight.opponent} ${fight.outcome} (${fight.promoter}, ${fight.state})`)
          .join("; ")}`
      : "Fights: none listed"
  ].join("\n");

const compactLegal = (data: ApplicationData) =>
  [
    `Prior license: ${yesNo(data.licensedBefore)} (${data.priorLicenses.length})`,
    `Commission discipline: ${yesNo(data.commissionDiscipline)} (${data.commissionActions.length})`,
    `Pending commission charges: ${yesNo(data.pendingCommissionCharges)} (${data.commissionCharges.length})`,
    `Convicted crime: ${yesNo(data.convictedCrime)} (${data.convictions.length})`,
    `Pending law charges: ${yesNo(data.pendingLawCharges)} (${data.pendingLawChargesList.length})`
  ].join("\n");

// Coordinate notes:
// pdf-lib uses bottom-left origin coordinates. Increase x to move right.
// Increase y to move up. Use the scripts/inspect-pdfs.ts helper to list page sizes,
// then adjust these fields while comparing downloaded PDFs against the templates.
export const athleteLicenseFieldMap: PdfFieldMap = {
  templatePath: "/templates/Camo Athlete License(1).pdf",
  fillableFields: {
    Name: fullName,
    "Full Name": fullName,
    DOB: "birthDate",
    Email: "email",
    Phone: "phone",
    Address: address,
    Sex: "sex",
    Height: height,
    Weight: "weight"
  },
  overlays: [
    { page: 0, x: 74, y: 690, value: fullName, size: 10, maxWidth: 220 },
    { page: 0, x: 342, y: 690, value: "birthDate", size: 10 },
    { page: 0, x: 455, y: 690, value: "age", size: 10 },
    { page: 0, x: 74, y: 662, value: address, size: 9, maxWidth: 430 },
    { page: 0, x: 74, y: 633, value: "phone", size: 10 },
    { page: 0, x: 257, y: 633, value: "email", size: 10, maxWidth: 250 },
    { page: 0, x: 74, y: 604, value: "ssnLast4", size: 10 },
    { page: 0, x: 180, y: 604, value: "sex", size: 10 },
    { page: 0, x: 275, y: 604, value: height, size: 10 },
    { page: 0, x: 366, y: 604, value: "weight", size: 10 },
    { page: 0, x: 74, y: 548, value: "athleteLicenseType", size: 10 },
    { page: 0, x: 74, y: 486, value: compactHistory, size: 8, maxWidth: 455 },
    { page: 1, x: 74, y: 705, value: compactLegal, size: 8, maxWidth: 455 },
    { page: 1, x: 74, y: 146, value: "signatureName", size: 10, maxWidth: 250 },
    { page: 1, x: 390, y: 146, value: "signatureDate", size: 10 }
  ],
  checkboxes: [
    { page: 0, x: 58, y: 548, when: (data) => data.athleteLicenseType === "Original" },
    { page: 0, x: 133, y: 548, when: (data) => data.athleteLicenseType === "Renewal" }
  ]
};

export const nationalIdFieldMap: PdfFieldMap = {
  templatePath: "/templates/National ID form(1).pdf",
  fillableFields: {
    Name: fullName,
    "Full Name": fullName,
    DOB: "birthDate",
    Email: "email",
    Phone: "phone",
    Address: address,
    Height: height,
    Weight: "weight"
  },
  overlays: [
    { page: 0, x: 76, y: 700, value: fullName, size: 10, maxWidth: 250 },
    { page: 0, x: 352, y: 700, value: "birthDate", size: 10 },
    { page: 0, x: 462, y: 700, value: "age", size: 10 },
    { page: 0, x: 76, y: 672, value: address, size: 9, maxWidth: 430 },
    { page: 0, x: 76, y: 642, value: "phone", size: 10 },
    { page: 0, x: 260, y: 642, value: "email", size: 10, maxWidth: 250 },
    { page: 0, x: 76, y: 614, value: "sex", size: 10 },
    { page: 0, x: 180, y: 614, value: height, size: 10 },
    { page: 0, x: 275, y: 614, value: "weight", size: 10 },
    { page: 0, x: 76, y: 558, value: "nationalIdType", size: 10 },
    { page: 0, x: 76, y: 498, value: compactHistory, size: 8, maxWidth: 455 },
    { page: 0, x: 76, y: 154, value: "signatureName", size: 10, maxWidth: 250 },
    { page: 0, x: 390, y: 154, value: "signatureDate", size: 10 }
  ],
  checkboxes: [
    { page: 0, x: 60, y: 558, when: (data) => data.nationalIdType === "Original" },
    { page: 0, x: 135, y: 558, when: (data) => data.nationalIdType === "Renewal" },
    { page: 0, x: 210, y: 558, when: (data) => data.nationalIdType === "Replacement" }
  ]
};
