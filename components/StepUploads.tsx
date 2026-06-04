"use client";

import type { UseFormReturn } from "react-hook-form";
import type { ApplicationData, UploadKey, UploadedFiles } from "@/lib/types";
import { uploadLabels } from "@/lib/types";

const acceptedTypes = ".pdf,.jpg,.jpeg,.png,.heic,.heif";

export function StepUploads({
  form,
  uploadFiles,
  onFileChange
}: {
  form: UseFormReturn<ApplicationData>;
  uploadFiles: UploadedFiles;
  onFileChange: (key: UploadKey, file?: File) => void;
}) {
  const age = Number(form.watch("age") || 0);
  const requiredUploads: UploadKey[] = age >= 40 ? ["bloodwork", "physical", "headshot", "photoId", "cardio"] : ["bloodwork", "physical", "headshot", "photoId"];

  return (
    <>
      <h2 className="step-title">Uploads</h2>
      <p className="step-help">Attach the documents CAMO needs. Files are sent when you submit and are not committed to the repo.</p>
      <div className="field-grid">
        {(["bloodwork", "physical", "headshot", "photoId", "cardio", "additional"] as UploadKey[]).map((key) => {
          const required = requiredUploads.includes(key);
          if (key === "cardio" && age < 40) {
            return (
              <UploadTile key={key} file={uploadFiles[key]} uploadKey={key} required={false} onFileChange={onFileChange}>
                Cardio/EKG is only required if the applicant is 40 or older.
              </UploadTile>
            );
          }
          if (key === "additional") {
            return (
              <UploadTile key={key} file={uploadFiles[key]} uploadKey={key} required={false} onFileChange={onFileChange}>
                Optional. Add any extra supporting document.
              </UploadTile>
            );
          }
          return (
            <UploadTile key={key} file={uploadFiles[key]} uploadKey={key} required={required} onFileChange={onFileChange}>
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
  file,
  onFileChange,
  children
}: {
  uploadKey: UploadKey;
  required: boolean;
  file?: File;
  onFileChange: (key: UploadKey, file?: File) => void;
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
        onChange={(event) => onFileChange(uploadKey, event.currentTarget.files?.[0])}
      />
      {file ? <small>Selected: {file.name}</small> : null}
    </div>
  );
}
