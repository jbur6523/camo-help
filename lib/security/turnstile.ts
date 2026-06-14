import "server-only";

const turnstileVerifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileVerifyResponse = {
  success?: boolean;
  "error-codes"?: string[];
};

export class TurnstileConfigurationError extends Error {
  constructor() {
    super("Turnstile verification is not configured.");
    this.name = "TurnstileConfigurationError";
  }
}

export class TurnstileVerificationError extends Error {
  constructor(message = "Verification failed. Please try again.") {
    super(message);
    this.name = "TurnstileVerificationError";
  }
}

export async function verifyTurnstileToken(token: FormDataEntryValue | null, remoteIp?: string) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    throw new TurnstileConfigurationError();
  }

  if (typeof token !== "string" || !token.trim()) {
    throw new TurnstileVerificationError("Complete the verification before submitting.");
  }

  const body = new URLSearchParams({
    secret: secretKey,
    response: token.trim()
  });

  if (remoteIp && remoteIp !== "Unavailable") {
    body.set("remoteip", remoteIp);
  }

  const response = await fetch(turnstileVerifyUrl, {
    method: "POST",
    body
  });

  let result: TurnstileVerifyResponse = {};
  try {
    result = (await response.json()) as TurnstileVerifyResponse;
  } catch {
    throw new TurnstileVerificationError("Verification could not be completed. Please try again.");
  }

  if (!response.ok || !result.success) {
    console.warn("Turnstile verification failed.", {
      status: response.status,
      errorCodes: result["error-codes"] || []
    });
    throw new TurnstileVerificationError();
  }
}

export function turnstileErrorStatus(error: unknown) {
  return error instanceof TurnstileConfigurationError ? 500 : 400;
}

export function turnstileUserMessage(error: unknown) {
  if (error instanceof TurnstileConfigurationError) {
    return "Submission verification is not configured. Please contact support before submitting.";
  }
  if (error instanceof TurnstileVerificationError) {
    return error.message;
  }
  return "Verification could not be completed. Please try again.";
}
