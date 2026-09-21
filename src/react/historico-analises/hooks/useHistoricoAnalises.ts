import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { historicoAnalisesAdapter as Adapter } from "../services/historicoAnalisesAdapter";
import type {
  AnalysisDocument,
  AnalysisHistoryFilters,
  AnalysisSession,
  AnalysisSummary,
  DetailState,
  SavedAnalysisFilter,
  UnifiedSearchResult,
} from "../types/domain";

const DESKTOP_PAGE_SIZE = 200;
const MOBILE_PAGE_SIZE = 25;
const MOBILE_HISTORY_MEDIA = "(max-width: 44rem)";
const EMPTY_FILTERS: AnalysisHistoryFilters = {
  query: "",
  status: "ALL",
  startDate: "",
  endDate: "",
  sessionId: "",
};

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function useResponsiveHistoryPageSize(onPageSizeChange: () => void): number {
  const [pageSize, setPageSize] = useState(() =>
    window.matchMedia(MOBILE_HISTORY_MEDIA).matches ? MOBILE_PAGE_SIZE : DESKTOP_PAGE_SIZE,
  );

  useEffect(() => {
    const media = window.matchMedia(MOBILE_HISTORY_MEDIA);
    const handleChange = (event: MediaQueryListEvent) => {
      const nextPageSize = event.matches ? MOBILE_PAGE_SIZE : DESKTOP_PAGE_SIZE;
      setPageSize((current) => current === nextPageSize ? current : nextPageSize);
      onPageSizeChange();
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [onPageSizeChange]);

  return pageSize;
}

export function useHistoricoAnalises() {
  const [filters, setFilters] = useState<AnalysisHistoryFilters>(EMPTY_FILTERS);
  const debouncedQuery = useDebouncedValue(filters.query, 300);
  const [sessions, setSessions] = useState<AnalysisSession[]>([]);
  const [rows, setRows] = useState<AnalysisDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number | undefined>>({});
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const resetPageForPageSize = useCallback(() => setPage(1), []);
  const pageSize = useResponsiveHistoryPageSize(resetPageForPageSize);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [storageLabel, setStorageLabel] = useState("O histórico fica no armazenamento local deste navegador.");
  const [savedFilters, setSavedFilters] = useState<SavedAnalysisFilter[]>([]);
  const [selectedSavedFilterId, setSelectedSavedFilterId] = useState("");
  const [unifiedText, setUnifiedText] = useState("");
  const [unifiedResult, setUnifiedResult] = useState<UnifiedSearchResult | null>(null);
  const [detail, setDetail] = useState<DetailState>({ item: null, loading: false, error: "", context: null });
  const [refreshNonce, setRefreshNonce] = useState(0);
  const requestToken = useRef(0);

  const effectiveFilters = useMemo<AnalysisHistoryFilters>(() => ({
    query: debouncedQuery,
    status: filters.status,
    startDate: filters.startDate,
    endDate: filters.endDate,
    sessionId: filters.sessionId,
  }), [
    debouncedQuery,
    filters.status,
    filters.startDate,
    filters.endDate,
    filters.sessionId,
  ]);
  const queryDebouncing = filters.query !== debouncedQuery;

  const periodInvalid = Boolean(
    filters.startDate && filters.endDate && filters.startDate > filters.endDate,
  );

  const refresh = useCallback(() => setRefreshNonce((value) => value + 1), []);

  useEffect(() => Adapter.subscribeUpdates(refresh), [refresh]);

  const openDetail = useCallback(async (item: AnalysisDocument) => {
    setDetail({ item, loading: true, error: "", context: null });
    try {
      const context = await Adapter.detailContext(item);
      setDetail((current) => current.item?.id === item.id
        ? { item, loading: false, error: "", context }
        : current);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      setDetail((current) => current.item?.id === item.id
        ? { item, loading: false, error: message, context: null }
        : current);
    }
  }, []);

  useEffect(() => Adapter.subscribeOpenDetail((item) => { void openDetail(item); }), [openDetail]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const nextSessions = await Adapter.listSessions();
        if (!active) return;
        setSessions(nextSessions);
        Adapter.updateExternalCount(nextSessions.length);
        setSavedFilters(Adapter.readSavedFilters());
        setFilters((current) => current.sessionId && !nextSessions.some((session) => session.id === current.sessionId)
          ? { ...current, sessionId: "" }
          : current);
        void Adapter.storageLabel()
          .then((label) => { if (active) setStorageLabel(label); })
          .catch((error) => console.debug("[HistoricoAnalises/React] storage:", error));
      } catch (error) {
        console.debug("[HistoricoAnalises/React] metadata:", error);
      }
    })();
    return () => { active = false; };
  }, [refreshNonce]);

  useEffect(() => {
    const token = ++requestToken.current;
    setLoadError("");

    // O Core usa IDBKeyRange.bound e não aceita intervalo invertido. Enquanto
    // o próprio campo informa a validação, mantenha os resultados atuais e não
    // envie um período inválido ao motor legado. Da mesma forma, enquanto a
    // busca textual ainda está no intervalo de debounce, invalide requisições
    // anteriores sem iniciar uma consulta intermediária com o texto antigo.
    if (periodInvalid || queryDebouncing) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    void (async () => {
      try {
        const result = await Adapter.queryDocuments(effectiveFilters, page, pageSize);
        if (token !== requestToken.current) return;

        const pageCount = Math.max(1, Math.ceil(result.total / pageSize));
        if (page > pageCount) {
          setPage(pageCount);
          return;
        }

        setRows(result.rows);
        setTotal(result.total);
        setCounts(result.counts || {});
        setSessionIds(result.sessionIds || []);
      } catch (error) {
        if (token !== requestToken.current) return;
        const message = error instanceof Error && error.message ? error.message : "Não foi possível abrir o histórico.";
        console.error("[HistoricoAnalises/React]", error);
        setRows([]);
        setTotal(0);
        setCounts({});
        setSessionIds([]);
        setLoadError(message);
        Adapter.notify(message || "Não foi possível abrir o histórico de análises.", "error");
      } finally {
        if (token === requestToken.current) setLoading(false);
      }
    })();
  }, [effectiveFilters, page, pageSize, periodInvalid, queryDebouncing, refreshNonce]);

  const setFilter = useCallback(<K extends keyof AnalysisHistoryFilters>(key: K, value: AnalysisHistoryFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }, []);

  const applyQuickFilter = useCallback((kind: string) => {
    const today = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const isoLocal = (date: Date) => String(date.getFullYear()) + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());

    if (kind === "today") {
      const date = isoLocal(today);
      setFilters((current) => ({ ...current, startDate: date, endDate: date, status: "ALL" }));
    } else if (kind === "7days") {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      setFilters((current) => ({ ...current, startDate: isoLocal(start), endDate: isoLocal(today), status: "ALL" }));
    } else if (kind === "pending") {
      setFilters((current) => ({ ...current, status: "REVIEW", startDate: "", endDate: "" }));
    } else if (kind === "included") {
      setFilters((current) => ({ ...current, status: "READY", startDate: "", endDate: "" }));
    }
    setPage(1);
  }, []);

  const loadSavedFilter = useCallback((id: string) => {
    setSelectedSavedFilterId(id);
    const selected = savedFilters.find((item) => item.id === id);
    if (!selected) return;
    const wanted = Adapter.normalizeSavedFilter(selected.filter);
    setFilters({
      query: wanted.query || "",
      status: wanted.status || "ALL",
      startDate: wanted.startDate || "",
      endDate: wanted.endDate || "",
      sessionId: wanted.sessionId || "",
    });
    setPage(1);
  }, [savedFilters]);

  const saveCurrentFilter = useCallback(() => {
    const selected = savedFilters.find((item) => item.id === selectedSavedFilterId);
    const name = Adapter.promptFilterName(selected?.name || "Meu filtro");
    if (!name) return;
    const result = Adapter.saveFilter(name, filters);
    if (!result.saved) {
      Adapter.notify(result.error || "Não foi possível salvar o filtro.", "error");
      return;
    }
    setSavedFilters(Adapter.readSavedFilters());
    setSelectedSavedFilterId(result.item.id);
    Adapter.notify("Filtro salvo neste navegador.", "success");
  }, [filters, savedFilters, selectedSavedFilterId]);

  const deleteSavedFilter = useCallback(() => {
    const selected = savedFilters.find((item) => item.id === selectedSavedFilterId);
    if (!selected || !Adapter.confirmDeleteFilter(selected.name)) return;
    Adapter.deleteFilter(selected.id);
    setSavedFilters(Adapter.readSavedFilters());
    setSelectedSavedFilterId("");
    Adapter.notify("Filtro salvo excluído.", "success");
  }, [savedFilters, selectedSavedFilterId]);

  const runUnifiedSearch = useCallback(async () => {
    if (!unifiedText.split("\n").some((line) => line.trim())) return;
    setUnifiedResult(await Adapter.unifiedSearch(unifiedText));
  }, [unifiedText]);

  const clearUnifiedSearch = useCallback(() => {
    setUnifiedText("");
    setUnifiedResult(null);
  }, []);

  const closeDetail = useCallback(() => {
    setDetail({ item: null, loading: false, error: "", context: null });
  }, []);

  const openRelatedHistory = useCallback(async (id: string, prepareSigem: boolean) => {
    try {
      await Adapter.openRelatedHistory(id, prepareSigem);
      closeDetail();
    } catch (error) {
      Adapter.notify(error instanceof Error ? error.message : "Não foi possível abrir a eGRDT relacionada.", "error");
    }
  }, [closeDetail]);

  const exportExcel = useCallback(async () => {
    if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) return;
    setExporting(true);
    try {
      const documents = await Adapter.allDocuments(filters);
      const wantedSessionIds = new Set(documents.map((item) => item.sessionId));
      const exportSessions = sessions.filter((session) => wantedSessionIds.has(session.id));
      const count = await Adapter.exportReport({ documents, sessions: exportSessions, filters });
      Adapter.notify(count.toLocaleString("pt-BR") + " documento(s) incluído(s) no relatório.", "success");
    } catch (error) {
      console.error("[HistoricoAnalises/React] export:", error);
      Adapter.notify(error instanceof Error && error.message ? error.message : "Não foi possível gerar o relatório do histórico.", "error");
    } finally {
      setExporting(false);
      refresh();
    }
  }, [filters, sessions, refresh]);

  const backup = useCallback(async () => {
    try {
      await Adapter.backupHistory();
      Adapter.notify("Backup do histórico gerado.", "success");
    } catch (error) {
      Adapter.notify(error instanceof Error && error.message ? error.message : "Não foi possível gerar o backup.", "error");
    }
  }, []);

  const restore = useCallback(async (file: File | null | undefined) => {
    if (!file || !Adapter.confirmRestore()) return;
    try {
      const result = await Adapter.restoreHistory(file);
      setPage(1);
      Adapter.dispatchUpdated();
      Adapter.notify(result.documents.toLocaleString("pt-BR") + " documento(s) restaurado(s).", "success");
    } catch (error) {
      Adapter.notify(error instanceof Error && error.message ? error.message : "Não foi possível restaurar o backup.", "error");
    }
  }, []);

  const deleteSelectedSession = useCallback(async () => {
    const session = sessions.find((item) => item.id === filters.sessionId);
    if (!session || !Adapter.confirmDeleteSession(session)) return;
    try {
      await Adapter.deleteSession(session.id);
      setFilters((current) => ({ ...current, sessionId: "" }));
      setPage(1);
      Adapter.dispatchUpdated();
      Adapter.notify("Análise excluída do histórico.", "success");
    } catch (error) {
      Adapter.notify(error instanceof Error && error.message ? error.message : "Não foi possível excluir a análise.", "error");
    }
  }, [sessions, filters.sessionId]);

  const clearAll = useCallback(async () => {
    if (!sessions.length || !(await Adapter.confirmClearHistory())) return;
    try {
      Adapter.auditClearHistory();
      await Adapter.clearAll();
      setPage(1);
      Adapter.dispatchUpdated();
      Adapter.notify("Histórico de análises apagado.", "success");
    } catch (error) {
      Adapter.notify(error instanceof Error && error.message ? error.message : "Não foi possível limpar o histórico.", "error");
    }
  }, [sessions.length]);

  const summary = useMemo<AnalysisSummary>(() => ({
    total,
    counts,
    sessions: sessionIds.length,
  }), [total, counts, sessionIds]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return {
    filters,
    setFilter,
    sessions,
    rows,
    total,
    page,
    pages,
    pageSize,
    setPage,
    loading,
    loadError,
    exporting,
    storageLabel,
    summary,
    savedFilters,
    selectedSavedFilterId,
    loadSavedFilter,
    saveCurrentFilter,
    deleteSavedFilter,
    applyQuickFilter,
    unifiedText,
    setUnifiedText,
    unifiedResult,
    runUnifiedSearch,
    clearUnifiedSearch,
    detail,
    openDetail,
    closeDetail,
    openRelatedHistory,
    exportExcel,
    backup,
    restore,
    deleteSelectedSession,
    clearAll,
    periodInvalid,
    refresh,
  };
}
