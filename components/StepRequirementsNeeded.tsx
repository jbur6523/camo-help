"use client";

import type { UseFormReturn } from "react-hook-form";
import {
  bloodTestRequirements,
  combatTrioPhoneDisplay,
  combatTrioPhoneHref,
  physicalMdDoAcknowledgement
} from "@/lib/medicalRequirements";
import type { ApplicationData } from "@/lib/types";
import { requirementLabels, requirementOptions } from "@/lib/types";

export function StepRequirementsNeeded({ form }: { form: UseFormReturn<ApplicationData> }) {
  const { register, watch, formState } = form;
  const selected = watch("requirementsNeeded") || [];
  const showPhysicalRequirement = selected.includes("physical");
  const showBloodworkRequirement = selected.includes("bloodwork");

  return (
    <>
      <h2 className="step-title">What do you still need help submitting?</h2>
      <p className="step-help">Everything is selected by default. Uncheck anything you have already submitted to CAMO.</p>
      <div className="review-block">
        {requirementOptions.map((key) => (
          <label className="checkbox-line" key={key}>
            <input type="checkbox" value={key} {...register("requirementsNeeded")} />
            {requirementLabel(key)}
          </label>
        ))}
        {!selected.length || formState.errors.requirementsNeeded ? (
          <div className="error">Select at least one item to submit now.</div>
        ) : null}
      </div>
      {showPhysicalRequirement || showBloodworkRequirement ? (
        <div className="notice requirements-note">
          {showPhysicalRequirement ? (
            <p>
              <strong>Physical requirement:</strong> {physicalMdDoAcknowledgement}
            </p>
          ) : null}
          {showBloodworkRequirement ? (
            <>
              <p>
                <strong>Blood work requirement:</strong> Blood test must include:
              </p>
              <ul className="compact-list">
                <li>{bloodTestRequirements[0]}</li>
                <li>{bloodTestRequirements[1]}</li>
                <li>
                  {bloodTestRequirements[2]} <strong>Surface Antigen</strong>
                </li>
              </ul>
              <p>
                Call Request A Test at {combatTrioPhoneDisplay} and ask to book the Combat Trio Blood Test for your CAMO blood work.
              </p>
              <a className="notice-link" href={combatTrioPhoneHref}>
                Call Now To Book Your Blood Work - Combat Trio Blood Test
              </a>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function requirementLabel(key: (typeof requirementOptions)[number]) {
  if (key === "bloodwork") return "Blood Work (HIV 4th Gen, Hep C Antibody, Hep B SURFACE ANTIGEN)";
  if (key === "physical") return "Physical (MUST BE DONE BY MD/DO)";
  return requirementLabels[key];
}
