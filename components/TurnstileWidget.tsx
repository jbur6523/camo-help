"use client";

import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      theme: "light" | "dark" | "auto";
    }
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type TurnstileWidgetProps = {
  siteKey: string;
  errorMessage?: string;
  resetKey?: number;
  onTokenChange: (token: string) => void;
  onErrorMessageChange: (message: string) => void;
};

let turnstileScriptPromise: Promise<void> | null = null;

export function TurnstileWidget({
  siteKey,
  errorMessage,
  resetKey = 0,
  onTokenChange,
  onErrorMessageChange
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const onErrorMessageChangeRef = useRef(onErrorMessageChange);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
    onErrorMessageChangeRef.current = onErrorMessageChange;
  }, [onTokenChange, onErrorMessageChange]);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "light",
          callback: (token) => {
            setLoadError("");
            onErrorMessageChangeRef.current("");
            onTokenChangeRef.current(token);
          },
          "expired-callback": () => {
            onTokenChangeRef.current("");
            onErrorMessageChangeRef.current("Verification expired. Please complete it again.");
          },
          "error-callback": () => {
            onTokenChangeRef.current("");
            onErrorMessageChangeRef.current("Verification failed to load. Please refresh the page and try again.");
          }
        });
      })
      .catch(() => {
        setLoadError("Verification failed to load. Please refresh the page and try again.");
        onTokenChangeRef.current("");
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  useEffect(() => {
    if (!widgetIdRef.current || !window.turnstile) return;
    window.turnstile.reset(widgetIdRef.current);
    onTokenChangeRef.current("");
  }, [resetKey]);

  if (!siteKey) {
    return (
      <div className="turnstile-box">
        <div className="error">Submission verification is not configured. Please contact support before submitting.</div>
      </div>
    );
  }

  return (
    <div className="turnstile-box">
      <div ref={containerRef} className="turnstile-widget" />
      {errorMessage || loadError ? <div className="error">{errorMessage || loadError}</div> : null}
    </div>
  );
}

function loadTurnstileScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[src*="challenges.cloudflare.com/turnstile"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Turnstile script failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile script failed to load."));
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}
