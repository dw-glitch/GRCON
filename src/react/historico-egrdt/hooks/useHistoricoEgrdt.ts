import { useCallback, useEffect, useMemo, useState } from "react";
import { historicoEgrdtAdapter as Adapter } from "../services/historicoEgrdtAdapter";
import type {
  EgrdtHistoryFilters,
  EgrdtHistoryRecord,
  PostingCache,
} from "../types/domain";

export const LIST_PAGE_SIZE = 200;
export const SEARCH_DEBOUNCE_MS = 120;

const EMPTY_FILTERS: EgrdtHistoryFilters = {
  query: "",
  year: "",
  outputType: "",
  postingStatus: "",
  sort: "recent",
  startDate: "",
  endDate: "",
  documentFamily: "",
};

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useHistoricoEgrdt() {
  const [records, setRecords] = useState<EgrdtHistoryRecord[]>([]);
  const [postingCache, setPostingCache] = useState<PostingCache>(() => ({
    records: [],
    byHistoryId: new Map(),
    byId: new Map(),
    byEgrdt: new Map(),
    reads: 0,
  }));
  const [filters, setFilters] = useState<EgrdtHistoryFilters>(EMPTY_FILTERS);
  const debouncedQuery = useDebouncedValue(filters.query, SEARCH_DEBOUNCE_MS);
  const [selectedId, setSelectedId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editValue, setEditValue] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(LIST_PAGE_SIZE);
  const [exporting, setExporting] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refresh = useCallback(() => setRefreshNonce((value) => value + 1), []);

  useEffect(() => Adapter.subscribeUpdates(refresh), [refresh]);
  useEffect(() => Adapter.subscribeSelect((id) => {
    setSelectedId(id);
    setEditingId("");
    window.setTimeout(() => document.querySelector<HTMLElement>("#history-detail")?.focus?.(), 0);
  }), []);

  useEffect(() => {
    const nextRecords = Adapter.readRecords();
    const nextPostingCache = Adapter.readPostingCache();
    setRecords(nextRecords);
    setPostingCache(nextPostingCache);
    Adapter.updateExternalCount(nextRecords.length);
  }, [refreshNonce]);

  const effectiveFilters = useMemo<EgrdtHistoryFilters>(() => ({
    query: debouncedQuery,
    year: filters.year,
    outputType: filters.outputType,
    postingStatus: filters.postingStatus,
    sort: filters.sort,
    startDate: filters.startDate,
    endDate: filters.endDate,
    documentFamily: filters.documentFamily,
  }), [
    debouncedQuery,
    filters.year,
    filters.outputType,
    filters.postingStatus,
    filters.sort,
    filters.startDate,
    filters.endDate,
    filters.documentFamily,
  ]);

  const filteredResult = useMemo(() => {
    const started = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const rows = Adapter.filterRecords(records, effectiveFilters, postingCache);
    const ended = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    return { rows, elapsed: Math.round((ended - started) * 100) / 100 };
  }, [records, effectiveFilters, postingCache]);

  const filtered = filteredResult.rows;
  const visibleRecords = useMemo(
    () => filtered.slice(0, visibleLimit),
    [filtered, visibleLimit],
  );

  useEffect(() => {
    if (!filtered.length) {
      if (selectedId) setSelectedId("");
      return;
    }
    if (!filtered.some((record) => record.id === selectedId)) {
      setSelectedId(filtered[0].id);
      setEditingId("");
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    Adapter.setPerformanceSnapshot({
      lastRenderMs: filteredResult.elapsed,
      postingReadsLastRender: postingCache.reads,
      renderedRecords: visibleRecords.length,
      totalFiltered: filtered.length,
      postingCount: postingCache.records.length,
      totalRecords: records.length,
    });
  }, [filteredResult.elapsed, postingCache, visibleRecords.length, filtered.length, records.length]);

  const filterOptions = useMemo(() => Adapter.filterOptions(records), [records]);
  const summary = useMemo(() => Adapter.summary(filtered, postingCache), [filtered, postingCache]);
  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedId) || null,
    [records, selectedId],
  );
  const periodInvalid = Boolean(filters.startDate && filters.endDate && filters.startDate > filters.endDate);
  const periodStatus = useMemo(
    () => Adapter.periodLabel(filtered, effectiveFilters),
    [filtered, effectiveFilters],
  );

  const setFilter = useCallback(<K extends keyof EgrdtHistoryFilters>(key: K, value: EgrdtHistoryFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setVisibleLimit(LIST_PAGE_SIZE);
  }, []);

  const setSearch = useCallback((value: string) => {
    setFilters((current) => ({ ...current, query: value }));
    setVisibleLimit(LIST_PAGE_SIZE);
  }, []);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setEditingId("");
  }, []);

  const showMore = useCallback(() => {
    setVisibleLimit((current) => Math.min(filtered.length, current + LIST_PAGE_SIZE));
  }, [filtered.length]);

  const startEditing = useCallback(() => {
    if (!selectedRecord) return;
    const parsed = Adapter.parsedNumber(selectedRecord);
    setEditValue(parsed ? String(parsed.sequence).padStart(4, "0") : "");
    setEditingId(selectedRecord.id);
  }, [selectedRecord]);

  const cancelEditing = useCallback(() => {
    setEditingId("");
    setEditValue("");
  }, []);

  const changeEditValue = useCallback((value: string) => {
    setEditValue(String(value || "").replace(/\D/g, "").slice(0, 4));
  }, []);

  const saveEditedNumber = useCallback(() => {
    if (!selectedRecord) return;
    const result = Adapter.updateNumber(selectedRecord.id, editValue);
    if (!result.updated || !result.record) {
      const input = document.querySelector<HTMLInputElement>("#history-number-input");
      if (input) {
        input.setAttribute("aria-invalid", "true");
        input.setCustomValidity(result.error || "Número inválido.");
        input.reportValidity();
        input.setCustomValidity("");
      }
      return;
    }
    Adapter.syncSequence(result.record.egrdtNumber);
    setSelectedId(result.record.id);
    setEditingId("");
    setEditValue("");
    Adapter.dispatchUpdated({
      renamed: true,
      previous: result.previous,
      current: result.record.egrdtNumber,
    });
  }, [selectedRecord, editValue]);

  const prepareForSigem = useCallback(async () => {
    if (!selectedRecord) return;
    await Adapter.prepareForSigem(selectedRecord);
    Adapter.notify("eGRDT preparada na fila de postagem SIGEM.", "success");
  }, [selectedRecord]);

  const openEmailReply = useCallback(() => {
    if (!selectedRecord) return;
    try {
      Adapter.openEmailReply(selectedRecord);
    } catch (error) {
      Adapter.notify(error instanceof Error ? error.message : "Não foi possível abrir a resposta de e-mail.", "error");
    }
  }, [selectedRecord]);

  const openTeams = useCallback(() => {
    if (selectedRecord) Adapter.openTeams(selectedRecord);
  }, [selectedRecord]);

  const deleteSelectedRecord = useCallback(async () => {
    const record = selectedRecord;
    if (!record || !Adapter.confirmDelete(record)) return;
    try {
      const { result, cloudDeleted } = await Adapter.deleteRecord(record);
      if (!result.deleted) {
        Adapter.notify(result.error || "Não foi possível excluir esta eGRDT.", "error");
        return;
      }
      setSelectedId(result.records[0]?.id || "");
      setEditingId("");
      Adapter.dispatchUpdated({
        deleted: true,
        recordId: record.clientRecordId || record.id,
        cloudId: record.cloudId || "",
        workspaceId: record.workspaceId || "",
        reservationIds: record.reservationIds || [],
        cloudDeleted,
      });
      Adapter.notify(
        Adapter.isSharedHistory()
          ? `eGRDT excluída do histórico compartilhado. O número ${record.egrdtNumber} foi liberado para reutilização.`
          : "eGRDT excluída do histórico local.",
        "success",
      );
    } catch (error) {
      Adapter.notify(error instanceof Error ? error.message : "Não foi possível excluir a eGRDT.", "error");
    }
  }, [selectedRecord]);

  const clearHistory = useCallback(async () => {
    if (!records.length || !Adapter.confirmClear()) return;
    try {
      const cleared = await Adapter.clearHistory();
      if (!cleared) return;
      setSelectedId("");
      setEditingId("");
      Adapter.dispatchUpdated({ cleared: true });
    } catch (error) {
      Adapter.notify(error instanceof Error ? error.message : "Não foi possível limpar o histórico.", "error");
    }
  }, [records.length]);

  const exportPeriodReport = useCallback(async () => {
    if (periodInvalid) {
      Adapter.reportDateValidity();
      return;
    }
    if (!filtered.length) return;
    setExporting(true);
    try {
      await Adapter.exportPeriodReport(filtered, effectiveFilters);
      Adapter.notify(
        `${filtered.length} eGRDT(s) incluída(s) na relação do período · ${filters.documentFamily || "Todos"}.`,
        "success",
      );
    } catch (error) {
      console.error("[HistoricoEgrdt/React] export:", error);
      Adapter.notify("Não foi possível gerar a relação por período. Verifique os dados selecionados e tente novamente.", "error");
    } finally {
      setExporting(false);
    }
  }, [periodInvalid, filtered, effectiveFilters, filters.documentFamily]);

  return {
    records,
    filters,
    effectiveFilters,
    setFilter,
    setSearch,
    filterOptions,
    postingCache,
    filtered,
    visibleRecords,
    visibleLimit,
    selectedId,
    selectedRecord,
    select,
    showMore,
    summary,
    periodInvalid,
    periodStatus,
    exporting,
    exportPeriodReport,
    editingId,
    editValue,
    startEditing,
    cancelEditing,
    changeEditValue,
    saveEditedNumber,
    prepareForSigem,
    openEmailReply,
    openTeams,
    deleteSelectedRecord,
    clearHistory,
    canDeleteHistory: Adapter.canDeleteHistory(),
    sharedHistory: Adapter.isSharedHistory(),
  };
}
