"use client";

import type { UseFormReturn } from "react-hook-form";
import type { ApplicationData } from "@/lib/types";
import { defaultRequirementsNeeded, paymentTotal } from "@/lib/types";

export function StepApplicationType({ form }: { form: UseFormReturn<ApplicationData> }) {
  const { setValue, watch } = form;
  const athleteLicenseType = watch("athleteLicenseType");
  const nationalIdType = watch("nationalIdType");
  const requirementsNeeded = watch("requirementsNeeded") || defaultRequirementsNeeded;
  const needsAthleteLicense = requirementsNeeded.includes("athleteLicenseApplication");
  const needsNationalId = requirementsNeeded.includes("nationalMmaIdApplication");

  return (
    <>
      <h2 className="step-title">Application Type</h2>
      <p className="step-help">Choose the Athlete License and National MMA ID card type you need.</p>
      <div className="field-grid">
        <div className="field">
          <span className="field-label">Athlete License type</span>
          <div className="choice-row">
            {(["Original", "Renewal"] as const).map((type) => (
              <button
                aria-pressed={athleteLicenseType === type}
                className="choice-button"
                key={type}
                type="button"
                onClick={() => setValue("athleteLicenseType", type, { shouldDirty: true, shouldValidate: true })}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">National MMA ID type</span>
          <div className="choice-row three">
            {(["Original", "Renewal", "Replacement"] as const).map((type) => (
              <button
                aria-pressed={nationalIdType === type}
                className="choice-button"
                key={type}
                type="button"
                onClick={() => setValue("nationalIdType", type, { shouldDirty: true, shouldValidate: true })}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
        <div className="fee-box">
          {needsAthleteLicense ? (
            <div className="fee-line">
              <span>Athlete License</span>
              <strong>$75</strong>
            </div>
          ) : null}
          {needsNationalId ? (
            <div className="fee-line">
              <span>National MMA ID Card</span>
              <strong>$20</strong>
            </div>
          ) : null}
          <div className="fee-line">
            <span>Estimated total due to CAMO</span>
            <strong>${paymentTotal(requirementsNeeded)}</strong>
          </div>
        </div>
        <div className="notice">
          <strong>Payment is separate.</strong> This app prepares and sends documents. Complete payment through CAMO after submission.
        </div>
        <p className="fine-print">
          Selected: Athlete License {athleteLicenseType || "not selected"}, National MMA ID {nationalIdType || "not selected"}.
        </p>
      </div>
    </>
  );
}
