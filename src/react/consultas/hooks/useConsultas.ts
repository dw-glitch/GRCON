/**
 * GRCON — Estado da ilha React de Consultas.
 *
 * Hook único que orquestra o fluxo (LDs, documentos, consulta,
 * filtros, exportação). Toda regra de negócio vive no adaptador
 * (consultasAdapter); aqui só há estado de tela e a orquestração de quando
 * chamar o quê — inclusive o processamento em blocos de 100 (com um `await`
 * de um tick entre blocos) que evita travar a aba em listas grandes,
 * preservado do requests_app.js original.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { consultasAdapter } from "../services/consultasAdapter";
import type {
  ConsultationRow,
  DocumentEntry,
  DocumentIndex,
  ExportTemplate,
  LdEntry,
  NotifyKind,
} from "../types/domain";

let proximoLdId = 1;
let proximoDocId = 1;

interface UndoEntry {
  label: string;
  documents: DocumentEntry[];
}

export function useConsultas() {
  const Adapter = consultasAdapter;

  const [lds, setLds] = useState<LdEntry[]>([]);
  const [documents, setDocuments] = useState<DocumentEntry[]>([]);
  const [results, setResults] = useState<Map<string, ConsultationRow>>(new Map());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [search, setSearch] = useState("");
  const [situation, setSituation] = useState("");
  const [allocation, setAllocation] = useState("");
  const [sort, setSort] = useState("entrada");
  const [templates, setTemplates] = useState<ExportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [lastExport, setLastExport] = useState(Adapter.getLastExport());
  const [banner, setBanner] = useState<{ kind: "error" | "info"; message: string } | null>(null);
  const [plannedDocuments, setPlannedDocuments] = useState(() => Adapter.getPlannedDocumentsState());

  const indexRef = useRef<DocumentIndex | null>(null);
  const undoRef = useRef<UndoEntry[]>([]);
  const ldsRef = useRef<LdEntry[]>([]);
  const documentsRef = useRef<DocumentEntry[]>([]);

  const notify = useCallback((message: string, kind?: NotifyKind) => Adapter.notify(message, kind), [Adapter]);

  const reindex = useCallback((nextLds: LdEntry[]) => {
    indexRef.current = Adapter.buildIndex(nextLds);
  }, [Adapter]);

  useEffect(() => { ldsRef.current = lds; }, [lds]);
  useEffect(() => { documentsRef.current = documents; }, [documents]);

  const applyReadyPlannedDocuments = useCallback((base: ReturnType<typeof Adapter.getPlannedDocumentsState>) => {
    setPlannedDocuments(base);
    reindex(ldsRef.current);
    setResults((previous) => {
      if (!previous.size) return previous;
      const next = new Map(previous);
      for (const item of documentsRef.current) {
        const row = previous.get(item.id);
        if (row) next.set(item.id, Adapter.applyPlannedAllocation(item.document, row));
      }
      return next;
    });
    setBanner(null);
  }, [Adapter, reindex]);

  const refreshPlannedDocuments = useCallback(async () => {
    const base = await Adapter.refreshPlannedDocuments();
    if (base.status === "ready") {
      applyReadyPlannedDocuments(base);
    } else {
      setPlannedDocuments(base);
      indexRef.current = null;
      if (base.status === "error") setBanner({ kind: "error", message: base.message });
    }
    return base;
  }, [Adapter, applyReadyPlannedDocuments]);

  useEffect(() => {
    void refreshPlannedDocuments();
    return Adapter.onPlannedDocumentsChanged((reason) => {
      if (reason === "cloud-ready") {
        void refreshPlannedDocuments();
        return;
      }
      const current = Adapter.getPlannedDocumentsState();
      if (current.status === "ready") {
        applyReadyPlannedDocuments(current);
      } else {
        indexRef.current = null;
        const unavailable = {
          ...current,
          status: "error" as const,
          message: "Nenhuma base compartilhada de Documentos Previstos está publicada para esta área de trabalho.",
        };
        setPlannedDocuments(unavailable);
        setBanner({ kind: "error", message: unavailable.message });
      }
    });
  }, [Adapter, applyReadyPlannedDocuments, refreshPlannedDocuments]);

  const addLds = useCallback(async (fileList: FileList | null | undefined) => {
    const arquivos = [...(fileList || [])];
    if (!arquivos.length) return;
    const novos: LdEntry[] = arquivos
      .filter((file) => !lds.some((item) => item.name === file.name && item.size === file.size))
      .map((file) => ({ id: `ld-${proximoLdId++}-${Date.now()}`, file, name: file.name, size: file.size, records: [], history: [], error: "" }));
    if (!novos.length) return;
    setLds((prev) => [...prev, ...novos]);
    for (const entrada of novos) {
      try {
        const parsed = await Adapter.parseLd(entrada.file);
        entrada.records = parsed.records;
        entrada.history = parsed.history;
        if (!entrada.records.length) entrada.error = "Nenhuma linha de documento foi reconhecida nesta planilha.";
      } catch (error) {
        entrada.error = (error instanceof Error && error.message) || "Não foi possível ler este arquivo.";
      }
      setLds((prev) => {
        const atualizado = prev.map((item) => (item.id === entrada.id ? { ...entrada } : item));
        reindex(atualizado);
        return atualizado;
      });
    }
    if (arquivos[0]) Adapter.rememberLastLd(arquivos[0]);
  }, [lds, reindex, Adapter]);

  const removeLd = useCallback((id: string) => {
    setLds((prev) => {
      const atualizado = prev.filter((item) => item.id !== id);
      reindex(atualizado);
      return atualizado;
    });
    setResults(new Map());
  }, [reindex]);

  const clearLds = useCallback(() => {
    setLds([]);
    indexRef.current = null;
    setResults(new Map());
  }, []);

  const guardarParaDesfazer = useCallback((label: string, snapshot: DocumentEntry[]) => {
    undoRef.current = [...undoRef.current, { label, documents: snapshot }].slice(-20);
  }, []);

  const addDocuments = useCallback((texto: string) => {
    const novos = Adapter.parseDocumentList(texto);
    if (!novos.length) { notify("Nenhum código foi reconhecido no texto colado.", "warn"); return; }
    guardarParaDesfazer(`adicionar ${novos.length} documento(s)`, documents);
    const combinados: DocumentEntry[] = [
      ...documents,
      ...novos.map((item) => ({ id: `doc-${proximoDocId++}`, document: item.document, requestedTitle: item.requestedTitle, selected: true })),
    ];
    const { items, removed } = Adapter.dedupeDocuments(combinados);
    setDocuments(items);
    notify(removed.length
      ? `${novos.length} documento(s) adicionados. ${removed.length} repetido(s) foram descartados.`
      : `${novos.length} documento(s) adicionados.`, removed.length ? "info" : "success");
  }, [documents, guardarParaDesfazer, notify, Adapter]);

  const removeDuplicates = useCallback(() => {
    const { items, removed } = Adapter.dedupeDocuments(documents);
    if (!removed.length) { notify("Não há documentos repetidos na lista.", "info"); return; }
    guardarParaDesfazer(`remover ${removed.length} duplicado(s)`, documents);
    setDocuments(items);
    notify(`${removed.length} documento(s) repetido(s) removido(s).`, "success");
  }, [documents, guardarParaDesfazer, notify, Adapter]);

  const clearConsulta = useCallback(() => {
    if (!documents.length && !results.size) return;
    guardarParaDesfazer("limpar a consulta", documents);
    setDocuments([]);
    setResults(new Map());
    notify("Consulta limpa. Use Desfazer se foi sem querer.", "info");
  }, [documents, results, guardarParaDesfazer, notify]);

  const undo = useCallback(() => {
    const pilha = undoRef.current;
    const anterior = pilha[pilha.length - 1];
    if (!anterior) return;
    undoRef.current = pilha.slice(0, -1);
    setDocuments(anterior.documents);
    notify(`Desfeito: ${anterior.label}.`, "info");
  }, [notify]);

  const toggleSelect = useCallback((id: string, selected: boolean) => {
    setDocuments((prev) => prev.map((item) => (item.id === id ? { ...item, selected } : item)));
  }, []);

  const toggleSelectAll = useCallback((selected: boolean) => {
    setDocuments((prev) => prev.map((item) => ({ ...item, selected })));
  }, []);

  const runQuery = useCallback(async (onlySelected?: boolean) => {
    if (running) return;
    if (!lds.some((item) => !item.error && item.records.length)) {
      notify("Anexe pelo menos uma LD válida antes de consultar.", "warn");
      return;
    }
    const alvos = onlySelected ? documents.filter((item) => item.selected) : documents;
    if (!alvos.length) { notify(onlySelected ? "Nenhum documento selecionado." : "Informe pelo menos um documento.", "warn"); return; }

    setRunning(true);
    const total = alvos.length;
    setProgress({ done: 0, total });
    try {
      const base = await Adapter.refreshPlannedDocuments();
      if (base.status !== "ready") {
        setPlannedDocuments(base);
        indexRef.current = null;
        const message = base.message || "Não foi possível consultar a base de Documentos Previstos.";
        setBanner({ kind: base.status === "error" ? "error" : "info", message });
        notify(message, base.status === "error" ? "error" : "info");
        return;
      }
      setPlannedDocuments(base);
      const currentIndex = Adapter.buildIndex(lds);
      if (!currentIndex) throw new Error("A base de Documentos Previstos ainda não está pronta para cruzar as LDs.");
      indexRef.current = currentIndex;
      setBanner(null);

      Adapter.refreshHistoryIndicator();
      const novosResultados = new Map(results);
      for (let inicio = 0; inicio < total; inicio += 100) {
        const fim = Math.min(total, inicio + 100);
        for (let i = inicio; i < fim; i += 1) {
          const item = alvos[i];
          novosResultados.set(item.id, Adapter.lookupDocument(item.document, item.requestedTitle, indexRef.current));
        }
        setProgress({ done: fim, total });
        if (fim < total) await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      setResults(novosResultados);

      const linhas = [...novosResultados.values()];
      const validar = linhas.filter((linha) => linha.needsManualValidation).length;
      notify(validar
        ? `${total} documento(s) consultados. ${validar} precisam de conferência.`
        : `${total} documento(s) consultados.`, validar ? "warn" : "success");
    } catch (error) {
      console.error("[Consultas/React] Falha ao consultar documentos:", error);
      const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
      notify(`Não foi possível concluir a consulta${detail}`, "error");
    } finally {
      setRunning(false);
    }
  }, [running, lds, documents, results, notify, Adapter]);

  const exportRows = useMemo(() => documents
    .filter((item) => results.has(item.id))
    .map((item) => Adapter.buildExportRow(item.document, results.get(item.id)!)), [documents, results, Adapter]);

  useEffect(() => { Adapter.setExportRowsProvider(() => exportRows); }, [exportRows, Adapter]);

  const copyResults = useCallback(async () => {
    if (!exportRows.length) return;
    try {
      await Adapter.copyRowsToClipboard(exportRows);
      notify(`${exportRows.length} linha(s) copiadas. Cole direto na planilha.`, "success");
    } catch (_error) {
      notify("O navegador bloqueou a cópia automática. Use a exportação para Excel.", "warn");
    }
  }, [exportRows, notify, Adapter]);

  const refreshTemplates = useCallback(async () => {
    const lista = await Adapter.loadExportTemplates();
    setTemplates(lista);
    setSelectedTemplateId((atual) => (lista.some((item) => item.id === atual) ? atual : (lista[0] && lista[0].id) || ""));
  }, [Adapter]);

  useEffect(() => {
    refreshTemplates();
    return Adapter.onExportTemplatesChanged(refreshTemplates);
  }, [refreshTemplates, Adapter]);

  const exportExcel = useCallback(async (templateId?: string) => {
    if (!exportRows.length) { notify("Consulte os documentos antes de exportar.", "warn"); return; }
    const escolhido = templates.find((item) => item.id === (templateId || selectedTemplateId)) || templates[0];
    const modelo = Adapter.normalizeExportTemplate(escolhido);
    try {
      const nomesLds = lds.filter((item) => !item.error).map((item) => item.name).join(" · ");
      await Adapter.exportRowsToExcel(exportRows, modelo, nomesLds);
      setLastExport({ id: modelo.id, name: modelo.name });
      notify(`Planilha gerada com ${exportRows.length} linha(s) no modelo "${modelo.name}".`, "success");
    } catch (error) {
      notify((error instanceof Error && error.message) || "Não foi possível gerar a planilha.", "error");
    }
  }, [exportRows, templates, selectedTemplateId, lds, notify, Adapter]);

  const repeatLastExport = useCallback(async () => {
    const ultima = Adapter.getLastExport();
    if (!ultima) return;
    if (!templates.some((item) => item.id === ultima.id)) {
      notify(`O modelo "${ultima.name}" não existe mais. Escolha outro para exportar.`, "warn");
      return;
    }
    setSelectedTemplateId(ultima.id);
    await exportExcel(ultima.id);
  }, [templates, exportExcel, notify, Adapter]);

  const visibleRows = useMemo(() => {
    const busca = search.trim().toLowerCase();
    let linhas = documents.map((item) => ({ item, linha: results.get(item.id) || null }));
    if (situation) linhas = linhas.filter(({ linha }) => linha && linha.situation === situation);
    if (allocation) {
      linhas = linhas.filter(({ linha }) => {
        if (allocation === "sim") return linha?.allocationKind === "allocated";
        if (allocation === "nao") return linha?.allocationKind === "not_allocated";
        return false;
      });
    }
    if (busca) {
      linhas = linhas.filter(({ item, linha }) => [item.document, linha?.title, linha?.ld, linha?.allLds]
        .filter(Boolean).some((valor) => String(valor).toLowerCase().includes(busca)));
    }
    const ordem: Record<string, (a: typeof linhas[number], b: typeof linhas[number]) => number> = {
      documento: (a, b) => a.item.document.localeCompare(b.item.document, "pt-BR"),
      situacao: (a, b) => String(a.linha?.situation || "").localeCompare(String(b.linha?.situation || ""), "pt-BR"),
      ld: (a, b) => String(a.linha?.ld || "").localeCompare(String(b.linha?.ld || ""), "pt-BR"),
    };
    return sort === "entrada" ? linhas : [...linhas].sort(ordem[sort] || (() => 0));
  }, [documents, results, search, situation, allocation, sort]);

  const selectedCount = useMemo(() => documents.filter((item) => item.selected).length, [documents]);
  const ldsReady = useMemo(() => lds.filter((item) => !item.error && item.records.length).length, [lds]);
  const summary = useMemo(() => {
    if (!results.size) return null;
    const linhas = [...results.values()];
    const localizados = linhas.filter((l) => l.situation === "Localizado").length;
    const validar = linhas.filter((l) => l.situation === "Requer validação manual").length;
    return { total: linhas.length, localizados, validar, ausentes: linhas.length - localizados - validar };
  }, [results]);

  return {
    lds, documents, results, running, progress, search, situation, allocation, sort,
    templates, selectedTemplateId, lastExport, banner, plannedDocuments, visibleRows, exportRows, selectedCount, ldsReady, summary,
    lastLd: Adapter.getLastLd(),
    canUndo: undoRef.current.length > 0,
    indexReady: Boolean(indexRef.current) && plannedDocuments.status === "ready",
    setSearch, setSituation, setAllocation, setSort, setSelectedTemplateId, setBanner,
    addLds, removeLd, clearLds,
    addDocuments, removeDuplicates, clearConsulta, undo,
    toggleSelect, toggleSelectAll, runQuery, copyResults, exportExcel, repeatLastExport,
  };
}

export type UseConsultasReturn = ReturnType<typeof useConsultas>;
