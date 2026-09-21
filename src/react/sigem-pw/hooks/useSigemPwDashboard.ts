import { useEffect, useSyncExternalStore } from "react";
import { sigemPwDashboardAdapter } from "../services/sigemPwDashboardAdapter";

export function useSigemPwDashboard() {
  const state = useSyncExternalStore(
    sigemPwDashboardAdapter.subscribe,
    sigemPwDashboardAdapter.getSnapshot,
    sigemPwDashboardAdapter.getSnapshot,
  );

  useEffect(() => sigemPwDashboardAdapter.subscribeExternalEvents(), []);

  return {
    state,
    adapter: sigemPwDashboardAdapter,
  };
}
