"use client";

import type { UseFormReturn } from "react-hook-form";
import { Field, SelectField } from "@/components/FormBits";
import { calculateAge, formatBirthDateInput, type ApplicationData } from "@/lib/types";

type ApplicantInfoMode = "full" | "documentsOnly" | "nationalIdOnly";

export function StepApplicantInfo({ form, mode = "full" }: { form: UseFormReturn<ApplicationData>; mode?: ApplicantInfoMode }) {
  const { register, formState, setValue } = form;
  const showFullApplicationFields = mode === "full";
  const showMiddleName = mode !== "documentsOnly";

  return (
    <>
      <h2 className="step-title">Applicant Info</h2>
      <p className="step-help">Enter your legal information exactly as you want it to appear on the forms.</p>
      <div className="field-grid">
        <Field label="First name" name="firstName" register={register} errors={formState.errors} required />
        {showMiddleName ? <Field label="Middle name" name="middleName" register={register} errors={formState.errors} /> : null}
        <Field label="Last name" name="lastName" register={register} errors={formState.errors} required />
        <Field
          label="Birth date"
          name="birthDate"
          register={register}
          errors={formState.errors}
          required
          placeholder="MM/DD/YYYY"
          inputMode="numeric"
          maxLength={10}
          onChange={(event) => {
            const birthDate = formatBirthDateInput(event.currentTarget.value);
            const age = calculateAge(birthDate);
            setValue("birthDate", birthDate, { shouldDirty: true, shouldValidate: true });
            if (age) {
              setValue("age", age, { shouldDirty: true, shouldValidate: true });
            }
          }}
        />
        {showFullApplicationFields ? (
          <div className="field-grid two-col">
            <Field label="Age" name="age" register={register} errors={formState.errors} required inputMode="numeric" />
            <SelectField label="Sex" name="sex" register={register} errors={formState.errors} required>
              <option value="">Select</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </SelectField>
          </div>
        ) : null}
        <Field label="Phone number" name="phone" register={register} errors={formState.errors} required inputMode="tel" />
        <Field label="Email address" name="email" register={register} errors={formState.errors} required type="email" />
        {showFullApplicationFields ? (
          <>
            <Field
              label="Street address"
              name="street"
              register={register}
              errors={formState.errors}
              required="Street address is required. PO Boxes are not allowed."
              helper="No PO Box."
            />
            <div className="field-grid two-col">
              <Field label="City" name="city" register={register} errors={formState.errors} required />
              <Field label="State" name="state" register={register} errors={formState.errors} required />
            </div>
            <div className="field-grid two-col">
              <Field label="ZIP code" name="zip" register={register} errors={formState.errors} required inputMode="numeric" />
              <Field label="Country" name="country" register={register} errors={formState.errors} required />
            </div>
            <Field
              label="Last 4 digits of SSN"
              name="ssnLast4"
              register={register}
              errors={formState.errors}
              required
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => {
                const ssnLast4 = event.currentTarget.value.replace(/\D/g, "").slice(0, 4);
                event.currentTarget.value = ssnLast4;
                setValue("ssnLast4", ssnLast4, { shouldDirty: true, shouldValidate: true });
              }}
            />
            <div className="field-grid two-col">
              <Field label="Height feet" name="heightFeet" register={register} errors={formState.errors} required inputMode="numeric" />
              <Field
                label="Height inches"
                name="heightInches"
                register={register}
                errors={formState.errors}
                required
                type="number"
                inputMode="numeric"
                min={0}
                max={12}
              />
            </div>
            <Field label="Weight in pounds" name="weight" register={register} errors={formState.errors} required inputMode="numeric" />
          </>
        ) : null}
      </div>
    </>
  );
}
