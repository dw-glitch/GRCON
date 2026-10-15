/* Shared task lifecycle extracted from task_center.js, without its retired UI. */
(function (root) {
  "use strict";
  const STORAGE_KEY = "grcon.task.center.v1";
  const CHANNEL_NAME = "grcon-task-center-v1";
  const MAX_HISTORY = 40;
  const APP = "GRCON";
  const runtime = `${APP}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let previousRuntime = "";
  try { previousRuntime = root.sessionStorage.getItem("grcon.task.runtime") || ""; root.sessionStorage.setItem("grcon.task.runtime", runtime); } catch (_) {}
  const reloading = ["reload", "back_forward"].includes(root.performance?.getEntriesByType?.("navigation")?.[0]?.type);
  let tasks = read().filter(Boolean).map(task => task.status === "running" && ((reloading && task.runtime === previousRuntime) || Number(task.updatedAt) < Date.now() - 4 * 60 * 60 * 1000)
    ? { ...task, status: "interrupted", detail: "Execução interrompida. Confira o resultado antes de repetir.", finishedAt: Date.now(), updatedAt: Date.now() } : task);
  let channel = null, saveTimer = null;

  function id() { return root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`; }
  function read() { try { const data = JSON.parse(root.localStorage.getItem(STORAGE_KEY) || "[]"); return Array.isArray(data) ? data : []; } catch (_) { console.debug("[TaskCenter] context:", _); return []; } }
  function persist() { try { root.localStorage.setItem(STORAGE_KEY, JSON.stringify([...tasks.filter(task => task.status === "running"), ...tasks.filter(task => task.status !== "running").slice(0, MAX_HISTORY)])); } catch (_) { console.debug("[TaskCenter] context:", _); /* o histórico visual nunca bloqueia a tarefa */ } }
  function broadcast() { if (channel) try { channel.postMessage({ runtime, tasks }); } catch (_) { console.debug("[TaskCenter] context:", _); /* sem sincronização */ } }
  function emit() { root.dispatchEvent(new CustomEvent("quality:tasks", { detail: { app: APP, tasks: list() } })); }
  function save(immediate = true) {
    const flush = () => { saveTimer = null; tasks.sort((a,b) => Number(b.updatedAt)-Number(a.updatedAt)); tasks = [...tasks.filter(t => t.status === "running"), ...tasks.filter(t => t.status !== "running").slice(0, MAX_HISTORY)]; persist(); broadcast(); emit(); };
    if (immediate) { if (saveTimer) clearTimeout(saveTimer); flush(); }
    else if (!saveTimer) saveTimer = setTimeout(flush, 150);
  }
  function list() { return tasks.map((task) => ({ ...task })); }
  function find(taskId) { return tasks.find((task) => task.id === taskId); }
  function start(label, detail) {
    const task = { id: id(), runtime, app: APP, label: String(label || "Processando"), detail: String(detail || ""), status: "running", progress: null, startedAt: Date.now(), updatedAt: Date.now(), finishedAt: 0 };
    tasks.unshift(task); save(); return task.id;
  }
  function update(taskId, progress, detail) { const task = find(taskId); if (!task || task.status !== "running") return; task.progress = progress == null ? null : Math.max(0, Math.min(100, Number(progress) || 0)); if (detail !== undefined) task.detail = String(detail || ""); task.updatedAt = Math.max(Date.now(),Number(task.updatedAt||0)+1); save(false); }
  function terminal(taskId, status, detail) { const task = find(taskId); if (!task || task.status !== "running") return; task.status = status; if (status === "completed") task.progress = 100; if (detail !== undefined) task.detail = String(detail?.message || detail || ""); task.finishedAt = task.updatedAt = Math.max(Date.now(),Number(task.updatedAt||0)+1); save(); }
  function finish(taskId, detail) { terminal(taskId, "completed", detail); }
  function fail(taskId, error) { terminal(taskId, "failed", error || "Falha na tarefa"); }
  function cancel(taskId, error) { terminal(taskId, "cancelled", error || "Processamento cancelado."); }

  function clearCompleted() { tasks = tasks.filter((task) => task.status === "running"); save(); }
  async function run(label, work, detail) {
    const taskId = start(label, detail);
    await new Promise(resolve => !document.hidden && root.requestAnimationFrame ? root.requestAnimationFrame(() => root.setTimeout(resolve, 0)) : root.setTimeout(resolve, 0));
    try { const result = await work({ id: taskId, update: (progress, message) => update(taskId, progress, message) }); finish(taskId); return result; }
    catch (error) { (error?.name === "AbortError" ? cancel : fail)(taskId, error); throw error; }
  }
  const liveRuntimes = new Set([runtime]);
  const restored = new Set(tasks.filter(task=>task.status === "running").map(task=>task.id));
  try { channel = new BroadcastChannel(CHANNEL_NAME); channel.addEventListener("message", event => {
    if (!event.data || event.data.runtime === runtime) return;
    liveRuntimes.add(event.data.runtime);
    if(event.data.kind === "probe"){channel.postMessage({kind:"alive",runtime});return;}
    if(!Array.isArray(event.data.tasks))return;
    const merged = new Map();
    for (const task of [...tasks, ...event.data.tasks]) if (!merged.has(task.id) || (Number(task.updatedAt) > Number(merged.get(task.id).updatedAt) || Number(task.updatedAt) === Number(merged.get(task.id).updatedAt) && merged.get(task.id).status === "running" && task.status !== "running")) merged.set(task.id, task);
    tasks = [...merged.values()]; persist(); emit();
  });
    channel.postMessage({kind:"probe",runtime});
    setTimeout(()=>{
      let changed=false;
      for(const task of tasks)if(restored.has(task.id)&&task.status === "running"&&!liveRuntimes.has(task.runtime)){
        task.status="interrupted";task.detail="A aba anterior não confirmou esta execução. Confira o resultado antes de repetir.";task.updatedAt=task.finishedAt=Date.now();changed=true;
      }
      if(changed)save();
    },5000);
  } catch (_) { channel = null; }
  root.addEventListener("pagehide", () => {
    if (saveTimer) clearTimeout(saveTimer);
    for (const task of tasks) if (task.runtime === runtime && task.status === "running") {
      task.status = "interrupted"; task.detail = "A aba foi encerrada antes da confirmação."; task.updatedAt = task.finishedAt = Date.now();
    }
    save(); channel?.close();
  });
  const api = Object.freeze({ start, update, finish, fail, cancel, run, list, clearCompleted });
  root.GrconOperationTasks = api;
  // Compatibility for Workspace consumers; no legacy drawer or button is installed.
  root.QualityTaskCenter = api;
})(window);
