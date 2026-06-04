"use client";

import type { UseFormReturn } from "react-hook-form";
import type { ApplicationData } from "@/lib/types";

export function StepApplicationType({ form }: { form: UseFormReturn<ApplicationData> }) {
  const { register, watch } = form;
  return (
    <>
      <h2 className="step-title">Application Type</h2>
      <p className="step-help">Choose the Athlete License and National MMA ID card type you need.</p>
      <div className="field-grid">
        <div className="field">
          <span className="field-label">Athlete License type</span>
          <div className="choice-row">
            {(["Original", "Renewal"] as const).map((type) => (
              <label key={type}>
                <input type="radio" value={type} {...register("athleteLicenseType", { required: true })} />
                {type}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">National MMA ID type</span>
          <div className="choice-row three">
            {(["Original", "Renewal", "Replacement"] as const).map((type) => (
              <label key={type}>
                <input type="radio" value={type} {...register("nationalIdType", { required: true })} />
                {type}
              </label>
            ))}
          </div>
        </div>
        <div className="fee-box">
          <div className="fee-line">
            <span>Athlete License</span>
            <strong>$75</strong>
          </div>
          <div className="fee-line">
            <span>National MMA ID Card</span>
            <strong>$20</strong>
          </div>
          <div className="fee-line">
            <span>Estimated total due to CAMO</span>
            <strong>$95</strong>
          </div>
        </div>
        <div className="notice">
          <strong>Payment is separate.</strong> This app prepares and sends documents. You will complete payment through CAMO
          after submission.
        </div>
        <p className="fine-print">
          Selected: Athlete License {watch("athleteLicenseType") || "not selected"}, National MMA ID{" "}
          {watch("nationalIdType") || "not selected"}.
        </p>
      </div>
    </>
  );
}
