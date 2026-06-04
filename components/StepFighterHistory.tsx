"use client";

import type { UseFormReturn } from "react-hook-form";
import { Field, TextArea, YesNoChoice } from "@/components/FormBits";
import type { ApplicationData, FightEvent, YesNo } from "@/lib/types";

const blankFight: FightEvent = { promoter: "", state: "", opponent: "", outcome: "", date: "" };

export function StepFighterHistory({ form }: { form: UseFormReturn<ApplicationData> }) {
  const { register, watch, setValue, formState } = form;
  const fights = watch("fights") || [];
  const recordTotal =
    Number(watch("recordWins") || 0) +
    Number(watch("recordLosses") || 0) +
    Number(watch("recordDraws") || 0) +
    Number(watch("recordNoContests") || 0);

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
            <div className="inline-actions">
              <span className="field-label">Verifiable amateur events</span>
              <button
                className="button ghost"
                type="button"
                onClick={() => setValue("fights", [...fights, { ...blankFight }], { shouldDirty: true })}
              >
                Add fight
              </button>
            </div>
            <div className="entry-list">
              {fights.map((_, index) => (
                <div className="entry-block" key={index}>
                  <Field label="Promoter" name={`fights.${index}.promoter`} register={register} errors={formState.errors} required />
                  <div className="field-grid two-col">
                    <Field label="State" name={`fights.${index}.state`} register={register} errors={formState.errors} required />
                    <Field label="Date of fight" name={`fights.${index}.date`} register={register} errors={formState.errors} required />
                  </div>
                  <Field label="Opponent" name={`fights.${index}.opponent`} register={register} errors={formState.errors} required />
                  <Field label="Outcome" name={`fights.${index}.outcome`} register={register} errors={formState.errors} required />
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setValue("fights", fights.filter((__, fightIndex) => fightIndex !== index), { shouldDirty: true })}
                  >
                    Remove fight
                  </button>
                </div>
              ))}
              {fights.length === 0 ? <p className="error">Add at least one verifiable event for a non-zero record.</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
