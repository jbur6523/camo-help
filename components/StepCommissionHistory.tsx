"use client";

import type { UseFormReturn } from "react-hook-form";
import { Field, YesNoChoice } from "@/components/FormBits";
import type { ApplicationData, CommissionAction, CommissionCharge, PriorLicense, YesNo } from "@/lib/types";

const blankLicense: PriorLicense = { licenseType: "", licenseYear: "", authority: "" };
const blankAction: CommissionAction = { licenseType: "", actionTaken: "", reason: "", date: "" };
const blankCharge: CommissionCharge = { offense: "", offenseDate: "", authority: "", hearingDate: "" };

export function StepCommissionHistory({ form }: { form: UseFormReturn<ApplicationData> }) {
  const { register, watch, setValue, formState } = form;
  const priorLicenses = watch("priorLicenses") || [];
  const actions = watch("commissionActions") || [];
  const charges = watch("commissionCharges") || [];

  return (
    <>
      <h2 className="step-title">Prior Licenses</h2>
      <p className="step-help">Tell CAMO about commission licenses, discipline, or pending commission matters.</p>
      <div className="field-grid">
        <YesNoChoice
          label="Have you ever been licensed by CSAC, another athletic commission, or similar governmental authority?"
          value={watch("licensedBefore")}
          onChange={(value: YesNo) => setValue("licensedBefore", value, { shouldDirty: true })}
        />
        {watch("licensedBefore") === "yes" ? (
          <RepeatingBlock
            title="Prior license entries"
            onAdd={() => setValue("priorLicenses", [...priorLicenses, { ...blankLicense }], { shouldDirty: true })}
            empty="Add at least one prior license."
          >
            {priorLicenses.map((_, index) => (
              <div className="entry-block" key={index}>
                <Field label="Type of license" name={`priorLicenses.${index}.licenseType`} register={register} errors={formState.errors} required />
                <Field label="License year" name={`priorLicenses.${index}.licenseYear`} register={register} errors={formState.errors} required />
                <Field
                  label="State/commission/governmental authority"
                  name={`priorLicenses.${index}.authority`}
                  register={register}
                  errors={formState.errors}
                  required
                />
                <RemoveButton onClick={() => setValue("priorLicenses", priorLicenses.filter((__, i) => i !== index), { shouldDirty: true })} />
              </div>
            ))}
          </RepeatingBlock>
        ) : null}

        <YesNoChoice
          label="Has your license ever been suspended, revoked, or have you ever been fined by a commission or similar authority?"
          value={watch("commissionDiscipline")}
          onChange={(value: YesNo) => setValue("commissionDiscipline", value, { shouldDirty: true })}
        />
        {watch("commissionDiscipline") === "yes" ? (
          <RepeatingBlock
            title="Action entries"
            onAdd={() => setValue("commissionActions", [...actions, { ...blankAction }], { shouldDirty: true })}
            empty="Add at least one action."
          >
            {actions.map((_, index) => (
              <div className="entry-block" key={index}>
                <Field label="Type of license" name={`commissionActions.${index}.licenseType`} register={register} errors={formState.errors} required />
                <Field label="Action taken" name={`commissionActions.${index}.actionTaken`} register={register} errors={formState.errors} required />
                <Field label="Reason for action" name={`commissionActions.${index}.reason`} register={register} errors={formState.errors} required />
                <Field label="Date of action" name={`commissionActions.${index}.date`} register={register} errors={formState.errors} required />
                <RemoveButton onClick={() => setValue("commissionActions", actions.filter((__, i) => i !== index), { shouldDirty: true })} />
              </div>
            ))}
          </RepeatingBlock>
        ) : null}

        <YesNoChoice
          label="Are there charges pending against you by an athletic commission or similar governmental authority?"
          value={watch("pendingCommissionCharges")}
          onChange={(value: YesNo) => setValue("pendingCommissionCharges", value, { shouldDirty: true })}
        />
        {watch("pendingCommissionCharges") === "yes" ? (
          <RepeatingBlock
            title="Pending commission charges"
            onAdd={() => setValue("commissionCharges", [...charges, { ...blankCharge }], { shouldDirty: true })}
            empty="Add at least one pending commission charge."
          >
            {charges.map((_, index) => (
              <div className="entry-block" key={index}>
                <Field label="Offense" name={`commissionCharges.${index}.offense`} register={register} errors={formState.errors} required />
                <Field label="Date of offense" name={`commissionCharges.${index}.offenseDate`} register={register} errors={formState.errors} required />
                <Field
                  label="Governmental authority"
                  name={`commissionCharges.${index}.authority`}
                  register={register}
                  errors={formState.errors}
                  required
                />
                <Field label="Hearing date" name={`commissionCharges.${index}.hearingDate`} register={register} errors={formState.errors} required />
                <RemoveButton onClick={() => setValue("commissionCharges", charges.filter((__, i) => i !== index), { shouldDirty: true })} />
              </div>
            ))}
          </RepeatingBlock>
        ) : null}
      </div>
    </>
  );
}

function RepeatingBlock({
  title,
  onAdd,
  children,
  empty
}: {
  title: string;
  onAdd: () => void;
  children: React.ReactNode;
  empty: string;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div>
      <div className="inline-actions">
        <span className="field-label">{title}</span>
        <button className="button ghost" type="button" onClick={onAdd}>
          Add
        </button>
      </div>
      <div className="entry-list">{hasChildren ? children : <p className="error">{empty}</p>}</div>
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="button secondary" type="button" onClick={onClick}>
      Remove
    </button>
  );
}
