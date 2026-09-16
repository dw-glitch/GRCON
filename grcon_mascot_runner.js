/* GRCON — GrconMascotRunner v1.
 * Microinteração horizontal independente do host pequeno do mascote.
 * Escuta os eventos operacionais existentes; nunca participa da lógica de negócio.
 */
(function (root) {
  "use strict";

  if (root.GrconMascotRunner) return;

  const VERSION = "1.0.0";
  const ASSET_REVISION = "20260916.4";
  const LANE_ID = "grcon-mascot-run-lane";
  const RUN_DELAY_MS = 220;
  const SAFETY_MARGIN = 26;
  const CHROMA = { r: 232, g: 15, b: 184 };
  const PRIMARY = `assets/mascot/video/grcon-mascot-running-alpha.webm?v=${ASSET_REVISION}`;
  const COMPAT = `assets/mascot/video/grcon-mascot-running-compat.mp4?v=${ASSET_REVISION}`;
  const POSTER = `assets/mascot/video/grcon-mascot-running-poster.png?v=${ASSET_REVISION}`;
  const ELIGIBLE_STATES = new Set([
    "analyzing", "searching-files", "checking-document", "checking-ld",
    "generating-grdt", "sigem-pw-analysis",
  ]);

  const activeContexts = new Map();
  let operationSerial = 0;
  let lastRunSerial = 0;
  let runTimer = 0;
  let laneAnimation = null;
  let mediaToken = 0;
  let canvasFrameToken = 0;
  let currentOperationState = "idle";
  let currentTask = "";
  let currentRun = null;
  let lastResult = { reason: "idle", media: "poster", duration: 0, distance: 0 };
  let preloadDone = false;

  function animationsEnabled() {
    const explicit = document.documentElement.dataset.grconMascotMotion;
    if (explicit === "on") return true;
    if (explicit === "off") return false;
    try { return !root.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches; }
    catch (_) { return true; }
  }

  function contextKey(type, detail) {
    return `${type}:${String(detail?.context || detail?.state || "generic").toLowerCase()}`;
  }

  function taskText(detail) {
    const state = String(detail?.state || "").toLowerCase();
    const task = String(detail?.task || "").trim();
    if (state === "generating-grdt" || /e?grdt/i.test(task)) return "Preparando a eGRDT…";
    if (state === "sigem-pw-analysis" || /projectwise|sigem\s*[×x]\s*pw/i.test(task)) return "Conferindo SIGEM × ProjectWise…";
    if (state === "checking-document") return "Conferindo os documentos…";
    if (state === "checking-ld") return "Conferindo a LD…";
    if (detail?.context === "control" || state === "analyzing" || state === "searching-files") return "Indo conferir os documentos…";
    return task || "Processando documentos…";
  }

  function eligible(detail) {
    if (!detail || detail.runner === false) return false;
    if (String(detail.context || "").toLowerCase() === "control") return true;
    const state = String(detail.state || "").toLowerCase();
    if (ELIGIBLE_STATES.has(state)) return true;
    const task = String(detail.task || "");
    return /analis|confer|e?grdt|sigem|projectwise/i.test(task);
  }

  function buildLane() {
    const lane = document.createElement("div");
    lane.id = LANE_ID;
    lane.dataset.media = "poster";
    lane.dataset.state = "idle";
    lane.setAttribute("aria-hidden", "true");
    lane.innerHTML = `
      <div class="grcon-mascot-run-track">
        <span class="grcon-mascot-run-status"></span>
        <div class="grcon-mascot-runner">
          <img class="grcon-mascot-run-poster" src="${POSTER}" alt="" draggable="false" />
          <video class="grcon-mascot-run-video" muted playsinline preload="metadata" aria-hidden="true"></video>
          <canvas class="grcon-mascot-run-canvas" aria-hidden="true"></canvas>
        </div>
      </div>`;
    return lane;
  }

  function ensureLane() {
    let lane = document.getElementById(LANE_ID);
    if (lane) return lane;
    const workspace = document.getElementById("app-main");
    if (!workspace) return null;
    lane = buildLane();
    const tabs = workspace.querySelector(":scope > .grcon-view-tabs");
    if (tabs) tabs.insertAdjacentElement("afterend", lane);
    else workspace.prepend(lane);
    return lane;
  }

  function parts() {
    const lane = ensureLane();
    if (!lane) return null;
    return {
      lane,
      track: lane.querySelector(".grcon-mascot-run-track"),
      status: lane.querySelector(".grcon-mascot-run-status"),
      runner: lane.querySelector(".grcon-mascot-runner"),
      poster: lane.querySelector(".grcon-mascot-run-poster"),
      video: lane.querySelector(".grcon-mascot-run-video"),
      canvas: lane.querySelector(".grcon-mascot-run-canvas"),
    };
  }

  function setMedia(lane, media) {
    lane.dataset.media = media;
    lastResult.media = media;
  }

  function stopCanvas() {
    canvasFrameToken += 1;
  }

  function startCanvas(video, canvas, lane, token) {
    stopCanvas();
    const frameToken = canvasFrameToken;
    const width = video.videoWidth || 480;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;

    const draw = () => {
      if (token !== mediaToken || frameToken !== canvasFrameToken || lane.dataset.media !== "mp4-canvas") return;
      try {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(video, 0, 0, width, height);
        const image = ctx.getImageData(0, 0, width, height);
        const data = image.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const dr = Math.abs(r - CHROMA.r), dg = Math.abs(g - CHROMA.g), db = Math.abs(b - CHROMA.b);
          const chromaDistance = dr + (dg * 1.25) + db;
          if ((r > 170 && b > 125 && g < 85 && chromaDistance < 135)
            || (r > 180 && b > 135 && g < 65 && r - g > 105 && b - g > 85)) {
            data[i + 3] = 0;
          } else if (r > 155 && b > 115 && g < 110 && chromaDistance < 205) {
            data[i + 3] = Math.min(data[i + 3], 92);
          }
        }
        ctx.putImageData(image, 0, 0);
      } catch (_) {
        setMedia(lane, "poster");
        return;
      }
      if (typeof video.requestVideoFrameCallback === "function") video.requestVideoFrameCallback(draw);
      else root.requestAnimationFrame(draw);
    };
    draw();
    return true;
  }

  function stopVideo(video) {
    try { video.pause(); } catch (_) {}
    video.onplaying = null;
    video.onerror = null;
    video.onabort = null;
  }

  function attemptMedia(format, token) {
    const p = parts();
    if (!p || token !== mediaToken) return Promise.resolve(false);
    const { lane, video, canvas } = p;
    stopVideo(video);
    stopCanvas();
    setMedia(lane, "poster");
    const src = format === "webm" ? PRIMARY : COMPAT;
    video.style.display = format === "mp4" ? "none" : "";
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "auto";

    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(ok);
      };
      const timeout = root.setTimeout(() => finish(false), 3600);
      video.onplaying = () => {
        if (token !== mediaToken) return finish(false);
        if (format === "webm") {
          video.style.display = "";
          setMedia(lane, "webm");
        } else {
          setMedia(lane, "mp4-canvas");
          if (!startCanvas(video, canvas, lane, token)) setMedia(lane, "poster");
        }
        finish(true);
      };
      video.onerror = () => finish(false);
      video.onabort = () => finish(false);
      if (video.src !== new URL(src, document.baseURI).href) {
        video.src = src;
        video.load();
      } else {
        try { video.currentTime = 0; } catch (_) {}
      }
      let playResult;
      try { playResult = video.play(); }
      catch (_) { finish(false); return; }
      playResult?.catch?.(() => finish(false));
    });
  }

  async function ensureMovingMedia(token) {
    if (await attemptMedia("webm", token)) return "webm";
    if (token !== mediaToken) return "cancelled";
    if (await attemptMedia("mp4", token)) return "mp4-canvas";
    if (token === mediaToken) {
      const p = parts();
      if (p) setMedia(p.lane, "poster");
    }
    return "poster";
  }

  function traversalDuration(laneWidth) {
    const scaled = 2600 + Math.max(0, laneWidth - 700) * 1.15;
    return Math.round(Math.max(2600, Math.min(4000, scaled)));
  }

  function animateRunner(runner, start, end, duration) {
    runner.style.setProperty("--grcon-run-x", `${start}px`);
    if (typeof runner.animate === "function") {
      laneAnimation = runner.animate(
        [{ transform: `translate3d(${start}px,0,0)` }, { transform: `translate3d(${end}px,0,0)` }],
        { duration, easing: "linear", fill: "forwards" },
      );
      return laneAnimation.finished.catch(() => undefined);
    }

    return new Promise((resolve) => {
      const done = () => {
        runner.removeEventListener("transitionend", done);
        runner.style.transition = "";
        resolve();
      };
      runner.style.transition = "none";
      runner.style.transform = `translate3d(${start}px,0,0)`;
      void runner.offsetWidth;
      runner.style.transition = `transform ${duration}ms linear`;
      runner.addEventListener("transitionend", done, { once: true });
      root.setTimeout(done, duration + 120);
      runner.style.transform = `translate3d(${end}px,0,0)`;
    });
  }

  function cleanupLane(reason) {
    clearTimeout(runTimer);
    runTimer = 0;
    const p = parts();
    if (!p) return;
    laneAnimation?.cancel?.();
    laneAnimation = null;
    mediaToken += 1;
    stopCanvas();
    stopVideo(p.video);
    p.lane.classList.remove("is-active");
    p.lane.dataset.state = "idle";
    p.runner.style.transition = "";
    p.runner.style.transform = "";
    setMedia(p.lane, "poster");
    currentRun = null;
    lastResult.reason = reason || "complete";
  }

  async function runPass(serial, detail) {
    if (serial !== operationSerial || serial === lastRunSerial || !animationsEnabled()) {
      if (!animationsEnabled()) lastResult.reason = "reduced-motion";
      return false;
    }
    const p = parts();
    if (!p) return false;
    lastRunSerial = serial;
    currentRun = serial;
    p.status.textContent = taskText(detail);
    p.lane.dataset.state = String(detail?.state || detail?.context || "processing-run");
    p.lane.classList.add("is-active");
    setMedia(p.lane, "poster");

    // A corrida tem prioridade visual sobre aceno/processamento no host pequeno.
    root.GrconMascot?.stop?.("runner-start");

    const token = ++mediaToken;
    ensureMovingMedia(token).catch(() => {});

    await new Promise((resolve) => root.requestAnimationFrame(() => root.requestAnimationFrame(resolve)));
    if (serial !== operationSerial && !activeContexts.size) {
      cleanupLane("operation-ended-before-run");
      return false;
    }

    const laneWidth = Math.max(1, p.track.clientWidth || p.lane.clientWidth || document.getElementById("app-main")?.clientWidth || 1);
    const runnerWidth = Math.max(1, p.runner.getBoundingClientRect().width || 110);
    const start = -(runnerWidth + SAFETY_MARGIN);
    const end = laneWidth + SAFETY_MARGIN;
    const duration = traversalDuration(laneWidth);
    lastResult = { reason: "running", media: p.lane.dataset.media, duration, distance: end - start, laneWidth, runnerWidth };

    await animateRunner(p.runner, start, end, duration);
    p.lane.classList.remove("is-active");
    await new Promise((resolve) => root.setTimeout(resolve, 170));
    cleanupLane("complete");

    // Se a operação real ainda continua, o mascote pequeno volta ao vídeo normal de processamento.
    if (activeContexts.size && root.GrconMascot?.play) root.GrconMascot.play(currentOperationState || "searching-files");
    return true;
  }

  function scheduleRun(detail) {
    clearTimeout(runTimer);
    const serial = operationSerial;
    runTimer = root.setTimeout(() => {
      runTimer = 0;
      if (!activeContexts.size || serial !== operationSerial) return;
      runPass(serial, detail).catch(() => cleanupLane("runner-error"));
    }, RUN_DELAY_MS);
  }

  function handleOperation(event) {
    const detail = event?.detail || {};
    const key = contextKey(event.type, detail);
    const wasActive = activeContexts.size > 0;

    if (detail.active) {
      if (!eligible(detail)) return;
      activeContexts.set(key, detail);
      currentOperationState = ELIGIBLE_STATES.has(String(detail.state || "").toLowerCase())
        ? String(detail.state).toLowerCase()
        : "searching-files";
      currentTask = taskText(detail);
      const p = parts();
      if (p && currentRun) p.status.textContent = currentTask;
      if (!wasActive) {
        operationSerial += 1;
        scheduleRun(detail);
      }
      return;
    }

    activeContexts.delete(key);
    if (activeContexts.size) return;
    clearTimeout(runTimer);
    runTimer = 0;
    currentOperationState = "idle";
    currentTask = "";
    // Uma passagem já visível termina naturalmente; uma operação instantânea é cancelada antes de abrir a pista.
    if (!currentRun) lastResult.reason = "short-operation-skipped";
  }

  function preload() {
    if (preloadDone || !animationsEnabled()) return;
    const p = parts();
    if (!p) return;
    preloadDone = true;
    p.video.preload = "metadata";
    p.video.src = PRIMARY;
    try { p.video.load(); } catch (_) {}
  }

  function diagnostics() {
    const p = parts();
    return {
      version: VERSION,
      ready: Boolean(p),
      laneInstances: document.querySelectorAll(`#${LANE_ID}`).length,
      active: Boolean(currentRun),
      operationSerial,
      lastRunSerial,
      activeContexts: [...activeContexts.keys()],
      currentOperationState,
      currentTask,
      animationsEnabled: animationsEnabled(),
      media: p?.lane?.dataset?.media || "poster",
      assets: { primary: PRIMARY, compat: COMPAT, poster: POSTER },
      lastResult: { ...lastResult },
      documentOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    };
  }

  function manualRun(detail) {
    const payload = { active: true, state: "analyzing", context: "control", task: "Analisando os documentos…", ...(detail || {}) };
    const key = `manual:${Date.now()}`;
    const wasActive = activeContexts.size > 0;
    activeContexts.set(key, payload);
    currentOperationState = String(payload.state || "analyzing");
    currentTask = taskText(payload);
    if (!wasActive) operationSerial += 1;
    const serial = operationSerial;
    return runPass(serial, payload).finally(() => activeContexts.delete(key));
  }

  function init() {
    ensureLane();
    root.addEventListener("grcon:processing-state", handleOperation);
    root.addEventListener("grcon:mascot-operation", handleOperation);
    root.addEventListener("grcon:mascot-motion-changed", (event) => {
      if (event?.detail?.enabled === false) cleanupLane("motion-disabled");
      else preload();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && currentRun) cleanupLane("hidden-tab");
    });
    root.addEventListener("pagehide", () => cleanupLane("pagehide"), { once: true });
    const idle = root.requestIdleCallback || ((callback) => root.setTimeout(callback, 900));
    idle(preload, { timeout: 2500 });
  }

  root.GrconMascotRunner = Object.freeze({
    version: VERSION,
    run: manualRun,
    stop: () => cleanupLane("manual-stop"),
    diagnostics,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
