import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationDraftExpiryMs,
  applicationDraftStorageKey,
  clearApplicationDraft,
  legacyApplicationDraftStorageKey,
  loadApplicationDraft,
  removeExpiredApplicationDraft,
  saveApplicationDraft
} from "@/lib/draftStorage";
import { defaultApplicationData } from "@/lib/types";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("draft restores before expiry with an explicit schema and timestamps", () => {
  const storage = new MemoryStorage();
  const now = Date.UTC(2026, 6, 21);
  saveApplicationDraft(storage, { ...defaultApplicationData, firstName: "Synthetic" }, now);
  const raw = JSON.parse(storage.getItem(applicationDraftStorageKey) || "{}");
  assert.equal(raw.schemaVersion, 2);
  assert.equal(raw.createdAt, now);
  assert.equal(raw.updatedAt, now);
  assert.equal(loadApplicationDraft(storage, now + applicationDraftExpiryMs - 1)?.firstName, "Synthetic");
});

test("expired drafts are deleted without restoration", () => {
  const storage = new MemoryStorage();
  saveApplicationDraft(storage, { ...defaultApplicationData, firstName: "Expired" }, 1_000);
  assert.equal(loadApplicationDraft(storage, 1_000 + applicationDraftExpiryMs + 1), null);
  assert.equal(storage.getItem(applicationDraftStorageKey), null);
});

test("open-page expiry checks remove an inactive draft automatically", () => {
  const storage = new MemoryStorage();
  saveApplicationDraft(storage, defaultApplicationData, 1_000);
  assert.equal(removeExpiredApplicationDraft(storage, 1_000 + applicationDraftExpiryMs + 1), true);
  assert.equal(storage.getItem(applicationDraftStorageKey), null);
});

test("successful submission clearing removes current and legacy drafts", () => {
  const storage = new MemoryStorage();
  saveApplicationDraft(storage, defaultApplicationData, 1_000);
  storage.setItem(legacyApplicationDraftStorageKey, "legacy");
  clearApplicationDraft(storage);
  assert.equal(storage.getItem(applicationDraftStorageKey), null);
  assert.equal(storage.getItem(legacyApplicationDraftStorageKey), null);
});

test("malformed and old-schema drafts are ignored and cleared safely", () => {
  const malformed = new MemoryStorage();
  malformed.setItem(applicationDraftStorageKey, "{not-json");
  assert.equal(loadApplicationDraft(malformed, 1_000), null);
  assert.equal(malformed.getItem(applicationDraftStorageKey), null);

  const outdated = new MemoryStorage();
  outdated.setItem(applicationDraftStorageKey, JSON.stringify({ schemaVersion: 1, updatedAt: 1_000, data: defaultApplicationData }));
  outdated.setItem(legacyApplicationDraftStorageKey, JSON.stringify(defaultApplicationData));
  assert.equal(loadApplicationDraft(outdated, 1_000), null);
  assert.equal(outdated.getItem(applicationDraftStorageKey), null);
  assert.equal(outdated.getItem(legacyApplicationDraftStorageKey), null);
});

test("drafts never persist upload metadata, file bytes, AI results, SSN digits, or signatures", () => {
  const storage = new MemoryStorage();
  saveApplicationDraft(
    storage,
    {
      ...defaultApplicationData,
      uploads: { bloodwork: "private-filename.pdf" },
      ssnLast4: "1234",
      signatureName: "Synthetic Person",
      fileBytes: [1, 2, 3],
      aiCheckResult: { status: "pass" }
    },
    1_000
  );
  const raw = storage.getItem(applicationDraftStorageKey) || "";
  for (const forbidden of ["private-filename", "1234", "Synthetic Person", "fileBytes", "aiCheckResult"]) {
    assert.doesNotMatch(raw, new RegExp(forbidden));
  }
  const restored = loadApplicationDraft(storage, 1_001);
  assert.deepEqual(restored?.uploads, {});
  assert.equal(restored?.ssnLast4, "");
  assert.equal(restored?.signatureName, "");
});
