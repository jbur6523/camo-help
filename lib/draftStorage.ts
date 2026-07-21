import {
  defaultApplicationData,
  requirementOptions,
  type ApplicationData,
  type CommissionAction,
  type CommissionCharge,
  type Conviction,
  type FightEvent,
  type PendingLawCharge,
  type PriorLicense
} from "@/lib/types";

export const applicationDraftSchemaVersion = 2;
export const applicationDraftStorageKey = "camo-help-application-v2";
export const legacyApplicationDraftStorageKey = "camo-help-application-v1";
export const applicationDraftExpiryMs = 24 * 60 * 60 * 1000;

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type ApplicationDraftEnvelope = {
  schemaVersion: typeof applicationDraftSchemaVersion;
  createdAt: number;
  updatedAt: number;
  data: ApplicationData;
};

const nonPersistentFields = new Set<keyof ApplicationData>([
  "uploads",
  "ssnLast4",
  "signatureName",
  "signatureDate",
  "certifyTrue",
  "certifyConsequences",
  "certifyHelperOnly",
  "certifyPaymentSeparate",
  "certifyAthleteLicenseWaiver",
  "certifyBloodworkRequirements",
  "certifyPhysicalRequirements"
]);

export function saveApplicationDraft(storage: DraftStorage, value: unknown, now = Date.now()) {
  try {
    const existing = readEnvelope(storage.getItem(applicationDraftStorageKey));
    const createdAt = existing && now - existing.updatedAt <= applicationDraftExpiryMs ? existing.createdAt : now;
    const envelope: ApplicationDraftEnvelope = {
      schemaVersion: applicationDraftSchemaVersion,
      createdAt,
      updatedAt: now,
      data: sanitizeApplicationData(value)
    };
    storage.setItem(applicationDraftStorageKey, JSON.stringify(envelope));
    storage.removeItem(legacyApplicationDraftStorageKey);
  } catch {
    // Draft recovery is optional and must never interrupt the application flow.
  }
}

export function loadApplicationDraft(storage: DraftStorage, now = Date.now()): ApplicationData | null {
  try {
    storage.removeItem(legacyApplicationDraftStorageKey);
    const raw = storage.getItem(applicationDraftStorageKey);
    const envelope = readEnvelope(raw);
    if (!envelope || now - envelope.updatedAt > applicationDraftExpiryMs || envelope.updatedAt > now + 60_000) {
      if (raw !== null) storage.removeItem(applicationDraftStorageKey);
      return null;
    }
    return sanitizeApplicationData(envelope.data);
  } catch {
    return null;
  }
}

export function removeExpiredApplicationDraft(storage: DraftStorage, now = Date.now()) {
  try {
    const raw = storage.getItem(applicationDraftStorageKey);
    const envelope = readEnvelope(raw);
    const shouldRemove = raw !== null && (
      !envelope || now - envelope.updatedAt > applicationDraftExpiryMs || envelope.updatedAt > now + 60_000
    );
    if (shouldRemove) storage.removeItem(applicationDraftStorageKey);
    return shouldRemove;
  } catch {
    return false;
  }
}

export function clearApplicationDraft(storage: DraftStorage) {
  try {
    storage.removeItem(applicationDraftStorageKey);
    storage.removeItem(legacyApplicationDraftStorageKey);
  } catch {
    // Submission success must not be reversed by unavailable browser storage.
  }
}

function readEnvelope(raw: string | null): ApplicationDraftEnvelope | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ApplicationDraftEnvelope>;
    if (
      parsed.schemaVersion !== applicationDraftSchemaVersion ||
      typeof parsed.createdAt !== "number" ||
      typeof parsed.updatedAt !== "number" ||
      !parsed.data ||
      typeof parsed.data !== "object" ||
      Array.isArray(parsed.data)
    ) {
      return null;
    }
    return parsed as ApplicationDraftEnvelope;
  } catch {
    return null;
  }
}

function sanitizeApplicationData(value: unknown): ApplicationData {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<ApplicationData>) : {};
  const sanitized = { ...defaultApplicationData };
  for (const key of Object.keys(defaultApplicationData) as Array<keyof ApplicationData>) {
    if (nonPersistentFields.has(key)) continue;
    const candidate = source[key];
    const fallback = defaultApplicationData[key];
    if (typeof fallback === "string" && typeof candidate === "string") {
      (sanitized as Record<string, unknown>)[key] = candidate;
    }
  }

  sanitized.requirementsNeeded = Array.isArray(source.requirementsNeeded)
    ? requirementOptions.filter((requirement) => source.requirementsNeeded?.includes(requirement))
    : [...defaultApplicationData.requirementsNeeded];
  sanitized.fights = sanitizeRecordArray<FightEvent>(source.fights, ["promoter", "state", "opponent", "outcome", "date"]);
  sanitized.priorLicenses = sanitizeRecordArray<PriorLicense>(source.priorLicenses, ["licenseType", "licenseYear", "authority"]);
  sanitized.commissionActions = sanitizeRecordArray<CommissionAction>(source.commissionActions, ["licenseType", "actionTaken", "reason", "date"]);
  sanitized.commissionCharges = sanitizeRecordArray<CommissionCharge>(source.commissionCharges, ["offense", "offenseDate", "authority", "hearingDate"]);
  sanitized.convictions = sanitizeRecordArray<Conviction>(source.convictions, ["offense", "convictionDate", "location", "sentence"]);
  sanitized.pendingLawChargesList = sanitizeRecordArray<PendingLawCharge>(source.pendingLawChargesList, ["offense", "offenseDate", "location", "hearingDate"]);
  sanitized.uploads = {};
  return sanitized;
}

function sanitizeRecordArray<T extends Record<string, string>>(value: unknown, keys: Array<keyof T>): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = {} as T;
    for (const key of keys) {
      const field = (item as Record<string, unknown>)[String(key)];
      record[key] = (typeof field === "string" ? field : "") as T[keyof T];
    }
    return [record];
  });
}
