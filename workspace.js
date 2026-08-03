(function (root) {
  "use strict";

  const PREFERENCES_KEY = "grcon.preferences.v1";
  const DRAFTS_KEY = "grcon.drafts.v1";
  const SIGNAL_KEY = "grcon.workspace.signal.v1";
  const CHANNEL_NAME = "grcon-workspace-v1";
  const PEER_TIMEOUT_MS = 26000;
  const PEER_EXPIRY_MS = 20000;
  const baseTitle = document.title;
  const runtimeId = createId();
  const tabId = runtimeId.slice(0, 4).toUpperCase();
  const tasks = new Map();
  const taskCenterIds = new Map();
  const peers = new Map();
  const capacity = Math.max(2, Math.floor((Number(navigator.hardwareConcurrency) || 4) / 2));
  let channel = null;

  function createId() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") {
      return root.crypto.randomUUID().replace(/-/g, "");
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }

  function dispatch(name, detail) {
    try {
      document.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (_) {
      console.debug("[Workspace] context:", _);
      // O aplicativo continua funcional mesmo em navegadores com APIs limitadas.
    }
  }

  function safeRead(storage, key, fallback) {
    try {
      const raw = storage && storage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch (_) {
      console.debug("[Workspace] context:", _);
      return fallback;
    }
  }

  function availableStorage(name) {
    try { return root[name] || null; } catch (_) { console.debug("[Workspace] context:", _); return null; }
  }

  function safeWrite(storage, key, value) {
    try {
      if (!storage) return false;
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      console.debug("[Workspace] context:", _);
      return false;
    }
  }

  function readPreferences() {
    return safeRead(availableStorage("localStorage"), PREFERENCES_KEY, {});
  }

  function preference(key, fallback) {
    const value = readPreferences()[key];
    return value === undefined ? fallback : value;
  }

  function setPreference(key, value) {
    const preferences = readPreferences();
    if (value === undefined || value === null || value === "") delete preferences[key];
    else preferences[key] = value;
    safeWrite(availableStorage("localStorage"), PREFERENCES_KEY, preferences);
    dispatch("grcon:preferences", { preferences, source: "current-tab" });
    return value;
  }

  function readDrafts() {
    return safeRead(availableStorage("sessionStorage"), DRAFTS_KEY, {});
  }

  function draft(key, fallback) {
    const value = readDrafts()[key];
    return value === undefined ? fallback : value;
  }

  function setDraft(key, value) {
    const drafts = readDrafts();
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) delete drafts[key];
    else drafts[key] = value;
    safeWrite(availableStorage("sessionStorage"), DRAFTS_KEY, drafts);
    return value;
  }

  function clearDraft(key) {
    return setDraft(key, undefined);
  }

  function cleanPeers() {
    const limit = Date.now() - PEER_TIMEOUT_MS;
    peers.forEach((peer, id) => {
      if (!peer || peer.updated < limit) peers.delete(id);
    });
  }

  function peerTaskCount() {
    cleanPeers();
    let total = 0;
    peers.forEach((peer) => { total += Math.max(0, Number(peer.active) || 0); });
    return total;
  }

  function status() {
    const localCount = tasks.size;
    const otherCount = peerTaskCount();
    const totalCount = localCount + otherCount;
    return {
      tabId,
      runtimeId,
      localCount,
      otherCount,
      totalCount,
      openTabs: peers.size + 1,
      capacity,
      highLoad: totalCount > capacity,
      tasks: [...tasks.entries()].map(([key, value]) => ({ key, label: value.label, startedAt: value.startedAt })),
    };
  }

  function render() {
    const current = status();
    const indicator = document.getElementById("workspace-status");
    const firstTask = current.tasks[0];
    if (indicator) {
      const localText = current.localCount
        ? `${current.localCount} tarefa${current.localCount === 1 ? "" : "s"}`
        : "Livre";
      const otherText = current.otherCount
        ? ` · +${current.otherCount} em outra${current.otherCount === 1 ? " aba" : "s abas"}`
        : "";
      indicator.textContent = `Aba ${tabId} · ${localText}${otherText}`;
      indicator.classList.toggle("busy", current.localCount > 0);
      indicator.classList.toggle("warn", current.highLoad);
      indicator.title = current.highLoad
        ? `${current.totalCount} tarefas ativas. O GRCON continuará executando, mas o computador está com carga elevada.`
        : `Esta aba é independente. ${current.totalCount} tarefa(s) ativa(s) em ${current.openTabs} aba(s).`;
    }
    document.title = current.localCount
      ? `(${current.localCount}) GRCON — ${firstTask && firstTask.label || "Processando"}`
      : baseTitle;
    dispatch("grcon:workspace-status", current);
    return current;
  }

  function messagePayload(type) {
    return {
      type,
      runtimeId,
      tabId,
      active: tasks.size,
      labels: [...tasks.values()].map((task) => task.label),
      updated: Date.now(),
    };
  }

  function post(type) {
    const payload = messagePayload(type);
    if (channel) {
      try { channel.postMessage(payload); } catch (_) { console.debug("[Workspace] context:", _); /* fallback abaixo */ }
      return;
    }
    try {
      const storage = availableStorage("localStorage");
      if (!storage) return;
      storage.setItem(SIGNAL_KEY, JSON.stringify({ ...payload, nonce: createId() }));
      storage.removeItem(SIGNAL_KEY);
    } catch (_) {
      console.debug("[Workspace] context:", _);
      // Sem coordenação visual entre abas; as tarefas continuam isoladas e funcionais.
    }
  }

  function receive(payload) {
    if (!payload || payload.runtimeId === runtimeId) return;
    if (payload.type === "closed") peers.delete(payload.runtimeId);
    else peers.set(payload.runtimeId, {
      tabId: payload.tabId,
      active: Math.max(0, Number(payload.active) || 0),
      labels: Array.isArray(payload.labels) ? payload.labels : [],
      updated: Number(payload.updated) || Date.now(),
    });
    render();
  }

  function start(key, label) {
    const taskKey = String(key || createId());
    tasks.set(taskKey, {
      label: String(label || "Processando"),
      startedAt: Date.now(),
    });
    if (root.QualityTaskCenter && !taskCenterIds.has(taskKey)) {
      taskCenterIds.set(taskKey, root.QualityTaskCenter.start(String(label || "Processando"), `Aba ${tabId}`));
    }
    render();
    post("state");
    return taskKey;
  }

  function finish(key) {
    const taskKey = String(key || "");
    tasks.delete(taskKey);
    if (root.QualityTaskCenter && taskCenterIds.has(taskKey)) {
      root.QualityTaskCenter.finish(taskCenterIds.get(taskKey));
      taskCenterIds.delete(taskKey);
    }
    render();
    post("state");
  }

  function setTask(key, busy, label) {
    if (busy) start(key, label);
    else finish(key);
  }

  function openNewTab() {
    if (root.location.protocol === "file:") return false;
    const opened = root.open(root.location.href, "_blank", "noopener,noreferrer");
    return Boolean(opened);
  }

  function initializeChannel() {
    if (typeof root.BroadcastChannel === "function") {
      try {
        channel = new root.BroadcastChannel(CHANNEL_NAME);
        channel.addEventListener("message", (event) => receive(event.data));
      } catch (_) {
        console.debug("[Workspace] context:", _);
        channel = null;
      }
    }
    post("state");
  }

  root.addEventListener("storage", (event) => {
    if (event.key === PREFERENCES_KEY) {
      dispatch("grcon:preferences", { preferences: readPreferences(), source: "other-tab" });
      return;
    }
    if (event.key !== SIGNAL_KEY || !event.newValue) return;
    try { receive(JSON.parse(event.newValue)); } catch (_) { console.debug("[Workspace] context:", _); /* sinal incompleto */ }
  });

  root.addEventListener("pagehide", () => {
    post("closed");
    if (channel) {
      try { channel.close(); } catch (_) { console.debug("[Workspace] context:", _); /* sem ação */ }
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    const newTab = document.getElementById("workspace-new-tab");
    if (newTab) {
      if (root.location.protocol === "file:") {
        newTab.hidden = true;
        newTab.setAttribute("aria-hidden", "true");
      } else {
        newTab.addEventListener("click", openNewTab);
      }
    }
    render();
  });

  root.GrconWorkspace = {
    tabId,
    start,
    finish,
    setTask,
    status,
    preference,
    setPreference,
    draft,
    setDraft,
    clearDraft,
    openNewTab,
  };

  initializeChannel();
  render();
})(window);
