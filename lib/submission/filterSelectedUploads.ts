import type { RequirementKey, UploadKey } from "@/lib/types";

type UploadMap<T> = Partial<Record<UploadKey, T[]>>;

const uploadRequirementKeys: Partial<Record<UploadKey, RequirementKey>> = {
  bloodwork: "bloodwork",
  physical: "physical",
  headshot: "headshot",
  photoId: "photoId"
};

export function filterSelectedUploads<T>(requirementsNeeded: readonly string[] = [], uploads: UploadMap<T> = {}) {
  const selectedRequirements = new Set(requirementsNeeded);
  const filtered: UploadMap<T> = {};

  (Object.keys(uploadRequirementKeys) as UploadKey[]).forEach((uploadKey) => {
    const requirementKey = uploadRequirementKeys[uploadKey];
    if (!requirementKey || !selectedRequirements.has(requirementKey)) return;
    const files = uploads[uploadKey] || [];
    if (files.length) filtered[uploadKey] = files;
  });

  if (uploads.cardio?.length) filtered.cardio = uploads.cardio;
  if (uploads.additional?.length) filtered.additional = uploads.additional;

  return filtered;
}
