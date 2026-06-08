import { independentPromoterId, independentPromotionName } from "@/lib/promoters/constants";

export type YesNo = "" | "yes" | "no";

export type UploadKey =
  | "bloodwork"
  | "physical"
  | "headshot"
  | "photoId"
  | "cardio"
  | "additional";

export type UploadedFiles = Partial<Record<UploadKey, File[]>>;

export type RequirementKey =
  | "athleteLicenseApplication"
  | "nationalMmaIdApplication"
  | "bloodwork"
  | "physical"
  | "headshot"
  | "photoId";

export type FightEvent = {
  promoter: string;
  state: string;
  opponent: string;
  outcome: string;
  date: string;
};

export type PriorLicense = {
  licenseType: string;
  licenseYear: string;
  authority: string;
};

export type CommissionAction = {
  licenseType: string;
  actionTaken: string;
  reason: string;
  date: string;
};

export type CommissionCharge = {
  offense: string;
  offenseDate: string;
  authority: string;
  hearingDate: string;
};

export type Conviction = {
  offense: string;
  convictionDate: string;
  location: string;
  sentence: string;
};

export type PendingLawCharge = {
  offense: string;
  offenseDate: string;
  location: string;
  hearingDate: string;
};

export type ApplicationData = {
  firstName: string;
  middleName: string;
  lastName: string;
  birthDate: string;
  age: string;
  sex: "" | "Male" | "Female";
  phone: string;
  email: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  ssnLast4: string;
  heightFeet: string;
  heightInches: string;
  weight: string;
  requirementsNeeded: RequirementKey[];
  athleteLicenseType: "" | "Original" | "Renewal";
  nationalIdType: "" | "Original" | "Renewal" | "Replacement";
  otherNames: YesNo;
  otherNamesList: string;
  disqualified: YesNo;
  disqualifiedExplanation: string;
  medicalLicenseIssue: YesNo;
  medicalLicenseExplanation: string;
  recordWins: string;
  recordLosses: string;
  recordDraws: string;
  recordNoContests: string;
  fights: FightEvent[];
  licensedBefore: YesNo;
  priorLicenses: PriorLicense[];
  commissionDiscipline: YesNo;
  commissionActions: CommissionAction[];
  pendingCommissionCharges: YesNo;
  commissionCharges: CommissionCharge[];
  convictedCrime: YesNo;
  convictions: Conviction[];
  pendingLawCharges: YesNo;
  pendingLawChargesList: PendingLawCharge[];
  uploads: Partial<Record<UploadKey, string>>;
  selectedPromoterId: string;
  selectedPromotionName: string;
  certifyTrue: boolean;
  certifyConsequences: boolean;
  certifyHelperOnly: boolean;
  certifyPaymentSeparate: boolean;
  certifyMedicalRequirements: boolean;
  signatureName: string;
  signatureDate: string;
};

export const uploadLabels: Record<UploadKey, string> = {
  bloodwork: "Blood work report",
  physical: "Physical form/document",
  headshot: "Headshot photo",
  photoId: "Driver's license or state-issued photo ID",
  cardio: "Cardio/EKG document",
  additional: "Additional document"
};

export const requirementLabels: Record<RequirementKey, string> = {
  athleteLicenseApplication: "Athlete License Application",
  nationalMmaIdApplication: "National MMA ID Application",
  bloodwork: "Blood Work",
  physical: "Physical",
  headshot: "Headshot Photo",
  photoId: "Driver's License / State ID"
};

export const requirementOptions: RequirementKey[] = [
  "athleteLicenseApplication",
  "nationalMmaIdApplication",
  "bloodwork",
  "physical",
  "headshot",
  "photoId"
];

export const defaultRequirementsNeeded: RequirementKey[] = [
  "athleteLicenseApplication",
  "nationalMmaIdApplication",
  "bloodwork",
  "physical",
  "headshot",
  "photoId"
];

export function paymentTotal(requirementsNeeded: RequirementKey[] = defaultRequirementsNeeded) {
  return (
    (requirementsNeeded.includes("athleteLicenseApplication") ? 75 : 0) +
    (requirementsNeeded.includes("nationalMmaIdApplication") ? 20 : 0)
  );
}

export const defaultApplicationData: ApplicationData = {
  firstName: "",
  middleName: "",
  lastName: "",
  birthDate: "",
  age: "",
  sex: "",
  phone: "",
  email: "",
  street: "",
  city: "",
  state: "CA",
  zip: "",
  country: "United States",
  ssnLast4: "",
  heightFeet: "",
  heightInches: "",
  weight: "",
  requirementsNeeded: [...defaultRequirementsNeeded],
  athleteLicenseType: "Original",
  nationalIdType: "Original",
  otherNames: "no",
  otherNamesList: "",
  disqualified: "no",
  disqualifiedExplanation: "",
  medicalLicenseIssue: "no",
  medicalLicenseExplanation: "",
  recordWins: "0",
  recordLosses: "0",
  recordDraws: "0",
  recordNoContests: "0",
  fights: [],
  licensedBefore: "no",
  priorLicenses: [],
  commissionDiscipline: "no",
  commissionActions: [],
  pendingCommissionCharges: "no",
  commissionCharges: [],
  convictedCrime: "no",
  convictions: [],
  pendingLawCharges: "no",
  pendingLawChargesList: [],
  uploads: {},
  selectedPromoterId: independentPromoterId,
  selectedPromotionName: independentPromotionName,
  certifyTrue: false,
  certifyConsequences: false,
  certifyHelperOnly: false,
  certifyPaymentSeparate: false,
  certifyMedicalRequirements: false,
  signatureName: "",
  signatureDate: new Date().toISOString().slice(0, 10)
};

export function calculateAge(mmddyyyy: string) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(mmddyyyy.trim());
  if (!match) return "";
  const month = Number(match[1]) - 1;
  const day = Number(match[2]);
  const year = Number(match[3]);
  const birth = new Date(year, month, day);
  if (
    Number.isNaN(birth.getTime()) ||
    birth.getFullYear() !== year ||
    birth.getMonth() !== month ||
    birth.getDate() !== day
  ) {
    return "";
  }
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hasBirthdayPassed =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hasBirthdayPassed) age -= 1;
  return age >= 0 && age < 120 ? String(age) : "";
}

export function formatBirthDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function fullName(data: Pick<ApplicationData, "firstName" | "middleName" | "lastName">) {
  return [data.firstName, data.middleName, data.lastName].filter(Boolean).join(" ").trim();
}

export function fightRecordTotal(data: ApplicationData) {
  return (
    Number(data.recordWins || 0) +
    Number(data.recordLosses || 0) +
    Number(data.recordDraws || 0) +
    Number(data.recordNoContests || 0)
  );
}
