import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadLdRecords,
  searchLdDocuments,
  uniqueExactCandidate,
  type LdLoadProgress,
  type LdSearchIndex,
} from "../services/ldDocumentService";
import {
  createCoverPreview,
  downloadGenerated,
  generateDocx,
  generatePdf,
  inspectSourceDocument,
} from "../services/coverDocumentService";
import { normalizeRevisionDate, validateCover } from "../services/coverValidationService";
import { coverDocumentBridge } from "../services/coverDocumentBridge";
import type {
  CoverDebugState,
  CoverDocumentCandidate,
  CoverDocumentData,
  LdDocumentRecord,
  SourceDocumentInfo,
} from "../types/domain";

const SEARCH_DEBOUNCE_MS = 160;
const PREVIEW_DEBOUNCE_MS = 220;

const DEFAULTS: Pick<CoverDocumentData, "revisionDescription" | "executor" | "checker" | "approver"> = {
  revisionDescription: "EMISSÃO ORIGINAL",
  executor: "KAIQUE CAETANO",
  checker: "LEANDRO CALDEIRA",
  approver: "LUCIANA SCIARRA",
};

const EMPTY_DATA: CoverDocumentData = {
  title: "",
  documentNumber: "",
  taxonomy: "",
  eap: "",
  category: "",
  categoryLabel: "",
  classification: "",
  revision: "",
  revisionDescription: DEFAULTS.revisionDescription,
  revisionDate: "",
  discipline: "",
  tag: "",
  executor: DEFAULTS.executor,
  checker: DEFAULTS.checker,
  approver: DEFAULTS.approver,
};

function fromCandidate(candidate: CoverDocumentCandidate): CoverDocumentData {
  const revision = candidate.revision || "";
  return {
    title: candidate.title,
    documentNumber: candidate.documentNumber,
    taxonomy: candidate.taxonomy,
    eap: candidate.eap,
    category: candidate.category,
    categoryLabel: candidate.categoryLabel,
    classification: candidate.classification,
    revision,
    revisionDescription: revision === "0" ? "EMISSÃO ORIGINAL" : "",
    revisionDate: normalizeRevisionDate(candidate.revisionDate),
    discipline: candidate.discipline,
    tag: candidate.tag,
    executor: DEFAULTS.executor,
    checker: DEFAULTS.checker,
    approver: DEFAULTS.approver,
  };
}

function progressStatus(progress: LdLoadProgress): string {
  if (progress.phase === "read") return "Lendo LD";
  if (progress.phase === "prepare") return "Preparando documentos";
  return "Pronto para pesquisa";
}

