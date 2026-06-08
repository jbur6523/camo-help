"use client";

import { useState } from "react";

export function AdminLoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <main className="app-shell">
      <section className="wizard-body registration-page">
        <a className="button ghost" href="/">
          Back to application
        </a>
        <h1 className="step-title">Admin Login</h1>
        <p className="step-help">Enter the admin password to manage promoter approvals.</p>
        <form className="field-grid" onSubmit={handleSubmit}>
          {error ? (
            <div className="notice">
              <strong>Check this:</strong> {error}
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="adminPassword">Admin password</label>
            <input
              id="adminPassword"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => {
                setPassword(event.currentTarget.value);
                setError("");
              }}
            />
          </div>
          <button className="button primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </section>
    </main>
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (!response.ok) throw new Error("Invalid admin credentials.");
      window.location.reload();
    } catch {
      setError("Invalid admin credentials.");
    } finally {
      setIsSubmitting(false);
    }
  }
}
