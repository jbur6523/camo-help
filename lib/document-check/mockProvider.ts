import type { DocumentCheckProvider } from "@/lib/document-check/provider";

export type MockDocumentCheckScenario = "pass" | "review" | "unable" | "malformed" | "unavailable" | "timeout";

export class MockDocumentCheckProvider implements DocumentCheckProvider {
  constructor(private readonly scenario: MockDocumentCheckScenario) {}

  async check(_document: Parameters<DocumentCheckProvider["check"]>[0], signal: AbortSignal): Promise<unknown> {
    if (this.scenario === "unavailable") throw new Error("Mock provider unavailable.");
    if (this.scenario === "timeout") return waitUntilAborted(signal);
    if (this.scenario === "malformed") return { status: "pass", confidence: "certain" };
    if (this.scenario === "review") {
      return { status: "review", reasonCodes: ["POSSIBLE_NP_OR_PA"], confidence: "medium" };
    }
    if (this.scenario === "unable") {
      return { status: "unable_to_verify", reasonCodes: ["DOCUMENT_UNREADABLE"], confidence: "low" };
    }
    return { status: "pass", reasonCodes: ["NO_OBVIOUS_ISSUE"], confidence: "high" };
  }
}

function waitUntilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) return reject(new Error("Aborted."));
    signal.addEventListener("abort", () => reject(new Error("Aborted.")), { once: true });
  });
}
