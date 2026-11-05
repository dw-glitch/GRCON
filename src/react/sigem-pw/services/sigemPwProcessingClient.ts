/** One bounded Worker per request; no expensive silent fallback on the UI thread. */
export function runPwProcessing<T>(payload: Record<string, unknown>, signal?: AbortSignal, onProgress?: (message: string) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Operação cancelada.", "AbortError")); return; }
    let worker: Worker;
    try { worker = new Worker(new URL("react-dist/sigem-pw-processing-worker.js", document.baseURI)); }
    catch (error) { reject(error); return; }
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); worker.terminate(); };
    const fail = (error: unknown) => { cleanup(); reject(error); };
    const abort = () => fail(new DOMException("Operação cancelada.", "AbortError"));
    const timer = setTimeout(() => fail(new Error("Tempo excedido no processamento. Tente novamente.")), 180000);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = event => {
      if (event.data.progress) { onProgress?.(event.data.progress); return; }
      cleanup();
      if (event.data.ok) resolve(event.data.result as T);
      else reject(new Error(event.data.error || "Falha no processamento em segundo plano."));
    };
    worker.onerror = event => fail(new Error(event.message || "Worker indisponível."));
    worker.onmessageerror = () => fail(new Error("Falha ao receber o resultado do Worker."));
    try { worker.postMessage(payload); } catch (error) { fail(error); }
  });
}
