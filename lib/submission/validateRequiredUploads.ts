import { requirementLabels, type ApplicationData, type RequirementKey, type UploadKey } from "@/lib/types";

type UploadedAttachmentMap = Partial<Record<UploadKey, unknown[]>>;

const requiredUploadGroups: Array<{
  requirement: Extract<RequirementKey, "bloodwork" | "physical" | "cardio" | "headshot" | "photoId">;
  uploadKey: Extract<UploadKey, "bloodwork" | "physical" | "cardio" | "headshot" | "photoId">;
}> = [
  { requirement: "bloodwork", uploadKey: "bloodwork" },
  { requirement: "physical", uploadKey: "physical" },
  { requirement: "cardio", uploadKey: "cardio" },
  { requirement: "headshot", uploadKey: "headshot" },
  { requirement: "photoId", uploadKey: "photoId" }
];

export class MissingRequiredUploadsError extends Error {
  missingGroups: string[];

  constructor(missingGroups: string[]) {
    super(`Missing required upload group${missingGroups.length === 1 ? "" : "s"}: ${missingGroups.join(", ")}.`);
    this.name = "MissingRequiredUploadsError";
    this.missingGroups = missingGroups;
  }
}

export function assertRequiredUploadsPresent(application: Pick<ApplicationData, "requirementsNeeded">, uploads: UploadedAttachmentMap) {
  const requirementsNeeded = application.requirementsNeeded || [];
  const missingGroups = requiredUploadGroups
    .filter(({ requirement, uploadKey }) => requirementsNeeded.includes(requirement) && !(uploads[uploadKey] || []).length)
    .map(({ requirement }) => requirementLabels[requirement]);

  if (missingGroups.length) {
    throw new MissingRequiredUploadsError(missingGroups);
  }
}
