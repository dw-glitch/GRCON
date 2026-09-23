import { useEffect, useMemo, useSyncExternalStore } from "react";
import { sigemPwRevisionAdapter } from "../services/sigemPwRevisionAdapter";
import { REVISION_SEARCH_DEBOUNCE_MS } from "../types/domain";

export function useSigemPwRevision() {
  const state = useSyncExternalStore(
    sigemPwRevisionAdapter.subscribe,
    sigemPwRevisionAdapter.getSnapshot,
    sigemPwRevisionAdapter.getSnapshot,
  );

  useEffect(() => sigemPwRevisionAdapter.subscribeExternalEvents(), []);

  useEffect(() => {
    const timer = window.setTimeout(
      () => sigemPwRevisionAdapter.applySearch(state.rawSearch),
      REVISION_SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [state.rawSearch]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => sigemPwRevisionAdapter.applyDocumentList(state.rawDocumentList),
      REVISION_SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [state.rawDocumentList]);

  const rows = useMemo(
    () => sigemPwRevisionAdapter.filteredRows(),
    [state.analysis, state.filters],
  );
  const pageData = useMemo(
    () => sigemPwRevisionAdapter.pageData(rows),
    [rows, state.page],
  );
  const options = useMemo(
    () => sigemPwRevisionAdapter.optionSets(),
    [state.analysis],
  );

  return {
    state,
    rows,
    pageData,
    options,
    adapter: sigemPwRevisionAdapter,
  };
}
