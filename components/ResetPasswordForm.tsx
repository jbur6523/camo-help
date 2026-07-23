"use client";

import Link from "next/link";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updated, setUpdated] = useState(false);

  return (
    <main className="app-shell">
      <section className="wizard-body registration-page auth-page">
        <h1 className="step-title">Reset Promoter Password</h1>
        {updated ? (
          <div className="notice">
            <p>Your password has been updated.</p>
            <Link className="button primary auth-success-link" href="/promoters/login">
              Return to promoter login
            </Link>
          </div>
        ) : (
          <form className="field-grid" onSubmit={handleSubmit}>
            {message ? (
              <div className="notice" role="alert">
                {message}
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="new-promoter-password">New password</label>
              <input
                id="new-promoter-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
              />
              <small>Use at least eight characters.</small>
            </div>
            <div className="field">
              <label htmlFor="confirm-new-promoter-password">Confirm new password</label>
              <input
                id="confirm-new-promoter-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.currentTarget.value)}
              />
            </div>
            <button className="button primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Updating..." : "Update Password"}
            </button>
          </form>
        )}
      </section>
    </main>
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    if (password.length < 8) {
      setMessage("Password must be at least eight characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords must match.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage("This password-reset request could not be completed.");
        return;
      }
      await supabase.auth.signOut();
      setPassword("");
      setConfirmPassword("");
      setUpdated(true);
    } catch {
      setMessage("This password-reset request could not be completed.");
    } finally {
      setIsSubmitting(false);
    }
  }
}
