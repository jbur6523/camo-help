"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { ApplicationData, UploadKey, UploadedFiles } from "@/lib/types";
import { defaultApplicationData, uploadLabels } from "@/lib/types";

const acceptedTypes = ".pdf,.jpg,.jpeg,.png,.heic,.heif";
const identityPhotoAcceptedTypes = "image/*";
const uploadOrder: UploadKey[] = ["bloodwork", "physical", "headshot", "photoId", "cardio", "additional"];
const requirementDrivenUploadKeys: Array<Exclude<UploadKey, "cardio" | "additional">> = ["bloodwork", "physical", "headshot", "photoId"];
const alwaysVisibleUploadKeys: UploadKey[] = ["cardio", "additional"];

export function StepUploads({
  form,
  uploadFiles,
  onFilesAdd,
  onFileRemove,
  documentCheckEnabled = false
}: {
  form: UseFormReturn<ApplicationData>;
  uploadFiles: UploadedFiles;
  onFilesAdd: (key: UploadKey, files: File[], options?: { replace?: boolean }) => void | Promise<void>;
  onFileRemove: (key: UploadKey, index: number) => void;
  documentCheckEnabled?: boolean;
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
                documentCheckEnabled={documentCheckEnabled}
              >
                Only required for fighters/athletes 40+. Upload a PDF, image, or screenshot of your document. If the file is too large,
                try uploading a screenshot or smaller PDF instead.
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
                documentCheckEnabled={documentCheckEnabled}
              >
                Optional. Add any extra supporting document. Upload a PDF, image, or screenshot of your document. If the file is too
                large, try uploading a screenshot or smaller PDF instead.
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
              documentCheckEnabled={documentCheckEnabled}
            >
              {uploadHelperText(key)}
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
  documentCheckEnabled,
  children
}: {
  uploadKey: UploadKey;
  required: boolean;
  files: File[];
  multiple?: boolean;
  onFilesAdd: (key: UploadKey, files: File[], options?: { replace?: boolean }) => void | Promise<void>;
  onFileRemove: (key: UploadKey, index: number) => void;
  documentCheckEnabled?: boolean;
  children?: React.ReactNode;
}) {
  const inputId = useId();
  const isCameraUpload = uploadKey === "headshot" || uploadKey === "photoId";
  const filePickerLabel = pickerLabel(uploadKey, files.length > 0, Boolean(multiple));
  const [checks, setChecks] = useState<Record<string, CheckState>>({});
  const controllers = useRef(new Map<string, AbortController>());

  useEffect(() => () => {
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
  }, []);

  useEffect(() => {
    const active = new Set(files.map((file, index) => fileIdentity(file, index)));
    controllers.current.forEach((controller, identity) => {
      if (!active.has(identity)) {
        controller.abort();
        controllers.current.delete(identity);
      }
    });
    setChecks((current) => Object.fromEntries(Object.entries(current).filter(([identity]) => active.has(identity))));
  }, [files]);

  const checkerEnabled = documentCheckEnabled && (uploadKey === "bloodwork" || uploadKey === "physical");

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
        accept={isCameraUpload ? identityPhotoAcceptedTypes : acceptedTypes}
        capture={isCameraUpload ? "environment" : undefined}
        multiple={multiple}
        onChange={(event) => {
          const selectedFiles = Array.from(event.currentTarget.files || []);
          if (selectedFiles.length) {
            void onFilesAdd(uploadKey, selectedFiles, { replace: !multiple });
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
              {checkerEnabled ? (
                <DocumentCheckControl
                  file={file}
                  identity={fileIdentity(file, index)}
                  state={checks[fileIdentity(file, index)] || { state: "idle" }}
                  onCheck={() => runCheck(file, fileIdentity(file, index))}
                  onCancel={() => cancelCheck(fileIdentity(file, index))}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  async function runCheck(file: File, identity: string) {
    if (controllers.current.has(identity)) return;
    const controller = new AbortController();
    controllers.current.set(identity, controller);
    setChecks((current) => ({ ...current, [identity]: { state: "checking" } }));
    try {
      const formData = new FormData();
      formData.set("category", uploadKey === "bloodwork" ? "bloodwork" : "physical");
      formData.set("file", file);
      const response = await fetch("/api/document-check", { method: "POST", body: formData, signal: controller.signal });
      const payload = await response.json().catch(() => null) as PublicCheckResponse | null;
      if (controller.signal.aborted || controllers.current.get(identity) !== controller) return;
      if (!payload || !["passed", "review", "unable_to_verify", "unavailable"].includes(payload.state)) {
        setChecks((current) => ({ ...current, [identity]: { state: "unavailable", retryable: true } }));
      } else {
        setChecks((current) => ({ ...current, [identity]: payload }));
      }
    } catch {
      if (!controller.signal.aborted) setChecks((current) => ({ ...current, [identity]: { state: "unavailable", retryable: true } }));
    } finally {
      if (controllers.current.get(identity) === controller) controllers.current.delete(identity);
    }
  }

  function cancelCheck(identity: string) {
    controllers.current.get(identity)?.abort();
    controllers.current.delete(identity);
    setChecks((current) => ({ ...current, [identity]: { state: "idle" } }));
  }
}

type PublicCheckResponse =
  | { state: "passed" }
  | { state: "review"; reasons: string[] }
  | { state: "unable_to_verify" }
  | { state: "unavailable"; retryable: boolean };
type CheckState = PublicCheckResponse | { state: "idle" } | { state: "checking" };

function DocumentCheckControl({
  file,
  identity,
  state,
  onCheck,
  onCancel
}: {
  file: File;
  identity: string;
  state: CheckState;
  onCheck: () => void;
  onCancel: () => void;
}) {
  void file;
  void identity;
  if (state.state === "idle") {
    return <div className="document-check"><small>Optional AI pre-check</small><button type="button" onClick={onCheck}>Run AI Check</button></div>;
  }
  if (state.state === "checking") {
    return <div className="document-check" role="status" aria-busy="true"><small>Checking document…</small><button type="button" onClick={onCancel}>Cancel</button></div>;
  }
  const message = state.state === "passed"
    ? "AI check passed — No obvious issues were detected. Documents are likely to be accepted."
    : state.state === "unable_to_verify"
      ? "Document may need further review — The required information could not be clearly verified from this document."
      : state.state === "unavailable"
        ? "AI check unavailable — We could not review this document automatically. You may continue with your submission."
        : reviewMessage(state.reasons);
  return <div className="document-check" role="status"><small>{message}</small>{state.state === "unavailable" && state.retryable ? <button type="button" onClick={onCheck}>Try again</button> : null}<small>AI checks may be inaccurate and do not guarantee acceptance. CAMO makes the final determination.</small></div>;
}

function reviewMessage(reasons: string[]) {
  const reason = reasons[0];
  const fixed: Record<string, string> = {
    POSSIBLE_NON_PHYSICIAN: "Provider credentials may indicate an NP or PA rather than an MD or DO.",
    POSSIBLE_OTHER_NON_PHYSICIAN: "The provider credentials may not meet CAMO’s physician requirement.",
    HEP_B_ANTIBODY: "The document may show a Hepatitis B Surface Antibody test rather than the required Hepatitis B Surface Antigen test.",
    HEP_B_ANTIGEN_NOT_FOUND: "A Hepatitis B Surface Antigen test could not be clearly identified.",
    PROVIDER_CREDENTIALS_UNREADABLE: "The provider credentials could not be clearly verified.",
    SIGNATURE_NOT_FOUND: "A provider signature could not be clearly identified."
  };
  return `Document may need further review — ${fixed[reason] || "The required information could not be clearly verified from this document."}`;
}

function fileIdentity(file: File, index: number) {
  return `${file.name}:${file.size}:${file.lastModified}:${index}`;
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

function uploadHelperText(key: UploadKey) {
  if (key === "headshot") return "Clear color photo of your face, no sunglasses, similar to a passport photo.";
  if (key === "bloodwork" || key === "physical") {
    return "Upload a PDF, image, or screenshot of your document. If the file is too large, try uploading a screenshot or smaller PDF instead.";
  }
  if (key === "photoId") return "Large phone photos may be too large to submit. Screenshots or smaller photos usually work best.";
  return null;
}

function pickerLabel(key: UploadKey, hasFiles: boolean, multiple: boolean) {
  if (hasFiles) return multiple ? "Add additional file" : key === "headshot" ? "Retake Headshot Photo" : key === "photoId" ? "Retake ID Photo" : "Replace file";
  if (key === "headshot") return "Take Headshot Photo";
  if (key === "photoId") return "Take ID Photo";
  return "Choose file";
}
