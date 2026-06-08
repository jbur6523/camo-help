"use client";

import { useState } from "react";
import { promoterRegistrationSchema, type PromoterRegistrationInput } from "@/lib/promoters/registrationSchema";

type FieldName = keyof PromoterRegistrationInput;
type FieldErrors = Partial<Record<FieldName, string>>;

const initialForm: PromoterRegistrationInput = {
  promotionName: "",
  licenseNumber: "",
  promoterEmail: "",
  contactName: "",
  phone: "",
  websiteUrl: ""
};

export function PromoterRegistrationForm() {
  const [form, setForm] = useState<PromoterRegistrationInput>(initialForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [globalMessage, setGlobalMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <main className="app-shell">
      <section className="wizard-body registration-page">
        <a className="button ghost" href="/">
          Back to application
        </a>
        <h1 className="step-title">Promoter Registration</h1>
        <p className="step-help">
          Submit your promotion for review. Approved promotions may be listed for fighters in a future app update.
        </p>

        {submitted ? (
          <div className="notice">
            <strong>Registration submitted.</strong> Your promotion will not appear for fighters until it is reviewed and approved.
          </div>
        ) : (
          <form className="field-grid" onSubmit={handleSubmit}>
            {globalMessage ? (
              <div className="notice">
                <strong>Check this:</strong> {globalMessage}
              </div>
            ) : null}
            <RegistrationField
              label="Promotion name"
              name="promotionName"
              value={form.promotionName}
              error={errors.promotionName}
              onChange={handleChange}
              required
            />
            <RegistrationField
              label="Promoter license number"
              name="licenseNumber"
              value={form.licenseNumber}
              error={errors.licenseNumber}
              onChange={handleChange}
              required
            />
            <RegistrationField
              label="Promoter email"
              name="promoterEmail"
              value={form.promoterEmail}
              error={errors.promoterEmail}
              onChange={handleChange}
              type="email"
              required
            />
            <RegistrationField
              label="Contact person name"
              name="contactName"
              value={form.contactName}
              error={errors.contactName}
              onChange={handleChange}
              required
            />
            <RegistrationField
              label="Phone number"
              name="phone"
              value={form.phone}
              error={errors.phone}
              onChange={handleChange}
              type="tel"
              required
            />
            <RegistrationField
              label="Website or social link"
              name="websiteUrl"
              value={form.websiteUrl || ""}
              error={errors.websiteUrl}
              onChange={handleChange}
              placeholder="Optional"
            />
            <button className="button primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Registration"}
            </button>
          </form>
        )}
      </section>
    </main>
  );

  function handleChange(name: FieldName, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
    setGlobalMessage("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGlobalMessage("");

    const parsed = promoterRegistrationSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error.flatten().fieldErrors));
      setGlobalMessage("Please complete the required fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/promoter-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const result = await response.json();
      if (!response.ok) {
        setErrors(toFieldErrors(result.fieldErrors || {}));
        throw new Error(result.error || "Registration failed.");
      }
      setSubmitted(true);
      setForm(initialForm);
    } catch (error) {
      setGlobalMessage(error instanceof Error ? error.message : "Registration failed.");
    } finally {
      setIsSubmitting(false);
    }
  }
}

function RegistrationField({
  label,
  name,
  value,
  error,
  onChange,
  type = "text",
  placeholder,
  required = false
}: {
  label: string;
  name: FieldName;
  value: string;
  error?: string;
  onChange: (name: FieldName, value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(event) => onChange(name, event.currentTarget.value)}
      />
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}

function toFieldErrors(fieldErrors: Partial<Record<string, string[]>>) {
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([key, messages]) => [key, messages?.[0] || ""])
  ) as FieldErrors;
}
