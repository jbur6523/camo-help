"use client";

import Link from "next/link";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function PromoterLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <main className="app-shell">
      <section className="wizard-body registration-page auth-page">
        <Link className="button ghost" href="/promoters">
          Back to promoter access
        </Link>
        <h1 className="step-title">Promoter Login</h1>
        <p className="step-help">Use the email and password you selected during registration.</p>
        <form className="field-grid" onSubmit={handleSubmit}>
          {error ? (
            <div className="notice" role="alert">
              {error}
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="promoter-login-email">Email</label>
            <input
              id="promoter-login-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.currentTarget.value);
                setError("");
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="promoter-login-password">Password</label>
            <input
              id="promoter-login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.currentTarget.value);
                setError("");
              }}
            />
          </div>
          <button className="button primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Logging in..." : "Login"}
          </button>
          <div className="auth-links">
            <Link href="/promoters/forgot-password">Forgot password?</Link>
            <Link href="/promoter-registration">Register as a promoter</Link>
          </div>
        </form>
      </section>
    </main>
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });
      if (signInError) {
        setError("Email or password was not accepted.");
        return;
      }
      window.location.assign("/promoters/dashboard");
    } catch {
      setError("Promoter login is not available at this time.");
    } finally {
      setIsSubmitting(false);
    }
  }
}
