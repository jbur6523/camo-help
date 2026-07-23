"use client";

import { useState } from "react";
import Link from "next/link";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import {
  promoterAccountRegistrationSchema,
  type PromoterAccountRegistrationInput
} from "@/lib/promoters/accountRegistrationSchema";

type FieldName = keyof PromoterAccountRegistrationInput;
type FieldErrors = Partial<Record<FieldName | "governmentId", string>>;

const initialForm: PromoterAccountRegistrationInput = {
  promotionName: "",
  lastPromotionDate: "",
  promoterEmail: "",
  contactName: "",
  websiteUrl: "",
  password: "",
  confirmPassword: ""
};

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export function PromoterRegistrationForm() {
  const [form, setForm] = useState<PromoterAccountRegistrationInput>(initialForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [globalMessage, setGlobalMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [governmentIdFile, setGovernmentIdFile] = useState<File | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [showPasswords, setShowPasswords] = useState(false);

  return (
    <main className="app-shell">
      <section className="wizard-body registration-page">
        <Link className="button ghost registration-back-link" href="/promoters">
          Back to promoter access
        </Link>
        <h1 className="step-title">Promoter Registration</h1>
        <p className="step-help">
          Submit your promotion for review. Once approved, your promotion will appear for selection on the fighter application and you
          will receive updates when your fighters submit CAMO paperwork.
        </p>

        {submitted ? (
          <div className="notice">
            <h2>Registration submitted</h2>
            <p>Your promoter account has been created and is pending approval.</p>
            <p>After your registration is approved, you can log in using the email and password you selected.</p>
            <Link className="button primary auth-success-link" href="/promoters/login">
              Go to promoter login
            </Link>
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
              type="text"
              inputMode="numeric"
              maxLength={10}
              placeholder="MM/DD/YYYY"
              required
            />
            <RegistrationField
              label="Promoter Email (For Submission Notifications)"
              name="promoterEmail"
              value={form.promoterEmail}
              error={errors.promoterEmail}
              onChange={handleChange}
              type="email"
              autoComplete="email"
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
            <RegistrationField
              label="Password"
              name="password"
              value={form.password}
              error={errors.password}
              onChange={handleChange}
              type={showPasswords ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              required
              helper="Use at least eight characters."
            />
            <RegistrationField
              label="Confirm Password"
              name="confirmPassword"
              value={form.confirmPassword}
              error={errors.confirmPassword}
              onChange={handleChange}
              type={showPasswords ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <button
              className="password-toggle"
              type="button"
              aria-controls="password confirmPassword"
              aria-pressed={showPasswords}
              onClick={() => setShowPasswords((current) => !current)}
            >
              {showPasswords ? "Hide passwords" : "Show passwords"}
            </button>
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
            <TurnstileWidget
              siteKey={turnstileSiteKey}
              resetKey={turnstileResetKey}
              errorMessage={turnstileError}
              onTokenChange={(token) => {
                setTurnstileToken(token);
                if (token) setTurnstileError("");
              }}
              onErrorMessageChange={setTurnstileError}
            />
            <button className="button primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating account..." : "Create Account & Submit Registration"}
            </button>
          </form>
        )}
      </section>
    </main>
  );

  function handleChange(name: FieldName, value: string) {
    const nextValue = name === "lastPromotionDate" ? formatPromoterDateInput(value) : value;
    setForm((current) => ({ ...current, [name]: nextValue }));
    setErrors((current) => ({ ...current, [name]: "" }));
    setGlobalMessage("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGlobalMessage("");

    const parsed = promoterAccountRegistrationSchema.safeParse(form);
    const nextErrors: FieldErrors = parsed.success ? {} : toFieldErrors(parsed.error.flatten().fieldErrors);
    if (!governmentIdFile) {
      nextErrors.governmentId = "Driver License / Government-Issued ID is required.";
    }

    if (!parsed.success || !governmentIdFile) {
      setErrors(nextErrors);
      setGlobalMessage("Please complete the required fields.");
      return;
    }
    if (!turnstileToken) {
      const message = turnstileSiteKey
        ? "Complete the verification before submitting."
        : "Submission verification is not configured. Please contact support before submitting.";
      setTurnstileError(message);
      setGlobalMessage(message);
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        formData.append(key, value || "");
      });
      formData.append("governmentId", governmentIdFile);
      formData.append("turnstileToken", turnstileToken);

      const response = await fetch("/api/promoter-registration", {
        method: "POST",
        body: formData
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.code === "turnstile_failed" || result.code === "turnstile_not_configured") {
          setTurnstileToken("");
          setTurnstileResetKey((current) => current + 1);
          setTurnstileError(result.error || "Verification could not be completed. Please try again.");
        }
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
  inputMode,
  maxLength,
  placeholder,
  autoComplete,
  minLength,
  helper,
  required = false
}: {
  label: string;
  name: FieldName;
  value: string;
  error?: string;
  onChange: (name: FieldName, value: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  placeholder?: string;
  autoComplete?: React.InputHTMLAttributes<HTMLInputElement>["autoComplete"];
  minLength?: number;
  helper?: string;
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
        inputMode={inputMode}
        maxLength={maxLength}
        minLength={minLength}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        onChange={(event) => onChange(name, event.currentTarget.value)}
      />
      {helper ? <small>{helper}</small> : null}
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
      <small className="promoter-id-helper">The name on the ID should match the promoter name registered on CAMO.</small>
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

function formatPromoterDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
