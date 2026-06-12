"use client";

import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Field, TextArea, YesNoChoice } from "@/components/FormBits";
import type { ApplicationData, FightEvent, YesNo } from "@/lib/types";

const blankFight: FightEvent = { promoter: "", state: "", opponent: "", outcome: "", date: "" };

export function StepFighterHistory({ form }: { form: UseFormReturn<ApplicationData> }) {
  const { register, watch, setValue, clearErrors, formState } = form;
  const fights = watch("fights") || [];
  const recordTotal =
    Number(watch("recordWins") || 0) +
    Number(watch("recordLosses") || 0) +
    Number(watch("recordDraws") || 0) +
    Number(watch("recordNoContests") || 0);

  useEffect(() => {
    if (recordTotal > fights.length) {
      const missingCount = recordTotal - fights.length;
      const newFights = Array.from({ length: missingCount }, () => ({ ...blankFight }));
      setValue("fights", [...fights, ...newFights], { shouldDirty: true, shouldValidate: true });
    }
    if (recordTotal < fights.length) {
      const extraFieldNames = fights.slice(recordTotal).flatMap((_, offset) => {
        const index = recordTotal + offset;
        return [
          `fights.${index}.promoter`,
          `fights.${index}.state`,
          `fights.${index}.date`,
          `fights.${index}.opponent`,
          `fights.${index}.outcome`
        ];
      });
      clearErrors(extraFieldNames as never[]);
    }
  }, [clearErrors, fights, recordTotal, setValue]);

  return (
    <>
      <h2 className="step-title">Fighter History</h2>
      <p className="step-help">Answer the history questions and list verifiable amateur fights if you have competed.</p>
      <div className="field-grid">
        <YesNoChoice
          label="Have you ever used any other name(s)?"
          value={watch("otherNames")}
          onChange={(value: YesNo) => setValue("otherNames", value, { shouldDirty: true })}
        />
        {watch("otherNames") === "yes" ? (
          <TextArea label="List name(s)" name="otherNamesList" register={register} errors={formState.errors} required />
        ) : null}

        <YesNoChoice
          label="Have you ever been disqualified in any competition?"
          value={watch("disqualified")}
          onChange={(value: YesNo) => setValue("disqualified", value, { shouldDirty: true })}
        />
        {watch("disqualified") === "yes" ? (
          <TextArea label="Explain disqualification" name="disqualifiedExplanation" register={register} errors={formState.errors} required />
        ) : null}

        <YesNoChoice
          label="Has your license ever been denied, suspended, or revoked for medical reasons other than HIV, HBV, or HCV?"
          value={watch("medicalLicenseIssue")}
          onChange={(value: YesNo) => setValue("medicalLicenseIssue", value, { shouldDirty: true })}
        />
        {watch("medicalLicenseIssue") === "yes" ? (
          <TextArea
            label="Explain medical license issue"
            name="medicalLicenseExplanation"
            register={register}
            errors={formState.errors}
            required
          />
        ) : null}

        <div>
          <span className="field-label">Amateur MMA record</span>
          <p className="fine-print record-note">
            CAMO requires verifiable event details for every fight listed in your amateur record.
          </p>
          <div className="field-grid two-col">
            <Field label="Wins" name="recordWins" register={register} errors={formState.errors} required inputMode="numeric" />
            <Field label="Losses" name="recordLosses" register={register} errors={formState.errors} required inputMode="numeric" />
            <Field label="Draws" name="recordDraws" register={register} errors={formState.errors} required inputMode="numeric" />
            <Field
              label="No contests"
              name="recordNoContests"
              register={register}
              errors={formState.errors}
              required
              inputMode="numeric"
            />
          </div>
        </div>

        {recordTotal > 0 ? (
          <div>
            <div className="fight-summary">
              <span>Verifiable amateur events</span>
              <strong>Total fights listed: {recordTotal}</strong>
              <strong>Fight details required: {recordTotal}</strong>
            </div>
            <div className="entry-list">
              {fights.map((_, index) => (
                <div className="entry-block fight-card" key={index}>
                  <div className="fight-card-heading">
                    <h3>{index < recordTotal ? `Fight ${index + 1}` : `Extra fight ${index + 1}`}</h3>
                    {index >= recordTotal ? <span>Saved, not required</span> : null}
                  </div>
                  <Field
                    label="Promoter/Promotion"
                    name={`fights.${index}.promoter`}
                    register={register}
                    errors={formState.errors}
                    required={index < recordTotal}
                  />
                  <div className="field-grid two-col">
                    <Field
                      label="State"
                      name={`fights.${index}.state`}
                      register={register}
                      errors={formState.errors}
                      required={index < recordTotal}
                    />
                    <Field
                      label="Date of fight"
                      name={`fights.${index}.date`}
                      register={register}
                      errors={formState.errors}
                      required={index < recordTotal}
                    />
                  </div>
                  <Field
                    label="Opponent"
                    name={`fights.${index}.opponent`}
                    register={register}
                    errors={formState.errors}
                    required={index < recordTotal}
                  />
                  <Field
                    label="Outcome"
                    name={`fights.${index}.outcome`}
                    register={register}
                    errors={formState.errors}
                    required={index < recordTotal}
                  />
                </div>
              ))}
              <button
                className="button secondary add-fight-button"
                type="button"
                onClick={() => setValue("fights", [...fights, { ...blankFight }], { shouldDirty: true })}
              >
                Add another fight detail card
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
