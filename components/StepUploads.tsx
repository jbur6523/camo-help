"use client";

import type { UseFormReturn } from "react-hook-form";
import type { ApplicationData, UploadKey, UploadedFiles } from "@/lib/types";
import { defaultApplicationData, uploadLabels } from "@/lib/types";

const acceptedTypes = ".pdf,.jpg,.jpeg,.png,.heic,.heif";

export function StepUploads({
  form,
  uploadFiles,
  onFilesAdd,
  onFileRemove
}: {
  form: UseFormReturn<ApplicationData>;
  uploadFiles: UploadedFiles;
  onFilesAdd: (key: UploadKey, files: File[], options?: { replace?: boolean }) => void;
  onFileRemove: (key: UploadKey, index: number) => void;
}) {
  const requirementsNeeded = form.watch("requirementsNeeded") || defaultApplicationData.requirementsNeeded;
  const requiredUploads: Array<Extract<UploadKey, "bloodwork" | "physical" | "cardio" | "headshot" | "photoId">> = [
    "bloodwork",
    "physical",
    "cardio",
    "headshot",
    "photoId"
  ];

  return (
    <>
      <h2 className="step-title">Uploads</h2>
      <p className="step-help">Attach the documents CAMO needs. Files are sent when you submit and are not committed to the repo.</p>
      <div className="field-grid">
        {(["bloodwork", "physical", "headshot", "photoId", "cardio", "additional"] as UploadKey[]).map((key) => {
          const uploadRequirementKey = key as Extract<UploadKey, "bloodwork" | "physical" | "cardio" | "headshot" | "photoId">;
          const required = requiredUploads.includes(uploadRequirementKey) && requirementsNeeded.includes(uploadRequirementKey);
          if (key === "cardio") {
            return (
              <UploadTile
                key={key}
                files={uploadFiles[key] || []}
                uploadKey={key}
                required={required}
                multiple
                onFilesAdd={onFilesAdd}
                onFileRemove={onFileRemove}
              >
                Optional. Add Cardio/EKG documents if you have them.
              </UploadTile>
            );
          }
          if (key === "additional") {
            return (
              <UploadTile
                key={key}
                files={uploadFiles[key] || []}
                uploadKey={key}
                required={false}
                multiple
                onFilesAdd={onFilesAdd}
                onFileRemove={onFileRemove}
              >
                Optional. Add any extra supporting document.
              </UploadTile>
            );
          }
          const multiple = key === "bloodwork" || key === "physical";
          return (
            <UploadTile
              key={key}
              files={uploadFiles[key] || []}
              uploadKey={key}
              required={required}
              multiple={multiple}
              onFilesAdd={onFilesAdd}
              onFileRemove={onFileRemove}
            >
              {key === "headshot" ? "Clear color photo of your face, no sunglasses, similar to a passport photo." : null}
            </UploadTile>
          );
        })}
      </div>
    </>
  );
}

function UploadTile({
  uploadKey,
  required,
  files,
  multiple,
  onFilesAdd,
  onFileRemove,
  children
}: {
  uploadKey: UploadKey;
  required: boolean;
  files: File[];
  multiple?: boolean;
  onFilesAdd: (key: UploadKey, files: File[], options?: { replace?: boolean }) => void;
  onFileRemove: (key: UploadKey, index: number) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="upload-tile">
      <span className="field-label">
        {uploadLabels[uploadKey]} {required ? "*" : ""}
      </span>
      {children ? <small>{children}</small> : null}
      <input
        type="file"
        accept={acceptedTypes}
        multiple={multiple}
        onChange={(event) => {
          const selectedFiles = Array.from(event.currentTarget.files || []);
          if (selectedFiles.length) {
            onFilesAdd(uploadKey, selectedFiles, { replace: !multiple });
          }
          event.currentTarget.value = "";
        }}
      />
      {files.length ? (
        <ul className="upload-file-list">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.lastModified}-${index}`}>
              <span>{file.name}</span>
              <button type="button" onClick={() => onFileRemove(uploadKey, index)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
