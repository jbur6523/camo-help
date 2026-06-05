"use client";

import type { UseFormReturn } from "react-hook-form";
import type { ApplicationData } from "@/lib/types";
import { requirementLabels, requirementOptions } from "@/lib/types";

export function StepRequirementsNeeded({ form }: { form: UseFormReturn<ApplicationData> }) {
  const { register, watch, formState } = form;
  const selected = watch("requirementsNeeded") || [];

  return (
    <>
      <h2 className="step-title">What do you still need help submitting?</h2>
      <p className="step-help">Everything is selected by default. Uncheck anything you have already submitted to CAMO.</p>
      <div className="review-block">
        {requirementOptions.map((key) => (
          <label className="checkbox-line" key={key}>
            <input type="checkbox" value={key} {...register("requirementsNeeded")} />
            {requirementLabels[key]}
          </label>
        ))}
        {!selected.length || formState.errors.requirementsNeeded ? (
          <div className="error">Select at least one item to submit now.</div>
        ) : null}
      </div>
    </>
  );
}
