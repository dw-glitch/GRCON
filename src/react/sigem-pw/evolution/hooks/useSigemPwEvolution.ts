import { useEffect, useMemo, useSyncExternalStore } from "react";
import { sigemPwEvolutionAdapter } from "../services/sigemPwEvolutionAdapter";
import { EVOLUTION_SEARCH_DEBOUNCE_MS } from "../types/domain";

export function useSigemPwEvolution() {
  const state = useSyncExternalStore(
    sigemPwEvolutionAdapter.subscribe,
    sigemPwEvolutionAdapter.getSnapshot,
    sigemPwEvolutionAdapter.getSnapshot,
  );

  useEffect(() => sigemPwEvolutionAdapter.subscribeExternalEvents(), []);

  useEffect(() => {
    const timer = window.setTimeout(
      () => sigemPwEvolutionAdapter.applyRawFilters(state.rawFilters),
      EVOLUTION_SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [state.rawFilters.query, state.rawFilters.tag, state.rawFilters.eap]);

  const periodSigem = useMemo(
    () => sigemPwEvolutionAdapter.periodSnapshots("sigem"),
    [state.sigem, state.period.start, state.period.end],
  );
  const periodPw = useMemo(
    () => sigemPwEvolutionAdapter.periodSnapshots("pw"),
    [state.pw, state.period.start, state.period.end],
  );
  const pageData = useMemo(
    () => sigemPwEvolutionAdapter.pageData(),
    [state.filteredRows, state.page],
  );

  return { state, periodSigem, periodPw, pageData, adapter: sigemPwEvolutionAdapter };
}