export function useCoverDocument() {
  const [records, setRecords] = useState<LdDocumentRecord[]>([]);
  const [searchIndex, setSearchIndex] = useState<LdSearchIndex>({ entries: [], count: 0 });
  const [ldNames, setLdNames] = useState<string[]>([]);
  const [ldSource, setLdSource] = useState<"grcon" | "manual" | "">("");
  const [query, setQueryState] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<CoverDocumentCandidate | null>(null);
  const [baseData, setBaseData] = useState<CoverDocumentData>(EMPTY_DATA);
  const [data, setData] = useState<CoverDocumentData>(EMPTY_DATA);
  const [source, setSource] = useState<SourceDocumentInfo | null>(null);
  const [manualOriginalPages, setManualOriginalPages] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Use a LD já carregada no GRCON ou selecione outra LD.");
  const [previewUrl, setPreviewUrl] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const stateRef = useRef<CoverDebugState | null>(null);
  const previewToken = useRef(0);
  const autoReuseAttempted = useRef(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const candidates = useMemo(
    () => searchLdDocuments(searchIndex, debouncedQuery),
    [searchIndex, debouncedQuery],
  );
  const originalPages = manualOriginalPages ?? source?.originalPages ?? null;
  const totalPages = originalPages ? originalPages + 1 : null;
  const validations = useMemo(() => validateCover(selected, data, source, totalPages), [selected, data, source, totalPages]);
  const hasErrors = validations.some((item) => item.level === "error");
  const overrides = useMemo(
    () => new Set((Object.keys(data) as Array<keyof CoverDocumentData>).filter((key) => data[key] !== baseData[key])),
    [baseData, data],
  );

  stateRef.current = {
    ldCount: ldNames.length,
    candidateCount: candidates.length,
    selectedDocument: selected?.documentNumber || "",
    sourceName: source?.file.name || "",
    busy,
    validationErrors: validations.filter((item) => item.level === "error").length,
  };

  const notify = useCallback((message: string, kind = "info") => {
    if (typeof window.GrconNotify === "function") window.GrconNotify(message, kind);
  }, []);

  const loadLds = useCallback(async (
    files: FileList | File[],
    origin: "grcon" | "manual" = "manual",
  ) => {
    const list = Array.from(files).filter((file) => /\.(?:xlsx?|xlsm)$/i.test(file.name));
    if (!list.length || busy) return;
    setBusy(true);
    setStatus("Lendo LD");
    try {
      const loaded = await loadLdRecords(list, (progress) => {
        setStatus(progressStatus(progress));
      });
      setRecords(loaded.records);
      setSearchIndex(loaded.searchIndex);
      setLdNames(list.map((file) => file.name));
      setLdSource(origin);
      setSelected(null);
      setBaseData(EMPTY_DATA);
      setData(EMPTY_DATA);
      setQueryState("");
      setDebouncedQuery("");
      setStatus(`Pronto para pesquisa · ${loaded.records.length.toLocaleString("pt-BR")} registro(s) documental(is).`);
      if (origin === "manual" && list[0]) window.GrconLdMemory?.save?.(list[0]);
      notify(origin === "grcon" ? "LD vigente do GRCON reutilizada na ferramenta de capa." : "LD carregada para a ferramenta de capa.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível ler a LD.";
      setStatus(message);
      notify(message, "error");
    } finally {
      setBusy(false);
    }
  }, [busy, notify]);

  useEffect(() => {
    if (autoReuseAttempted.current) return;
    autoReuseAttempted.current = true;
    const currentLd = window.GrconLdMemory?.current?.();
    if (currentLd) void loadLds([currentLd], "grcon");
  }, [loadLds]);

  const chooseCandidate = useCallback((candidate: CoverDocumentCandidate) => {
    const mapped = fromCandidate(candidate);
    setSelected(candidate);
    setBaseData(mapped);
    setData(mapped);
    setQueryState(candidate.title);
    setDebouncedQuery(candidate.title);
    setStatus(`Linha ${candidate.row || "—"} de ${candidate.ldName || "LD"} selecionada. Confira os dados e anexe o documento.`);
  }, []);

  useEffect(() => {
    if (selected || debouncedQuery.trim().length < 4) return;
    const exact = uniqueExactCandidate(candidates, debouncedQuery);
    if (exact) chooseCandidate(exact);
  }, [candidates, chooseCandidate, debouncedQuery, selected]);

  const attachSource = useCallback(async (file: File | null) => {
    if (!file || busy) return;
    setBusy(true);
    setStatus("Conferindo o documento de origem…");
    try {
      const inspected = await inspectSourceDocument(file);
      setSource(inspected);
      setManualOriginalPages(null);
      setStatus(inspected.originalPages
        ? `${file.name}: ${inspected.originalPages.toLocaleString("pt-BR")} página(s) de origem.`
        : `${file.name}: confirme manualmente a quantidade de páginas do DOCX.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível abrir o documento.";
      setSource(null);
      setStatus(message);
      notify(message, "error");
    } finally {
      setBusy(false);
    }
  }, [busy, notify]);

  const updateField = useCallback(<K extends keyof CoverDocumentData>(key: K, value: CoverDocumentData[K]) => {
    setData((current) => ({ ...current, [key]: value }));
  }, []);

  const restoreField = useCallback((key: keyof CoverDocumentData) => {
    setData((current) => ({ ...current, [key]: baseData[key] }));
  }, [baseData]);

  useEffect(() => {
    const token = ++previewToken.current;
    if (!selected || !totalPages || hasErrors) {
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      void createCoverPreview(data, totalPages).then((blob) => {
        if (token !== previewToken.current) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return url;
        });
      }).catch(() => undefined);
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeout);
      previewToken.current += 1;
    };
  }, [data, hasErrors, selected, totalPages]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const generate = useCallback(async (kind: "pdf" | "docx") => {
    if (!source || !selected || !totalPages || hasErrors || busy) return;
    setBusy(true);
    setStatus(kind === "pdf" ? "Montando a capa e preservando as páginas originais…" : "Montando a capa Word editável e incorporando o documento original…");
    try {
      const generated = kind === "pdf"
        ? await generatePdf(data, source)
        : await generateDocx(data, source, totalPages);
      downloadGenerated(generated);
      setStatus(`${generated.fileName} gerado com sucesso.`);
      notify("Arquivo com capa gerado com sucesso.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível gerar o arquivo.";
      setStatus(message);
      notify(message, "error");
    } finally {
      setBusy(false);
    }
  }, [busy, data, hasErrors, notify, selected, source, totalPages]);

  const clear = useCallback(() => {
    setRecords([]);
    setSearchIndex({ entries: [], count: 0 });
    setLdNames([]);
    setLdSource("");
    setQueryState("");
    setDebouncedQuery("");
    setSelected(null);
    setBaseData(EMPTY_DATA);
    setData(EMPTY_DATA);
    setSource(null);
    setManualOriginalPages(null);
    setStatus("Use a LD já carregada no GRCON ou selecione outra LD.");
    setAdvancedOpen(false);
  }, []);

  const activate = useCallback(() => {
    window.requestAnimationFrame(() => document.getElementById("cover-title-search")?.focus());
  }, []);

  useEffect(() => coverDocumentBridge.register({ activate, clear, getDebugState: () => stateRef.current }), [activate, clear]);

  return {
    records,
    ldNames,
    ldSource,
    query,
    setQuery: (value: string) => {
      setQueryState(value);
      if (selected && value !== selected.title) setSelected(null);
    },
    candidates,
    selected,
    data,
    source,
    originalPages,
    totalPages,
    manualOriginalPages,
    setManualOriginalPages,
    busy,
    status,
    validations,
    hasErrors,
    overrides,
    previewUrl,
    advancedOpen,
    setAdvancedOpen,
    loadLds,
    chooseCandidate,
    attachSource,
    updateField,
    restoreField,
    generate,
    clear,
    activate,
    getDebugState: () => stateRef.current,
  };
}
