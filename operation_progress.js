(function (root) {
  "use strict";
  const active = new Map(), recent = [], longTasks = [];
  let observer = null;
  try {
    if (root.PerformanceObserver?.supportedEntryTypes?.includes("longtask")) {
      observer = new root.PerformanceObserver(list => {
        for (const entry of list.getEntries()) longTasks.push({ startMs: Math.round(entry.startTime), durationMs: Math.round(entry.duration) });
        if (longTasks.length > 100) longTasks.splice(0, longTasks.length - 100);
      });
      observer.observe({ type: "longtask", buffered: true });
    }
  } catch (_) { /* Diagnostics do not participate in operational outcomes. */ }
  const context = () => `${root.GrconCloud?.state?.membership?.workspace_id || ""}:${root.GrconCloud?.state?.session?.user?.id || ""}`;
  const abortError = () => new DOMException("Operação interrompida. Confira o contexto e tente novamente.", "AbortError");
  const paint = () => new Promise(resolve => {
    // The timer after rAF allows the browser to paint before CPU work starts.
    if (document.hidden || !root.requestAnimationFrame) root.setTimeout(resolve, 0);
    else root.requestAnimationFrame(() => root.setTimeout(resolve, 0));
  });
  function element(value) { return typeof value === "string" ? document.querySelector(value) : value; }
  function begin(key, label, options = {}) {
    if (active.has(key)) throw new Error("Esta operação já está em andamento.");
    const started = performance.now(), scope = context(), controller = new AbortController();
    const taskId = options.silent ? null : root.QualityTaskCenter?.start(label, options.detail || "Preparando…");
    const button = element(options.button);
    // React owns its subtree: never replace JSX button child nodes with imperative text.
    const managedButton = !!button?.closest?.("[data-grcon-react-island]");
    const previous = button && !managedButton ? { children: [...button.childNodes], disabled: button.disabled, busy: button.getAttribute("aria-busy") } : null;
    if (button && !managedButton) { button.disabled = true; button.textContent = options.busyLabel || "Processando…"; button.setAttribute("aria-busy", "true"); }
    const requestedHost = element(options.host);
    const host = requestedHost?.closest?.("[data-grcon-react-island]") ? (requestedHost.closest("[data-grcon-react-island]").parentElement || document.body) : (requestedHost || document.querySelector("dialog[open],.module-view:not([hidden])") || document.querySelector("main") || document.body);
    const node = document.createElement("div");
    node.className = "grcon-operation-progress"; node.dataset.operation = key; node.dataset.state = "running";
    const title = document.createElement("strong"); title.textContent = label;
    const message = document.createElement("span");
    const announcement = document.createElement("span"); announcement.className="grcon-operation-announcement"; announcement.setAttribute("role","status"); announcement.setAttribute("aria-live","polite");
    const bar = document.createElement("progress"); bar.max = 100; bar.setAttribute("aria-label", label);
    const elapsed = document.createElement("small");
    const close = document.createElement("button"); close.type = "button"; close.textContent = "Fechar"; close.setAttribute("aria-label","Fechar acompanhamento de " + label); close.hidden = true;
    close.addEventListener("click", () => node.remove(), { once: true });
    node.append(title, message, announcement, bar, elapsed, close); if (!options.silent) host.prepend(node);
    let feedbackMs = null, lastAnnouncement = 0;
    const paintOperation = async () => { await paint(); if (feedbackMs == null) feedbackMs = Math.round(performance.now() - started); };
    let settled = false, lastPaint = 0, pending = null, scheduled = null, phase = "Preparando…", phaseKey = "";
    function flush() {
      scheduled = null; if (!pending || settled) return;
      const detail = pending; pending = null; lastPaint = performance.now();
      if(detail.phase)phaseKey=detail.phase;
      const total = Number(detail.total), done = Number(detail.done);
      const value = detail.progress != null ? Number(detail.progress) : total > 0 && Number.isFinite(done) ? done / total : null;
      const nextPhase = String(detail.message || detail.phase || phase);
      if(announcement.textContent !== nextPhase && (!announcement.textContent || performance.now()-lastAnnouncement>=2000 || detail.phase)){announcement.textContent=nextPhase;lastAnnouncement=performance.now();}
      phase = nextPhase;
      message.textContent = phase + (total > 0 && Number.isFinite(done) ? ` · ${done.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}` : "");
      if (value != null && Number.isFinite(value)) bar.value = Math.min(100, Math.max(0, value * 100)); else bar.removeAttribute("value");
      root.QualityTaskCenter?.update(taskId, value == null ? null : value * 100, message.textContent);
    }
    function update(detail = {}) {
      if (settled) return;
      if (typeof detail === "string") detail = { message: detail };
      const changed = detail.phase && detail.phase !== phaseKey;
      pending = detail;
      if (!lastPaint || changed || performance.now() - lastPaint >= 120) { if (scheduled) clearTimeout(scheduled); flush(); }
      else if (!scheduled) scheduled = setTimeout(flush, 120);
    }
    function finish(error) {
      if (settled) return;
      if(!error && scope !== context())error=abortError();
      flush(); settled = true; if (scheduled) clearTimeout(scheduled); clearInterval(timer); active.delete(key);
      const cancelled = error?.name === "AbortError";
      node.dataset.state = error ? cancelled ? "cancelled" : "failed" : "completed";
      message.textContent = error ? error.message || "Não foi possível concluir." : options.success || "Concluído.";
      elapsed.textContent = `${Math.floor((performance.now() - started) / 1000)} s`;
      announcement.textContent=message.textContent;
      if (!error) bar.value = 100; else bar.hidden=true;
      if (error) root.QualityTaskCenter?.[cancelled ? "cancel" : "fail"]?.(taskId, error); else root.QualityTaskCenter?.finish(taskId, message.textContent);
      close.hidden = false;
      if (button?.isConnected && previous) { button.disabled = previous.disabled; button.replaceChildren(...previous.children); if(previous.busy == null)button.removeAttribute("aria-busy");else button.setAttribute("aria-busy",previous.busy); }
      recent.push({ key, label, durationMs: Math.round(performance.now() - started), feedbackMs, status: node.dataset.state });
      if (recent.length > 100) recent.shift();
      root.dispatchEvent(new CustomEvent("grcon:operation-metric", { detail: recent[recent.length - 1] }));
      if (!error) setTimeout(() => node.remove(), 5000);
    }
    const timer = setInterval(() => {
      const seconds = Math.floor((performance.now() - started) / 1000);
      elapsed.textContent = `${seconds} s${seconds >= 15 ? " · Em processamento; aguarde a confirmação." : ""}`;
    }, 1000);
    const operation = { key, signal: controller.signal, update, paint: paintOperation,
      assertCurrent() { if (controller.signal.aborted || scope !== context()) throw abortError(); },
      finish: () => finish(), fail: error => finish(error),
      abort() { controller.abort(); finish(abortError()); },
      scope, startedAt: started, promise: null };
    active.set(key, operation); update({ message: options.detail || "Preparando…" }); return operation;
  }
  function run(key, label, work, options) {
    if (active.has(key)) return active.get(key).promise || Promise.resolve();
    const operation = begin(key, label, options);
    operation.promise = (async () => {
      try { await operation.paint(); operation.assertCurrent(); const result = await work(operation); operation.assertCurrent(); operation.finish(); return result; }
      catch (error) { operation.fail(error); throw error; }
    })();
    return operation.promise;
  }
  const invalidate = () => { for (const operation of [...active.values()]) if (operation.scope !== context()) operation.abort(); };
  root.addEventListener("grcon:contract-context-changed", invalidate);
  root.addEventListener("grcon:cloud-signed-out", invalidate);
  root.addEventListener("grcon:cloud-state", invalidate);
  root.addEventListener("pagehide", () => { observer?.disconnect(); for (const operation of [...active.values()]) operation.abort(); });
  root.GrconOperations = Object.freeze({ begin, run, paint, isActive: key => active.has(key), metrics: () => recent.map(item => ({ ...item })), diagnostics: () => ({ longTasks: longTasks.map(item => ({ ...item })), active: active.size }) });
})(window);
