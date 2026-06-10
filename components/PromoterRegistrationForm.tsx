"use client";

import { useState } from "react";
import { promoterRegistrationSchema, type PromoterRegistrationInput } from "@/lib/promoters/registrationSchema";

type FieldName = keyof PromoterRegistrationInput;
type FieldErrors = Partial<Record<FieldName | "governmentId", string>>;

const initialForm: PromoterRegistrationInput = {
  promotionName: "",
  lastPromotionDate: "",
  promoterEmail: "",
  contactName: "",
  websiteUrl: ""
};

export function PromoterRegistrationForm() {
  const [form, setForm] = useState<PromoterRegistrationInput>(initialForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [globalMessage, setGlobalMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [governmentIdFile, setGovernmentIdFile] = useState<File | null>(null);

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
              label="Promotion Name (as registered on CAMO)"
              name="promotionName"
              value={form.promotionName}
              error={errors.promotionName}
              onChange={handleChange}
              required
            />
            <RegistrationField
              label="Date of Last Promotion"
              name="lastPromotionDate"
              value={form.lastPromotionDate}
              error={errors.lastPromotionDate}
              onChange={handleChange}
              type="date"
              required
            />
            <RegistrationField
              label="Promoter Email (For Submission Notifications)"
              name="promoterEmail"
              value={form.promoterEmail}
              error={errors.promoterEmail}
              onChange={handleChange}
              type="email"
              required
            />
            <RegistrationField
              label="Promoter Name"
              name="contactName"
              value={form.contactName}
              error={errors.contactName}
              onChange={handleChange}
              required
            />
            <GovernmentIdField
              file={governmentIdFile}
              error={errors.governmentId}
              onChange={(file) => {
                setGovernmentIdFile(file);
                setErrors((current) => ({ ...current, governmentId: "" }));
                setGlobalMessage("");
              }}
            />
            <RegistrationField
              label="Website / Social Link"
              name="websiteUrl"
              value={form.websiteUrl || ""}
              error={errors.websiteUrl}
              onChange={handleChange}
              required
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
    const nextErrors: FieldErrors = parsed.success ? {} : toFieldErrors(parsed.error.flatten().fieldErrors);
    if (!governmentIdFile) {
      nextErrors.governmentId = "Driver License / Government-Issued ID is required.";
    }

    if (!parsed.success || !governmentIdFile) {
      setErrors(nextErrors);
      setGlobalMessage("Please complete the required fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        formData.append(key, value || "");
      });
      formData.append("governmentId", governmentIdFile);

      const response = await fetch("/api/promoter-registration", {
        method: "POST",
        body: formData
      });
      const result = await response.json();
      if (!response.ok) {
        setErrors(toFieldErrors(result.fieldErrors || {}));
        throw new Error(result.error || "Registration failed.");
      }
      setSubmitted(true);
      setForm(initialForm);
      setGovernmentIdFile(null);
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

function GovernmentIdField({
  file,
  error,
  onChange
}: {
  file: File | null;
  error?: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <div className="field">
      <label htmlFor="governmentId">Driver License / Government-Issued ID</label>
      <small>The name on the ID should match the promoter name registered on CAMO.</small>
      <input
        id="governmentId"
        name="governmentId"
        type="file"
        accept="image/*,.pdf,application/pdf"
        capture="environment"
        required
        onChange={(event) => onChange(event.currentTarget.files?.[0] || null)}
      />
      {file ? <small>Selected: {file.name}</small> : null}
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}

function toFieldErrors(fieldErrors: Partial<Record<string, string[]>>) {
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([key, messages]) => [key, messages?.[0] || ""])
  ) as FieldErrors;
}
