"use client";

import type { UseFormReturn } from "react-hook-form";
import { Field, SelectField } from "@/components/FormBits";
import { calculateAge, formatBirthDateInput, type ApplicationData } from "@/lib/types";

export function StepApplicantInfo({ form, short = false }: { form: UseFormReturn<ApplicationData>; short?: boolean }) {
  const { register, formState, setValue } = form;
  return (
    <>
      <h2 className="step-title">Applicant Info</h2>
      <p className="step-help">Enter your legal information exactly as you want it to appear on the forms.</p>
      <div className="field-grid">
        <Field label="First name" name="firstName" register={register} errors={formState.errors} required />
        {short ? null : <Field label="Middle name" name="middleName" register={register} errors={formState.errors} />}
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
        {short ? null : (
          <div className="field-grid two-col">
            <Field label="Age" name="age" register={register} errors={formState.errors} required inputMode="numeric" />
            <SelectField label="Sex" name="sex" register={register} errors={formState.errors} required>
              <option value="">Select</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </SelectField>
          </div>
        )}
        <Field label="Phone number" name="phone" register={register} errors={formState.errors} required inputMode="tel" />
        <Field label="Email address" name="email" register={register} errors={formState.errors} required type="email" />
        {short ? null : (
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
            />
            <div className="field-grid two-col">
              <Field label="Height feet" name="heightFeet" register={register} errors={formState.errors} required inputMode="numeric" />
              <Field label="Height inches" name="heightInches" register={register} errors={formState.errors} required inputMode="numeric" />
            </div>
            <Field label="Weight in pounds" name="weight" register={register} errors={formState.errors} required inputMode="numeric" />
          </>
        )}
      </div>
    </>
  );
}
