import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildLdSearchIndex,
  categoryLabel,
  loadLdRecords,
  searchLdDocuments,
  uniqueExactCandidate,
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
  internalDocumentCode: "",
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
    categoryLabel: candidate.categoryLabel || categoryLabel(candidate.category),
    classification: candidate.classification,
    internalDocumentCode: candidate.internalDocumentCode,
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

export function useCoverDocument() {
  const [records, setRecords] = useState<LdDocumentRecord[]>([]);
  const [ldNames, setLdNames] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<CoverDocumentCandidate | null>(null);
  const [baseData, setBaseData] = useState<CoverDocumentData>(EMPTY_DATA);
  const [data, setData] = useState<CoverDocumentData>(EMPTY_DATA);
  const [source, setSource] = useState<SourceDocumentInfo | null>(null);
  const [manualOriginalPages, setManualOriginalPages] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Carregue uma ou mais LDs para começar.");
  const [previewUrl, setPreviewUrl] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const stateRef = useRef<CoverDebugState | null>(null);
  const previewToken = useRef(0);

  const searchIndex = useMemo(() => buildLdSearchIndex(records), [records]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 120);
    return () => window.clearTimeout(timeout);
  }, [query]);
  const candidates = useMemo(() => searchLdDocuments(searchIndex, debouncedQuery), [searchIndex, debouncedQuery]);
  const originalPages = manualOriginalPages ?? source?.originalPages ?? null;
  const totalPages = originalPages ? originalPages + 1 : null;
  const validations = useMemo(() => validateCover(selected, data, source, totalPages), [selected, data, source, totalPages]);
  const hasErrors = validations.some((item) => item.level === "error");
  const overrides = useMemo(() => new Set((Object.keys(data) as Array<keyof CoverDocumentData>).filter((key) => data[key] !== baseData[key])), [baseData, data]);

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

  const loadLds = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length || busy) return;
    setBusy(true);
    setStatus("Lendo LDs com o parser do GRCON…");
    try {
      const loaded = await loadLdRecords(list);
      setRecords(loaded);
      setLdNames(list.map((file) => file.name));
      setSelected(null);
      setBaseData(EMPTY_DATA);
      setData(EMPTY_DATA);
      setQuery("");
      setDebouncedQuery("");
      setStatus(`${loaded.length.toLocaleString("pt-BR")} registro(s) documental(is) disponível(is) para pesquisa.`);
      notify("LD carregada para a ferramenta de capa.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível ler a LD.";
      setStatus(message);
      notify(message, "error");
    } finally {
      setBusy(false);
    }
  }, [busy, notify]);

  const chooseCandidate = useCallback((candidate: CoverDocumentCandidate) => {
    const mapped = fromCandidate(candidate);
    setSelected(candidate);
    setBaseData(mapped);
    setData(mapped);
    setQuery(candidate.title);
    setStatus(`Linha ${candidate.row || "—"} de ${candidate.ldName || "LD"} selecionada. Confira os dados e anexe o documento.`);
  }, []);

  useEffect(() => {
    if (selected || query.trim().length < 4) return;
    const exact = uniqueExactCandidate(candidates, query);
    if (exact) chooseCandidate(exact);
  }, [candidates, chooseCandidate, query, selected]);

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
      createCoverPreview(data, totalPages).then((blob) => {
        if (token !== previewToken.current) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return url;
        });
      }).catch(() => {});
    }, 250);
    return () => window.clearTimeout(timeout);
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
    setLdNames([]);
    setQuery("");
    setDebouncedQuery("");
    setSelected(null);
    setBaseData(EMPTY_DATA);
    setData(EMPTY_DATA);
    setSource(null);
    setManualOriginalPages(null);
    setStatus("Carregue uma ou mais LDs para começar.");
    setAdvancedOpen(false);
  }, []);

  const activate = useCallback(() => {
    window.requestAnimationFrame(() => document.getElementById("cover-title-search")?.focus());
  }, []);

  useEffect(() => coverDocumentBridge.register({ activate, clear, getDebugState: () => stateRef.current }), [activate, clear]);

  return {
    records,
    ldNames,
    query,
    setQuery: (value: string) => { setQuery(value); if (selected && value !== selected.title) setSelected(null); },
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
