import { useCallback } from "react";
import { beginMascotOperation, getGrconMascot, showMascotSuccess, showMascotWarning } from "./mascotController";
import type { MascotShowOptions } from "./mascot.types";

export function useGrconMascot() {
  const begin = useCallback((options: MascotShowOptions) => beginMascotOperation(options), []);
  const warning = useCallback((options: Omit<MascotShowOptions, "state">) => showMascotWarning(options), []);
  const success = useCallback((options: Omit<MascotShowOptions, "state"> = {}) => showMascotSuccess(options), []);
  return { runtime: getGrconMascot(), begin, warning, success };
}
