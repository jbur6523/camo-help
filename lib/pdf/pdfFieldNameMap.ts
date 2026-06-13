import type { ApplicationData } from "@/lib/types";

export const athleteLicenseTemplatePath = "/templates/Camo_Athlete_License_Final.pdf";
export const nationalIdTemplatePath = "/templates/National ID form 0 Fillable.pdf";

export type AcroFormFieldPlan = {
  text: Record<string, string>;
  checkboxes: Record<string, boolean>;
  signatureFields?: string[];
};

export type AthleteOverflowPlan = {
  fightStartIndex: number;
  priorLicenseStartIndex: number;
  disciplineStartIndex: number;
  commissionChargeStartIndex: number;
  convictionStartIndex: number;
  pendingLawChargeStartIndex: number;
  longSections: Partial<Record<OverflowSection, boolean>>;
};

export type OverflowSection =
  | "fights"
  | "priorLicenses"
  | "discipline"
  | "commissionCharges"
  | "convictions"
  | "pendingLawCharges";

const longTextLimit = 92;

export function nationalIdFieldPlan(data: ApplicationData): AcroFormFieldPlan {
  return {
    text: {
      national_id_last_name: data.lastName,
      national_id_first_name: data.firstName,
      national_id_middle_name: data.middleName,
      national_id_birth_date: data.birthDate,
      national_id_signature: data.signatureName,
      national_id_signature_date: data.signatureDate
    },
    checkboxes: {
      national_id_original: data.nationalIdType === "Original",
      national_id_renewal: data.nationalIdType === "Renewal",
      national_id_replacement: data.nationalIdType === "Replacement",
      national_id_fee_20: true,
      profile_confirmed: true
    },
    signatureFields: ["national_id_signature"]
  };
}

export function athleteLicenseFieldPlan(data: ApplicationData, overflow: AthleteOverflowPlan): AcroFormFieldPlan {
  return {
    text: {
      athlete_last_name: data.lastName,
      athlete_first_name: data.firstName,
      athlete_middle_name: data.middleName,
      athlete_ssn_last4: data.ssnLast4,
      athlete_street: data.street,
      athlete_city: data.city,
      athlete_state: data.state,
      athlete_zip: data.zip,
      athlete_country: data.country,
      athlete_phone: data.phone,
      athlete_email: data.email,
      athlete_age: data.age,
      athlete_birth_date: data.birthDate,
      athlete_height_feet: data.heightFeet,
      athlete_height_inches: data.heightInches,
      athlete_weight: data.weight,
      athlete_record_wins: data.recordWins,
      athlete_record_losses: data.recordLosses,
      athlete_record_draws: data.recordDraws,
      athlete_record_no_contests: data.recordNoContests,
      ...fightSummaryFields(data, overflow),
      athlete_other_names_list: data.otherNames === "yes" ? data.otherNamesList : "",
      athlete_disqualified_explain_1: splitText(data.disqualifiedExplanation)[0],
      athlete_disqualified_explain_2: splitText(data.disqualifiedExplanation)[1],
      athlete_medical_license_issue_explain_1: splitText(data.medicalLicenseExplanation)[0],
      athlete_medical_license_issue_explain_2: splitText(data.medicalLicenseExplanation)[1],
      ...priorLicenseFields(data, overflow),
      ...disciplineFields(data, overflow),
      ...commissionChargeFields(data, overflow),
      ...convictionFields(data, overflow),
      ...pendingLawChargeFields(data, overflow),
      "athlete_signature_es_:signer:signature": data.signatureName,
      athlete_signature_date: data.signatureDate
    },
    checkboxes: {
      athlete_application_original: data.athleteLicenseType === "Original",
      athlete_application_renewal: data.athleteLicenseType === "Renewal",
      athlete_license_fee_75: true,
      athlete_sex_male: data.sex === "Male",
      athlete_sex_female: data.sex === "Female",
      athlete_other_names_yes: data.otherNames === "yes",
      athlete_other_names_no: data.otherNames !== "yes",
      athlete_disqualified_yes: data.disqualified === "yes",
      athlete_disqualified_no: data.disqualified !== "yes",
      athlete_medical_license_issue_yes: data.medicalLicenseIssue === "yes",
      athlete_medical_license_issue_no: data.medicalLicenseIssue !== "yes",
      athlete_discipline_yes: data.commissionDiscipline === "yes",
      athlete_discipline_no: data.commissionDiscipline !== "yes",
      athlete_pending_commission_charges_yes: data.pendingCommissionCharges === "yes",
      athlete_pending_commission_charges_no: data.pendingCommissionCharges !== "yes",
      athlete_crime_conviction_yes: data.convictedCrime === "yes",
      athlete_crime_conviction_no: data.convictedCrime !== "yes",
      athlete_pending_law_charges_yes: data.pendingLawCharges === "yes",
      athlete_pending_law_charges_no: data.pendingLawCharges !== "yes"
    },
    signatureFields: ["athlete_signature_es_:signer:signature"]
  };
}

