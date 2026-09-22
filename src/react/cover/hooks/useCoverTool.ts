import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { coverAdapter as Adapter } from "../services/coverAdapter";
import type { CoverDocumentData, CoverDebugState, LdDocumentRecord, LdEntry, SourceInfo } from "../types/domain";

let ldId = 1;
const editableFields: Array<keyof CoverDocumentData> = [
  "documentCategory","documentNumber","title","internalDocumentCode","taxonomy","revision","revisionDescription","revisionDate","executor","checker","approver",
];

export function useCoverTool() {
  const [lds, setLds] = useState<LdEntry[]>([]);
  const [records, setRecords] = useState<LdDocumentRecord[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<LdDocumentRecord | null>(null);
  const [data, setData] = useState<CoverDocumentData | null>(null);
  const [source, setSource] = useState<SourceInfo | null>(null);
  const [manual, setManual] = useState<Set<keyof CoverDocumentData>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const activatedRef = useRef(false);

  const importFiles = useCallback(async (files: File[]) => {
    const candidates = files.filter((file) => /\.(xlsx?|xlsm)$/i.test(file.name));
    if (!candidates.length) return;
    const newEntries: LdEntry[] = candidates.map((file) => ({ id: "cover-ld-" + (ldId++), file, name: file.name, records: [], error: "" }));
    setLds((old) => [...old, ...newEntries]);
    for (const entry of newEntries) {
      try {
        entry.records = await Adapter.parseLd(entry.file);
        if (!entry.records.length) entry.error = "Nenhuma linha documental reconhecida.";
      } catch (error) {
        entry.error = error instanceof Error ? error.message : "Falha ao ler a LD.";
      }
      setLds((old) => old.map((x) => x.id === entry.id ? { ...entry } : x));
    }
  }, []);

  useEffect(() => {
    setRecords(lds.filter((x) => !x.error).flatMap((x) => x.records));
  }, [lds]);

  const useSharedLds = useCallback(async () => {
    const files = Adapter.sharedLdFiles();
    if (!files.length) { Adapter.notify("Não há LD carregada no Controle de GRDT. Anexe a LD aqui.", "info"); return; }
    await importFiles(files);
  }, [importFiles]);

  const matches = useMemo(() => Adapter.searchByTitle(records, query), [records, query]);
  const selectRecord = useCallback((record: LdDocumentRecord) => {
    setSelected(record); setData(Adapter.coverDataFromRecord(record)); setManual(new Set()); setQuery(record.title);
  }, []);
  const updateField = useCallback(<K extends keyof CoverDocumentData>(field: K, value: CoverDocumentData[K]) => {
    setData((old) => old ? { ...old, [field]: value } : old);
    setManual((old) => new Set(old).add(field));
  }, []);
  const restoreField = useCallback((field: keyof CoverDocumentData) => {
    if (!selected) return;
    const original = Adapter.coverDataFromRecord(selected);
    setData((old) => old ? { ...old, [field]: original[field] } : old);
    setManual((old) => { const next = new Set(old); next.delete(field); return next; });
  }, [selected]);

  const attachSource = useCallback(async (file: File | null) => {
    if (!file) return;
    setBusy(true); setProgress("Lendo documento…");
    try {
      const info = await Adapter.inspectSource(file);
      setSource(info);
      if (info.format === "unsupported") Adapter.notify(info.warning || "Formato não suportado.", "warn");
      else if (info.warning) Adapter.notify(info.warning, "info");
    } catch (error) {
      setSource(null); Adapter.notify(error instanceof Error ? error.message : "Falha ao ler documento.", "error");
    } finally { setBusy(false); setProgress(""); }
  }, []);

  const totalPages = source?.pages ? source.pages + 1 : null;
  const validation = useMemo(() => data ? Adapter.validate(data, selected, source) : { errors: ["Selecione um documento da LD."], warnings: [], info: [], valid: false }, [data, selected, source]);

  useEffect(() => {
    if (!data || !selected) { setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return ""; }); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPreviewBusy(true);
      try {
        const blob = await Adapter.previewPdf(data, totalPages);
        if (cancelled) return;
        const next = URL.createObjectURL(blob);
        setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return next; });
      } catch (_) {
        if (!cancelled) setPreviewUrl("");
      } finally { if (!cancelled) setPreviewBusy(false); }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [data, selected, totalPages]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const generatePdf = useCallback(async () => {
    if (!data || !source || source.format !== "pdf" || !validation.valid) return;
    setBusy(true); setProgress("Montando capa…");
    try {
      const result = await Adapter.generatePdf(source.file, data, (p) => setProgress(p.stage === "source" ? "Preservando páginas originais…" : "Montando capa…"));
      Adapter.download(result); Adapter.notify(`PDF gerado com ${result.pageCount || totalPages || "?"} folha(s).`, "success");
    } catch (error) { Adapter.notify(error instanceof Error ? error.message : "Falha ao gerar PDF.", "error"); }
    finally { setBusy(false); setProgress(""); }
  }, [data, source, validation.valid, totalPages]);

  const generateDocx = useCallback(async () => {
    if (!data || !source || source.format !== "docx" || !validation.valid) return;
    setBusy(true); setProgress("Montando Word editável…");
    try {
      const result = await Adapter.generateDocx(source.file, data, totalPages, (p) => setProgress(p.stage === "source" ? "Incorporando DOCX original…" : "Preenchendo template…"));
      Adapter.download(result); Adapter.notify("Word editável gerado. O conteúdo original é incorporado pelo mecanismo aFChunk do Word.", "success");
    } catch (error) { Adapter.notify(error instanceof Error ? error.message : "Falha ao gerar Word.", "error"); }
    finally { setBusy(false); setProgress(""); }
  }, [data, source, validation.valid, totalPages]);

  const clear = useCallback(() => {
    setSelected(null); setData(null); setSource(null); setQuery(""); setManual(new Set());
  }, []);

  const activate = useCallback(() => {
    activatedRef.current = true;
    window.setTimeout(() => document.getElementById("cover-title-search")?.focus(), 0);
  }, []);
  const deactivate = useCallback(() => { activatedRef.current = false; }, []);

  useEffect(() => {
    const api = { activate, deactivate };
    window.dispatchEvent(new CustomEvent("grcon:cover-hook-ready", { detail: api }));
  }, [activate, deactivate]);

  const debugState: CoverDebugState = {
    lds: lds.length, records: records.length, selectedId: selected?.id || "", sourceName: source?.file.name || "",
    sourceFormat: source?.format || "", sourcePages: source?.pages ?? null, valid: validation.valid, previewReady: Boolean(previewUrl), busy,
  };

  return {
    lds, records, query, matches, selected, data, source, manual, busy, progress, previewUrl, previewBusy,
    validation, totalPages, editableFields, debugState,
    setQuery, importFiles, useSharedLds, selectRecord, updateField, restoreField, attachSource, generatePdf, generateDocx, clear,
  };
}
export type UseCoverToolReturn = ReturnType<typeof useCoverTool>;