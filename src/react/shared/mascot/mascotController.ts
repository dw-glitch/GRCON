import type { GrconMascotApi, MascotOperation, MascotShowOptions } from "./mascot.types";

const NOOP_OPERATION: MascotOperation = Object.freeze({
  id: "mascot-unavailable",
  success: () => false,
  warning: () => false,
  cancel: () => false,
  end: () => false,
  running: () => false,
  analyzing: () => false,
});

export function getGrconMascot(): GrconMascotApi | null {
  return window.GrconMascot || null;
}

export function beginMascotOperation(options: MascotShowOptions): MascotOperation {
  return getGrconMascot()?.begin(options) || NOOP_OPERATION;
}

export function showMascotWarning(options: Omit<MascotShowOptions, "state">): void {
  getGrconMascot()?.warning(options);
}

export function showMascotSuccess(options: Omit<MascotShowOptions, "state"> = {}): void {
  getGrconMascot()?.success(options);
}