export function athleteOverflowPlan(data: ApplicationData): AthleteOverflowPlan {
  return {
    fightStartIndex: overflowStart(data.fights.map(fightSummary), 3),
    priorLicenseStartIndex: overflowStart(data.priorLicenses.map((entry) => entryText([entry.licenseType, entry.licenseYear, entry.authority])), 2),
    disciplineStartIndex: overflowStart(data.commissionActions.map((entry) => entryText([entry.licenseType, entry.actionTaken, entry.reason, entry.date])), 2),
    commissionChargeStartIndex: overflowStart(data.commissionCharges.map((entry) => entryText([entry.offense, entry.offenseDate, entry.authority, entry.hearingDate])), 2),
    convictionStartIndex: overflowStart(data.convictions.map((entry) => entryText([entry.offense, entry.convictionDate, entry.location, entry.sentence])), 3),
    pendingLawChargeStartIndex: overflowStart(data.pendingLawChargesList.map((entry) => entryText([entry.offense, entry.offenseDate, entry.location, entry.hearingDate])), 3),
    longSections: {}
  };
}

export function fightSummary(fight: ApplicationData["fights"][number]) {
  return [fight.promoter, fight.state, fight.opponent, fight.outcome, fight.date].filter(Boolean).join(" | ");
}

function fightSummaryFields(data: ApplicationData, overflow: AthleteOverflowPlan) {
  const fields: Record<string, string> = {};
  data.fights.slice(0, 3).forEach((fight, index) => {
    fields[`athlete_fight_summary_${index + 1}`] =
      overflow.fightStartIndex <= index ? "See attached continuation sheet." : fightSummary(fight);
  });
  return fields;
}

function priorLicenseFields(data: ApplicationData, overflow: AthleteOverflowPlan) {
  const fields: Record<string, string> = {};
  data.priorLicenses.slice(0, 2).forEach((entry, index) => {
    const useContinuation = overflow.priorLicenseStartIndex <= index;
    fields[`athlete_prior_license_type_${index + 1}`] = useContinuation ? "See attached continuation sheet." : entry.licenseType;
    fields[`athlete_prior_license_year_${index + 1}`] = useContinuation ? "" : entry.licenseYear;
    fields[`athlete_prior_license_authority_${index + 1}`] = useContinuation ? "" : entry.authority;
  });
  return fields;
}

function disciplineFields(data: ApplicationData, overflow: AthleteOverflowPlan) {
  const fields: Record<string, string> = {};
  data.commissionActions.slice(0, 2).forEach((entry, index) => {
    const suffix = index + 1;
    const useContinuation = overflow.disciplineStartIndex <= index;
    fields[`athlete_discipline_license_type_${suffix}`] = useContinuation ? "See attached continuation sheet." : entry.licenseType;
    fields[`athlete_discipline_action_taken_${suffix}`] = useContinuation ? "" : entry.actionTaken;
    fields[`athlete_discipline_reason_date_${suffix}`] = useContinuation ? "" : [entry.reason, entry.date].filter(Boolean).join(" / ");
  });
  return fields;
}

function commissionChargeFields(data: ApplicationData, overflow: AthleteOverflowPlan) {
  const fields: Record<string, string> = {};
  data.commissionCharges.slice(0, 2).forEach((entry, index) => {
    const suffix = index + 1;
    const useContinuation = overflow.commissionChargeStartIndex <= index;
    fields[`athlete_pending_offense_${suffix}`] = useContinuation ? "See attached continuation sheet." : entry.offense;
    fields[`athlete_pending_offense_date_${suffix}`] = useContinuation ? "" : entry.offenseDate;
    fields[`athlete_pending_authority_hearing_${suffix}`] = useContinuation ? "" : [entry.authority, entry.hearingDate].filter(Boolean).join(" / ");
  });
  return fields;
}

function convictionFields(data: ApplicationData, overflow: AthleteOverflowPlan) {
  const fields: Record<string, string> = {};
  data.convictions.slice(0, 3).forEach((entry, index) => {
    const suffix = index + 1;
    const useContinuation = overflow.convictionStartIndex <= index;
    fields[`athlete_crime_offense_${suffix}`] = useContinuation ? "See attached continuation sheet." : entry.offense;
    fields[`athlete_crime_conviction_date_${suffix}`] = useContinuation ? "" : entry.convictionDate;
    fields[`athlete_crime_city_state_country_sentence_${suffix}`] = useContinuation ? "" : [entry.location, entry.sentence].filter(Boolean).join(" / ");
  });
  return fields;
}

function pendingLawChargeFields(data: ApplicationData, overflow: AthleteOverflowPlan) {
  const fields: Record<string, string> = {};
  data.pendingLawChargesList.slice(0, 3).forEach((entry, index) => {
    const suffix = index + 1;
    const useContinuation = overflow.pendingLawChargeStartIndex <= index;
    fields[`athlete_pending_law_offense_${suffix}`] = useContinuation ? "See attached continuation sheet." : entry.offense;
    fields[`athlete_pending_law_offense_date_${suffix}`] = useContinuation ? "" : entry.offenseDate;
    fields[`athlete_pending_law_city_state_country_hearing_date_${suffix}`] = useContinuation ? "" : [entry.location, entry.hearingDate].filter(Boolean).join(" / ");
  });
  return fields;
}

function overflowStart(entries: string[], fieldLimit: number) {
  const longIndex = entries.findIndex((entry) => entry.length > longTextLimit);
  if (longIndex >= 0 && longIndex < fieldLimit) return longIndex;
  return entries.length > fieldLimit ? fieldLimit : Number.POSITIVE_INFINITY;
}

function splitText(value: string) {
  const clean = value || "";
  return [clean.slice(0, longTextLimit), clean.slice(longTextLimit, longTextLimit * 2)];
}

function entryText(parts: string[]) {
  return parts.filter(Boolean).join(" | ");
}
