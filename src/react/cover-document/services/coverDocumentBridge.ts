import type { CoverDebugState } from "../types/domain";

export interface CoverBridgeHandlers {
  activate(): void;
  clear(): void;
  getDebugState(): CoverDebugState | null;
}

function createBridge() {
  let handlers: CoverBridgeHandlers | null = null;
  let pendingActivate = false;
  let pendingClear = false;
  return Object.freeze({
    register(next: CoverBridgeHandlers): () => void {
      handlers = next;
      if (pendingClear) { pendingClear = false; handlers.clear(); }
      if (pendingActivate) { pendingActivate = false; handlers.activate(); }
      return () => { if (handlers === next) handlers = null; };
    },
    activate(): void {
      if (handlers) handlers.activate();
      else pendingActivate = true;
    },
    deactivate(): void {},
    clear(): void {
      if (handlers) handlers.clear();
      else pendingClear = true;
    },
    getDebugState(): CoverDebugState | null {
      return handlers?.getDebugState() || null;
    },
  });
}

export const coverDocumentBridge = createBridge();
