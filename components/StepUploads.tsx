"use client";

import { useId } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { ApplicationData, UploadKey, UploadedFiles } from "@/lib/types";
import { defaultApplicationData, uploadLabels } from "@/lib/types";

const acceptedTypes = ".pdf,.jpg,.jpeg,.png,.heic,.heif";
const uploadOrder: UploadKey[] = ["bloodwork", "physical", "headshot", "photoId", "cardio", "additional"];
const requirementDrivenUploadKeys: Array<Exclude<UploadKey, "cardio" | "additional">> = ["bloodwork", "physical", "headshot", "photoId"];
const alwaysVisibleUploadKeys: UploadKey[] = ["cardio", "additional"];

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
  const visibleUploadKeys = uploadOrder.filter(
    (key) => alwaysVisibleUploadKeys.includes(key) || (key !== "cardio" && key !== "additional" && requirementsNeeded.includes(key))
  );
  const requiredUploadKeys = requirementDrivenUploadKeys.filter((key) => requirementsNeeded.includes(key));

  return (
    <>
      <h2 className="step-title">Uploads</h2>
      <p className="step-help">Attach the documents CAMO needs. Files are sent when you submit and are not committed to the repo.</p>
      <div className="field-grid">
        <section className="review-block">
          <div className="review-header">
            <h3>Required Documents</h3>
          </div>
          {requiredUploadKeys.length ? (
            <ul className="compact-list">
              {requiredUploadKeys.map((key) => (
                <li key={key}>{displayUploadLabel(key)}</li>
              ))}
            </ul>
          ) : (
            <p className="step-help">No required uploads based on your selected requirements.</p>
          )}
        </section>

        {visibleUploadKeys.map((key) => {
          const required = key !== "cardio" && key !== "additional" && requiredUploadKeys.includes(key);
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
                Only required for fighters/athletes 40+.
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
  const inputId = useId();
  const filePickerLabel = files.length ? (multiple ? "Add additional file" : "Replace file") : "Choose file";

  return (
    <div className="upload-tile">
      <span className="field-label">
        {displayUploadLabel(uploadKey)} {required ? "*" : ""}
      </span>
      {children ? <small>{children}</small> : null}
      <input
        id={inputId}
        className="upload-file-input"
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
      <label className="upload-file-picker" htmlFor={inputId}>
        {filePickerLabel}
      </label>
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

function displayUploadLabel(key: UploadKey) {
  if (key === "bloodwork") return "Blood Work";
  if (key === "physical") return "Physical Exam";
  if (key === "cardio") return "Cardio/EKG Document";
  if (key === "headshot") return "Headshot/Selfie";
  if (key === "photoId") return "Driver License / State ID";
  if (key === "additional") return "Additional Documentation";
  return uploadLabels[key];
}
