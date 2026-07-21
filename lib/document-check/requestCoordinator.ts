import type { DocumentCheckOutcome } from "@/lib/document-check/provider";

export class DocumentCheckRequestCoordinator {
  private active: { id: number; controller: AbortController } | null = null;
  private nextId = 1;

  async run(operation: (signal: AbortSignal) => Promise<DocumentCheckOutcome>): Promise<DocumentCheckOutcome | null> {
    if (this.active) return { kind: "unavailable", reasonCode: "DUPLICATE_REQUEST" };
    const request = { id: this.nextId++, controller: new AbortController() };
    this.active = request;
    try {
      const result = await operation(request.controller.signal);
      return this.active?.id === request.id ? result : null;
    } finally {
      if (this.active?.id === request.id) this.active = null;
    }
  }

  cancel() {
    const active = this.active;
    this.active = null;
    active?.controller.abort();
  }

  get isRunning() {
    return Boolean(this.active);
  }
}
