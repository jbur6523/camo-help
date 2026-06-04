"use client";

import type { UseFormReturn } from "react-hook-form";
import { Field, YesNoChoice } from "@/components/FormBits";
import type { ApplicationData, Conviction, PendingLawCharge, YesNo } from "@/lib/types";

const blankConviction: Conviction = { offense: "", convictionDate: "", location: "", sentence: "" };
const blankPending: PendingLawCharge = { offense: "", offenseDate: "", location: "", hearingDate: "" };

export function StepLegalQuestions({ form }: { form: UseFormReturn<ApplicationData> }) {
  const { register, watch, setValue, formState } = form;
  const convictions = watch("convictions") || [];
  const pending = watch("pendingLawChargesList") || [];

  return (
    <>
      <h2 className="step-title">Criminal / Legal</h2>
      <p className="step-help">Answer these carefully. Explanations are required when you answer yes.</p>
      <div className="field-grid">
        <YesNoChoice
          label="Have you been convicted of a crime in the past 10 years?"
          value={watch("convictedCrime")}
          onChange={(value: YesNo) => setValue("convictedCrime", value, { shouldDirty: true })}
        />
        {watch("convictedCrime") === "yes" ? (
          <div>
            <div className="inline-actions">
              <span className="field-label">Conviction entries</span>
              <button
                className="button ghost"
                type="button"
                onClick={() => setValue("convictions", [...convictions, { ...blankConviction }], { shouldDirty: true })}
              >
                Add
              </button>
            </div>
            <div className="entry-list">
              {convictions.map((_, index) => (
                <div className="entry-block" key={index}>
                  <Field label="Offense" name={`convictions.${index}.offense`} register={register} errors={formState.errors} required />
                  <Field
                    label="Date of conviction"
                    name={`convictions.${index}.convictionDate`}
                    register={register}
                    errors={formState.errors}
                    required
                  />
                  <Field label="City/state/country" name={`convictions.${index}.location`} register={register} errors={formState.errors} required />
                  <Field label="Sentence" name={`convictions.${index}.sentence`} register={register} errors={formState.errors} required />
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setValue("convictions", convictions.filter((__, i) => i !== index), { shouldDirty: true })}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {convictions.length === 0 ? <p className="error">Add at least one conviction entry.</p> : null}
            </div>
          </div>
        ) : null}

        <YesNoChoice
          label="Are there any charges pending against you by any law enforcement agency?"
          value={watch("pendingLawCharges")}
          onChange={(value: YesNo) => setValue("pendingLawCharges", value, { shouldDirty: true })}
        />
        {watch("pendingLawCharges") === "yes" ? (
          <div>
            <div className="inline-actions">
              <span className="field-label">Pending law enforcement charges</span>
              <button
                className="button ghost"
                type="button"
                onClick={() => setValue("pendingLawChargesList", [...pending, { ...blankPending }], { shouldDirty: true })}
              >
                Add
              </button>
            </div>
            <div className="entry-list">
              {pending.map((_, index) => (
                <div className="entry-block" key={index}>
                  <Field label="Offense" name={`pendingLawChargesList.${index}.offense`} register={register} errors={formState.errors} required />
                  <Field
                    label="Date of offense"
                    name={`pendingLawChargesList.${index}.offenseDate`}
                    register={register}
                    errors={formState.errors}
                    required
                  />
                  <Field
                    label="City/state/country"
                    name={`pendingLawChargesList.${index}.location`}
                    register={register}
                    errors={formState.errors}
                    required
                  />
                  <Field
                    label="Hearing or trial date"
                    name={`pendingLawChargesList.${index}.hearingDate`}
                    register={register}
                    errors={formState.errors}
                    required
                  />
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() =>
                      setValue(
                        "pendingLawChargesList",
                        pending.filter((__, i) => i !== index),
                        { shouldDirty: true }
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              {pending.length === 0 ? <p className="error">Add at least one pending charge.</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
