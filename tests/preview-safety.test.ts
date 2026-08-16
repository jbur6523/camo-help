import assert from "node:assert/strict";
import test from "node:test";
import { outboundEmailEnabled, outboundEmailMode } from "@/lib/security/outboundEmail";

test("outbound email is live by default for production compatibility", () => {
  const original = process.env.CAMO_OUTBOUND_EMAIL_MODE;
  const originalVercelEnvironment = process.env.VERCEL_ENV;
  delete process.env.CAMO_OUTBOUND_EMAIL_MODE;
  process.env.VERCEL_ENV = "production";
  try {
    assert.equal(outboundEmailMode(), "live");
    assert.equal(outboundEmailEnabled(), true);
  } finally {
    restoreMode(original);
    restoreVercelEnvironment(originalVercelEnvironment);
  }
});

test("Vercel preview disables all outbound email by default", () => {
  const original = process.env.CAMO_OUTBOUND_EMAIL_MODE;
  const originalVercelEnvironment = process.env.VERCEL_ENV;
  delete process.env.CAMO_OUTBOUND_EMAIL_MODE;
  process.env.VERCEL_ENV = "preview";
  try {
    assert.equal(outboundEmailMode(), "disabled");
    assert.equal(outboundEmailEnabled(), false);
  } finally {
    restoreMode(original);
    restoreVercelEnvironment(originalVercelEnvironment);
  }
});

test("the explicit disabled policy also protects non-Vercel staging", () => {
  const original = process.env.CAMO_OUTBOUND_EMAIL_MODE;
  process.env.CAMO_OUTBOUND_EMAIL_MODE = "disabled";
  try {
    assert.equal(outboundEmailEnabled(), false);
  } finally {
    restoreMode(original);
  }
});

test("an invalid outbound-email mode fails closed", () => {
  const original = process.env.CAMO_OUTBOUND_EMAIL_MODE;
  process.env.CAMO_OUTBOUND_EMAIL_MODE = "unexpected";
  try {
    assert.throws(() => outboundEmailEnabled(), /must be either live or disabled/);
  } finally {
    restoreMode(original);
  }
});

function restoreMode(original: string | undefined) {
  if (original === undefined) delete process.env.CAMO_OUTBOUND_EMAIL_MODE;
  else process.env.CAMO_OUTBOUND_EMAIL_MODE = original;
}

function restoreVercelEnvironment(original: string | undefined) {
  if (original === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = original;
}
