"use client";

import Link from "next/link";
import { useState } from "react";
import { promoterPasswordResetRedirectUrl } from "@/lib/promoters/redirects";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const genericMessage =
  "If an account is associated with that email, password-reset instructions will be sent.";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <main className="app-shell">
      <section className="wizard-body registration-page auth-page">
        <Link className="button ghost" href="/promoters/login">
          Back to promoter login
        </Link>
        <h1 className="step-title">Forgot Password</h1>
        <p className="step-help">Enter your promoter account email.</p>
        <form className="field-grid" onSubmit={handleSubmit}>
          {message ? (
            <div className="notice" role="status">
              {message}
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="password-reset-email">Email</label>
            <input
              id="password-reset-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
          </div>
          <button className="button primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Sending..." : "Send Reset Instructions"}
          </button>
        </form>
      </section>
    </main>
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: promoterPasswordResetRedirectUrl(window.location.origin)
      });
    } finally {
      setMessage(genericMessage);
      setIsSubmitting(false);
    }
  }
}
