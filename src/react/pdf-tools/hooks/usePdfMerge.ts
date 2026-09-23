import { useCallback, useEffect, useRef, useState } from "react";
import { pdfMergeAdapter as Adapter, pdfMergeBridge } from "../services/pdfMergeAdapter";
import type {
  PdfMergeDebugState,
  PdfMergeItem,
  PdfMergeProgressState,
  PdfMergeResult,
  PdfMergeState,
} from "../types/domain";

type MoveAction = "up" | "down";

export interface PdfMergeFocusRequest {
  id: string;
  action: MoveAction;
  token: number;
}

const INITIAL_PROGRESS: PdfMergeProgressState = {
  percent: 0,
  message: "Preparando os PDFs…",
};

export function usePdfMerge() {
  const [items, setItems] = useState<PdfMergeItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<PdfMergeProgressState>(INITIAL_PROGRESS);
  const [outputName, setOutputNameState] = useState<string>(Adapter.DEFAULT_OUTPUT_NAME);
  const [result, setResult] = useState<PdfMergeResult | null>(null);
  const [isDropActive, setIsDropActive] = useState(false);
  const [draggedId, setDraggedId] = useState("");
  const [dropTargetId, setDropTargetId] = useState("");
  const [focusRequest, setFocusRequest] = useState<PdfMergeFocusRequest | null>(null);

  const itemsRef = useRef(items);
  const busyRef = useRef(busy);
  const outputNameRef = useRef(outputName);
  const resultRef = useRef<PdfMergeResult | null>(result);
  const stateRef = useRef<PdfMergeDebugState | null>(null);
  const dragDepthRef = useRef(0);
  const mountedRef = useRef(true);

  itemsRef.current = items;
  busyRef.current = busy;
  outputNameRef.current = outputName;
  resultRef.current = result;
  stateRef.current = {
    items,
    busy,
    outputName,
    result,
    workerActive: Adapter.hasActiveWorker(),
  };

  const replaceResult = useCallback((next: PdfMergeResult | null): void => {
    resultRef.current = next;
    setResult(next);
  }, []);

  const invalidateResult = useCallback((): void => {
    const current = resultRef.current;
    if (!current) return;
    Adapter.revokeResult(current.url);
    replaceResult(null);
  }, [replaceResult]);

  const addFiles = useCallback((files: FileList | File[] | null | undefined): void => {
    if (busyRef.current) return;
    const update = Adapter.addFiles(itemsRef.current, files);
    if (update.added) {
      invalidateResult();
      itemsRef.current = update.items;
      setItems(update.items);
      Adapter.notify(
        `${update.added.toLocaleString("pt-BR")} arquivo(s) adicionado(s). Confira a ordem antes de combinar.`,
        "success",
      );
    }
    if (update.invalid) {
      Adapter.notify(
        `${update.invalid.toLocaleString("pt-BR")} arquivo(s) ignorado(s): selecione somente PDFs válidos e não vazios.`,
        "warn",
      );
    }
    if (update.duplicated) {
      Adapter.notify(
        `${update.duplicated.toLocaleString("pt-BR")} arquivo(s) idêntico(s) já estavam na lista e não foram duplicados.`,
        "warn",
      );
    }
  }, [invalidateResult]);

  const removeItem = useCallback((id: string): void => {
    if (busyRef.current) return;
    const next = itemsRef.current.filter((item) => item.id !== id);
    if (next.length === itemsRef.current.length) return;
    invalidateResult();
    itemsRef.current = next;
    setItems(next);
  }, [invalidateResult]);

  const moveItem = useCallback((id: string, delta: number): void => {
    if (busyRef.current) return;
    const from = itemsRef.current.findIndex((item) => item.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= itemsRef.current.length) return;
    invalidateResult();
    const next = Adapter.reorder(itemsRef.current, from, to);
    itemsRef.current = next;
    setItems(next);
    setFocusRequest({
      id,
      action: delta < 0 ? "up" : "down",
      token: Date.now(),
    });
  }, [invalidateResult]);

  const startDrag = useCallback((id: string): void => {
    if (busyRef.current) return;
    setDraggedId(id);
    setDropTargetId("");
  }, []);

  const overDragTarget = useCallback((id: string): void => {
    if (busyRef.current || !draggedId || draggedId === id) return;
    setDropTargetId(id);
  }, [draggedId]);

  const dropOnItem = useCallback((id: string): void => {
    if (busyRef.current || !draggedId) return;
    const from = itemsRef.current.findIndex((item) => item.id === draggedId);
    const to = itemsRef.current.findIndex((item) => item.id === id);
    if (from >= 0 && to >= 0 && from !== to) {
      invalidateResult();
      const next = Adapter.reorder(itemsRef.current, from, to);
      itemsRef.current = next;
      setItems(next);
    }
    setDraggedId("");
    setDropTargetId("");
  }, [draggedId, invalidateResult]);

  const endDrag = useCallback((): void => {
    setDraggedId("");
    setDropTargetId("");
  }, []);

  const enterDropZone = useCallback((): void => {
    dragDepthRef.current += 1;
    if (!busyRef.current) setIsDropActive(true);
  }, []);

  const leaveDropZone = useCallback((): void => {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (!dragDepthRef.current) setIsDropActive(false);
  }, []);

  const resetDropZone = useCallback((): void => {
    dragDepthRef.current = 0;
    setIsDropActive(false);
  }, []);

  const setOutputName = useCallback((value: string): void => {
    if (busyRef.current) return;
    outputNameRef.current = value;
    setOutputNameState(value);
  }, []);

  const downloadAgain = useCallback((): void => {
    const current = resultRef.current;
    if (!current) return;
    const name = Adapter.triggerDownload(current.url, outputNameRef.current || current.name);
    outputNameRef.current = name;
    setOutputNameState(name);
    const renamed = { ...current, name };
    resultRef.current = renamed;
    setResult(renamed);
  }, []);

  const combine = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    const currentItems = [...itemsRef.current];
    if (currentItems.length < 2) {
      Adapter.notify("Selecione pelo menos dois arquivos para combinar.", "warn");
      return;
    }

    invalidateResult();
    const normalizedName = Adapter.outputFileName(outputNameRef.current);
    outputNameRef.current = normalizedName;
    setOutputNameState(normalizedName);
    busyRef.current = true;
    setBusy(true);
    setProgress({ percent: 1, message: "Preparando os PDFs…" });

    try {
      const outcome = await Adapter.merge(currentItems, normalizedName, (entry) => {
        if (!mountedRef.current) return;
        setProgress(Adapter.progressState(entry, currentItems.length));
      });
      if (!mountedRef.current) return;

      const nextResult = Adapter.createResult(outcome, normalizedName);
      replaceResult(nextResult);
      setProgress({ percent: 100, message: "PDF combinado com sucesso." });
      Adapter.notify(
        `PDF combinado: ${nextResult.pageCount.toLocaleString("pt-BR")} página(s) em um único arquivo.`,
        "success",
      );
      const downloadedName = Adapter.triggerDownload(nextResult.url, normalizedName);
      if (downloadedName !== nextResult.name) {
        const renamed = { ...nextResult, name: downloadedName };
        replaceResult(renamed);
      }
    } catch (error) {
      const failure = error as { code?: string; message?: string };
      if (failure.code !== "CANCELLED") {
        Adapter.notify(failure.message || "Não foi possível combinar os arquivos.", "error");
      }
    } finally {
      if (mountedRef.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, [invalidateResult, replaceResult]);

  const cancel = useCallback((notifyUser = true): void => {
    if (!busyRef.current && !Adapter.hasActiveWorker()) return;
    Adapter.cancel({ notifyUser });
  }, []);

  const clear = useCallback((): void => {
    if (busyRef.current || !itemsRef.current.length) return;
    itemsRef.current = [];
    setItems([]);
    invalidateResult();
    outputNameRef.current = Adapter.DEFAULT_OUTPUT_NAME;
    setOutputNameState(Adapter.DEFAULT_OUTPUT_NAME);
    setProgress(INITIAL_PROGRESS);
    setDraggedId("");
    setDropTargetId("");
    resetDropZone();
  }, [invalidateResult, resetDropZone]);

  const activate = useCallback((): void => {
    window.requestAnimationFrame(() => {
      document.getElementById("pdf-merge-drop")?.focus();
    });
  }, []);

  const deactivate = useCallback((): void => {
    if (Adapter.hasActiveWorker()) cancel(false);
  }, [cancel]);

  useEffect(() => {
    const unregister = pdfMergeBridge.register({
      activate,
      deactivate,
      addFiles,
      clear,
      getDebugState: () => stateRef.current || {
        items: [],
        busy: false,
        outputName: Adapter.DEFAULT_OUTPUT_NAME,
        result: null,
        workerActive: Adapter.hasActiveWorker(),
      },
    });
    return unregister;
  }, [activate, deactivate, addFiles, clear]);

  useEffect(() => {
    const module = document.getElementById("pdf-tools-module");
    if (!module) return undefined;
    const observer = new MutationObserver(() => {
      if (module.hidden && Adapter.hasActiveWorker()) cancel(false);
    });
    observer.observe(module, { attributes: true, attributeFilter: ["hidden"] });
    return () => observer.disconnect();
  }, [cancel]);

  useEffect(() => {
    const handleBeforeUnload = (): void => {
      Adapter.dispose();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      mountedRef.current = false;
      Adapter.dispose();
    };
  }, []);

  const state: PdfMergeState = {
    items,
    busy,
    progress,
    outputName,
    result,
    isDropActive,
    draggedId,
    dropTargetId,
    workerActive: Adapter.hasActiveWorker(),
  };

  return {
    state,
    focusRequest,
    summary: Adapter.summarize(items),
    addFiles,
    removeItem,
    moveItem,
    startDrag,
    overDragTarget,
    dropOnItem,
    endDrag,
    enterDropZone,
    leaveDropZone,
    resetDropZone,
    setOutputName,
    combine,
    cancel,
    clear,
    downloadAgain,
    formatBytes: Adapter.formatBytes,
  };
}
