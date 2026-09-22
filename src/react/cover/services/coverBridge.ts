import type { CoverDebugState } from "../types/domain";
let debugProvider: () => CoverDebugState | null = () => null;
let active = false;
export const coverBridge = Object.freeze({
  setDebugProvider(provider: () => CoverDebugState | null) { debugProvider = provider; },
  getDebugState() { return debugProvider(); },
  activate() { active = true; window.setTimeout(() => document.getElementById("cover-title-search")?.focus(), 0); },
  deactivate() { active = false; },
  isActive() { return active; },
});