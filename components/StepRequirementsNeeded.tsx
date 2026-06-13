"use client";

import type { UseFormReturn } from "react-hook-form";
import {
  bloodTestRequirements,
  combatTrioPhoneDisplay,
  combatTrioPhoneHref,
  physicalMdDoAcknowledgement
} from "@/lib/medicalRequirements";
import type { ApplicationData } from "@/lib/types";
import { requirementLabels, requirementOptions, type RequirementKey } from "@/lib/types";

export function StepRequirementsNeeded({
  form,
  rememberedSubmittedRequirements = [],
  onResetRememberedRequirements
}: {
  form: UseFormReturn<ApplicationData>;
  rememberedSubmittedRequirements?: RequirementKey[];
  onResetRememberedRequirements?: () => void;
}) {
  const { register, watch, formState } = form;
  const selected = watch("requirementsNeeded") || [];
  const showPhysicalRequirement = selected.includes("physical");
  const showBloodworkRequirement = selected.includes("bloodwork");
  const rememberedSubmittedLabels = requirementOptions
    .filter((key) => rememberedSubmittedRequirements.includes(key))
    .map((key) => rememberedRequirementLabel(key));

  return (
    <>
      <h2 className="step-title centered-step-title">What do you need help submitting?</h2>
      <p className="step-help">
        {rememberedSubmittedLabels.length
          ? "Items remembered as already submitted on this device are unchecked by default."
          : "Everything is selected by default. Uncheck anything you have already submitted to CAMO."}
      </p>
      {rememberedSubmittedLabels.length ? (
        <div className="notice remembered-requirements-note">
          <p>
            <strong>Remembered on this device:</strong> You previously submitted:
          </p>
          <ul className="remembered-requirements-list">
            {rememberedSubmittedLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
          <p>You can re-check anything you still need to submit again.</p>
          {onResetRememberedRequirements ? (
            <div className="remembered-requirements-reset">
              <p>Use this if a different fighter is using this device.</p>
              <button className="button secondary reset-requirements-button" type="button" onClick={onResetRememberedRequirements}>
                Reset Requirements
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="review-block">
        {requirementOptions.map((key) => {
          const downloadLink = requirementDownloadLink(key);
          return (
            <div className="requirement-checklist-item" key={key}>
              <label className="checkbox-line">
                <input type="checkbox" value={key} {...register("requirementsNeeded")} />
                {requirementLabel(key)}
              </label>
              {downloadLink ? (
                <a
                  className="requirement-download-link"
                  href={downloadLink.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  {...(downloadLink.download ? { download: true } : {})}
                >
                  {downloadLink.label}
                </a>
              ) : null}
            </div>
          );
        })}
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

function rememberedRequirementLabel(key: (typeof requirementOptions)[number]) {
  if (key === "athleteLicenseApplication") return "Athlete License Application";
  if (key === "nationalMmaIdApplication") return "National MMA ID";
  if (key === "bloodwork") return "Blood Work";
  if (key === "physical") return "Physical";
  if (key === "photoId") return "Driver's License / State ID";
  if (key === "headshot") return "Headshot";
  return requirementLabels[key];
}

function requirementDownloadLink(key: (typeof requirementOptions)[number]) {
  if (key === "physical") {
    return {
      href: "/templates/Athlete Physical Form.pdf",
      label: "Download & Print Physical Form",
      download: true
    };
  }
  if (key === "bloodwork") {
    return {
      href: "/templates/CAMO Blood Test Instructions.pdf",
      label: "Download Blood Test Instructions",
      download: false
    };
  }
  return null;
}
