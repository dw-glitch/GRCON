import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { historicoEgrdtsAdapter as Adapter } from "../services/historicoEgrdtsAdapter";
import type { HistoryFilters, HistoryRecord, UpdateNumberResult } from "../types/domain";

const INITIAL_FILTERS: HistoryFilters = {
  query: "",
  year: "",
  outputType: "",
  postingStatus: "",
  sort: "recent",
  startDate: "",
  endDate: "",
  documentFamily: "",
};

export function useHistoricoEgrdts() {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [postings, setPostings] = useState<ReturnType<typeof Adapter.readPostings>>([]);
  const [filters, setFilters] = useState<HistoryFilters>(INITIAL_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(Adapter.LIST_PAGE_SIZE);
  const [, setTeamsVersion] = useState(0);
  const renderStartedRef = useRef(Adapter.nowMs());
  const postingReadsRef = useRef(1);

  const markRenderStart = useCallback(() => {
    renderStartedRef.current = Adapter.nowMs();
  }, []);

  const refresh = useCallback(() => {
    markRenderStart();
    const nextRecords = Adapter.readHistory();
    const nextPostings = Adapter.readPostings();
    postingReadsRef.current = 1;
    setRecords(nextRecords);
    setPostings(nextPostings);
    Adapter.updateTabCount(nextRecords.length);
  }, [markRenderStart]);

  const postingIndexes = useMemo(() => Adapter.createPostingIndexes(postings), [postings]);

  const filtered = useMemo(
    () => Adapter.filterRecords(records, filters, postingIndexes),
    [records, filters, postingIndexes],
  );

  const visibleRecords = useMemo(
    () => filtered.slice(0, visibleLimit),
    [filtered, visibleLimit],
  );

  const years = useMemo(
    () => [...new Set(records.map((record) => Adapter.parsedNumber(record)?.year).filter((value): value is number => Boolean(value)))]
      .sort((left, right) => right - left),
    [records],
  );

  const outputTypes = useMemo(
    () => [...new Set(records.map((record) => record.outputType).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, "pt-BR")),
    [records],
  );

  const summary = useMemo(
    () => Adapter.summary(filtered, postingIndexes),
    [filtered, postingIndexes],
  );

  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedId) || null,
    [records, selectedId],
  );

  const periodValid = !(filters.startDate && filters.endDate && filters.startDate > filters.endDate);
  const periodStatus = periodValid
    ? Adapter.periodLabel(filtered, filters)
    : "Período inválido";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      markRenderStart();
      setVisibleLimit(Adapter.LIST_PAGE_SIZE);
      setFilters((current) => current.query === searchInput ? current : { ...current, query: searchInput });
    }, Adapter.SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput, markRenderStart]);

  useEffect(() => {
    if (filters.year && !years.map(String).includes(filters.year)) {
      setFilters((current) => ({ ...current, year: "" }));
    }
    if (filters.outputType && !outputTypes.includes(filters.outputType)) {
      setFilters((current) => ({ ...current, outputType: "" }));
    }
  }, [years, outputTypes, filters.year, filters.outputType]);

  useEffect(() => {
    if (filtered.some((record) => record.id === selectedId)) return;
    setSelectedId(filtered[0]?.id || "");
    setEditingId("");
  }, [filtered, selectedId]);

  useEffect(() => {
    refresh();

    const historyUpdated = () => refresh();
    const sigemUpdated = () => refresh();
    const teamsUpdated = () => {
      markRenderStart();
      setTeamsVersion((value) => value + 1);
    };
    const storageUpdated = (event: StorageEvent) => {
      if (event.key === Adapter.historyStorageKey()) refresh();
    };
    const unsubscribeRefresh = Adapter.subscribeRefresh(refresh);
    const unsubscribeSelect = Adapter.subscribeSelect((id) => {
      markRenderStart();
      setSelectedId(id);
      setEditingId("");
    });

    window.addEventListener("grcon:history-updated", historyUpdated);
    window.addEventListener("grcon:sigem-updated", sigemUpdated);
    window.addEventListener("grcon:egrdt-teams-state", teamsUpdated);
    window.addEventListener("grcon:egrdt-teams-notified", teamsUpdated);
    window.addEventListener("storage", storageUpdated);

    return () => {
      unsubscribeRefresh();
      unsubscribeSelect();
      window.removeEventListener("grcon:history-updated", historyUpdated);
      window.removeEventListener("grcon:sigem-updated", sigemUpdated);
      window.removeEventListener("grcon:egrdt-teams-state", teamsUpdated);
      window.removeEventListener("grcon:egrdt-teams-notified", teamsUpdated);
      window.removeEventListener("storage", storageUpdated);
    };
  }, [refresh, markRenderStart]);

  useLayoutEffect(() => {
    const performance = {
      lastRenderMs: Math.round((Adapter.nowMs() - renderStartedRef.current) * 100) / 100,
      postingReadsLastRender: postingReadsRef.current,
      renderedRecords: visibleRecords.length,
      totalFiltered: filtered.length,
      postingCount: postings.length,
      totalRecords: records.length,
    };
    Adapter.setSnapshot({ selectedId, filtered, performance });
    postingReadsRef.current = 0;
  }, [selectedId, filtered, visibleRecords.length, postings.length, records.length]);

  const setFilter = useCallback(<K extends keyof HistoryFilters>(key: K, value: HistoryFilters[K]) => {
    markRenderStart();
    setVisibleLimit(Adapter.LIST_PAGE_SIZE);
    setFilters((current) => ({ ...current, [key]: value }));
  }, [markRenderStart]);

  const select = useCallback((id: string) => {
    markRenderStart();
    setSelectedId(id);
    setEditingId("");
  }, [markRenderStart]);

  const loadMore = useCallback(() => {
    markRenderStart();
    setVisibleLimit((current) => Math.min(filtered.length, current + Adapter.LIST_PAGE_SIZE));
  }, [filtered.length, markRenderStart]);

  const beginEdit = useCallback(() => {
    if (!selectedRecord) return;
    markRenderStart();
    setEditingId(selectedRecord.id);
  }, [selectedRecord, markRenderStart]);

  const cancelEdit = useCallback(() => {
    markRenderStart();
    setEditingId("");
  }, [markRenderStart]);

  const saveNumber = useCallback((value: string): UpdateNumberResult => {
    if (!selectedRecord) return { updated: false, error: "Selecione uma eGRDT." };
    const result = Adapter.updateNumber(selectedRecord, value);
    if (result.updated && result.record) {
      setSelectedId(result.record.id);
      setEditingId("");
    }
    return result;
  }, [selectedRecord]);

  const prepareForSigem = useCallback(async () => {
    if (!selectedRecord) return;
    try {
      await Adapter.prepareForSigem(selectedRecord);
    } catch (error) {
      console.error("[HistoricoEgrdts/React] SIGEM:", error);
      Adapter.notify(error instanceof Error ? error.message : "Não foi possível preparar a eGRDT no SIGEM.", "error");
    }
  }, [selectedRecord]);

  const openTeams = useCallback(() => {
    if (selectedRecord) Adapter.openTeams(selectedRecord);
  }, [selectedRecord]);

  const openEmailReply = useCallback(() => {
    if (selectedRecord) Adapter.openEmailReply(selectedRecord);
  }, [selectedRecord]);

  const deleteSelected = useCallback(async () => {
    if (!selectedRecord || !Adapter.canDelete()) return;
    try {
      await Adapter.deleteRecord(selectedRecord);
    } catch (error) {
      console.error("[HistoricoEgrdts/React] excluir:", error);
      Adapter.notify(error instanceof Error ? error.message : "Não foi possível excluir esta eGRDT.", "error");
    }
  }, [selectedRecord]);

  const clearAll = useCallback(async () => {
    try {
      const cleared = await Adapter.clearHistory(records);
      if (cleared) {
        setSelectedId("");
        setEditingId("");
      }
    } catch (error) {
      console.error("[HistoricoEgrdts/React] limpar:", error);
      Adapter.notify(error instanceof Error ? error.message : "Não foi possível limpar o histórico.", "error");
    }
  }, [records]);

  const exportPeriod = useCallback(async () => {
    if (!periodValid || !filtered.length || exporting) return;
    setExporting(true);
    try {
      const count = await Adapter.exportPeriod(filtered, filters);
      Adapter.notify(
        `${count} eGRDT(s) incluída(s) na relação do período · ${filters.documentFamily || "Todos"}.`,
        "success",
      );
    } catch (error) {
      console.error("[HistoricoEgrdts/React] exportação:", error);
      Adapter.notify(error instanceof Error ? error.message : "Não foi possível gerar a relação por período.", "error");
    } finally {
      setExporting(false);
    }
  }, [periodValid, filtered, exporting, filters]);

  return {
    records,
    postings,
    postingIndexes,
    filters,
    searchInput,
    setSearchInput,
    setFilter,
    years,
    outputTypes,
    filtered,
    visibleRecords,
    visibleLimit,
    summary,
    selectedId,
    selectedRecord,
    editingId,
    exporting,
    periodValid,
    periodStatus,
    canDelete: Adapter.canDelete(),
    postingStatusOptions: Adapter.postingStatusOptions(),
    historyHeaderCopy: Adapter.historyHeaderCopy(),
    clearControl: Adapter.clearControl(),
    numberEditScope: Adapter.numberEditScope(),
    select,
    loadMore,
    beginEdit,
    cancelEdit,
    saveNumber,
    prepareForSigem,
    openTeams,
    openEmailReply,
    deleteSelected,
    clearAll,
    exportPeriod,
  };
}
