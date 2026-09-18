(function (root) {
  "use strict";

  const Core = root.GrconEgrdtTeamsNotificationCore;
  const STORAGE_KEY = "grcon.egrdt.teams.notifications.v1";
  const APP_VERSION = root.GrconConfig?.APP_VERSION || document.documentElement.dataset.version || "5.41.0";
  const state = { latest: [], sending: new Set(), dialogRecord: null };

  function text(value) { return String(value === null || value === undefined ? "" : value).trim(); }
  function escapeHtml(value) {
    return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
    else if (kind === "error") root.alert(message);
  }
  function readAudit() {
    try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); return value && typeof value === "object" ? value : {}; }
    catch (_) { return {}; }
  }
  function writeAudit(value) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }
  function status(record) { return readAudit()[Core.notificationId(record)] || null; }
  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
  }
  function buttonLabel(record) {
    if (state.sending.has(Core.notificationId(record))) return "Enviando ao Teams…";
    return status(record) ? "Reenviar aviso no Teams" : "Avisar no Teams";
  }
  function statusLabel(record) {
    const saved = status(record);
    return saved ? `Avisado no Teams em ${formatDate(saved.sentAt)}` : "Ainda não avisado";
  }
  function buttonHtml(record, options) {
    const settings = options || {};
    const id = Core.notificationId(record);
    const sent = status(record);
    const disabled = state.sending.has(id) ? " disabled" : "";
    const css = settings.primary ? "primary-button" : "secondary-button";
    return `<button class="${css} compact egrdt-teams-notify-button" data-egrdt-teams-record-id="${escapeHtml(text(record.id) || text(record.clientRecordId))}" type="button"${disabled}>${escapeHtml(buttonLabel(record))}</button>${settings.withStatus ? `<small class="egrdt-teams-status ${sent ? "is-sent" : ""}">${escapeHtml(statusLabel(record))}</small>` : ""}`;
  }

  function ensureDialog() {
    let dialog = document.querySelector("#egrdt-teams-dialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "egrdt-teams-dialog";
    dialog.className = "egrdt-teams-dialog";
    dialog.setAttribute("aria-labelledby", "egrdt-teams-dialog-title");
    dialog.innerHTML = `<form method="dialog">
      <header><div><span>AVISO PARA O TEAMS</span><h2 id="egrdt-teams-dialog-title">Confirmar aviso da eGRDT</h2></div><button aria-label="Fechar" class="icon-button" value="cancel" type="submit">×</button></header>
      <div class="egrdt-teams-dialog-body" id="egrdt-teams-dialog-body"></div>
      <label class="egrdt-teams-folder-check"><input id="egrdt-teams-folder-confirmed" type="checkbox"/><span><strong>Confirmo que esta eGRDT já foi colocada na pasta.</strong><small>O grupo será informado com essa confirmação.</small></span></label>
      <footer><button class="secondary-button" value="cancel" type="submit">Cancelar</button><button class="primary-button" id="egrdt-teams-dialog-send" type="button" disabled>Enviar ao grupo</button></footer>
    </form>`;
    document.body.appendChild(dialog);
    const checkbox = dialog.querySelector("#egrdt-teams-folder-confirmed");
    checkbox.addEventListener("change", () => { dialog.querySelector("#egrdt-teams-dialog-send").disabled = !checkbox.checked; });
    dialog.querySelector("#egrdt-teams-dialog-send").addEventListener("click", () => void sendConfirmed());
    dialog.addEventListener("close", () => { state.dialogRecord = null; checkbox.checked = false; dialog.querySelector("#egrdt-teams-dialog-send").disabled = true; });
    return dialog;
  }

  function renderDialog(record) {
    const rows = Core.documentRows(record);
    const mentionNames = Core.MENTIONS.map((item) => `@${item.displayName}`).join(" e ");
    return `<section class="egrdt-teams-destination"><span>Destino</span><strong>${escapeHtml(Core.DESTINATION.name)}</strong><small>Com menção real para ${escapeHtml(mentionNames)}</small></section>
      <p><strong>A eGRDT abaixo já foi criada e colocada na pasta.</strong> Adriana e Janecleide serão solicitadas a efetuar a postagem no SIGEM.</p>
      <div class="egrdt-teams-preview-table"><table><thead><tr><th>eGRDT</th><th>Revisões enviadas (documento · revisão)</th><th>Disciplinas</th></tr></thead><tbody>${rows.map((item, index) => `<tr><td>${index === 0 ? escapeHtml(record.egrdtNumber) : ""}</td><td>${escapeHtml(Core.revisionLabel(item))}</td><td>${escapeHtml(item.discipline)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function open(record) {
    if (!record) return;
    if (!Core.documentRows(record).length) { notify("Esta eGRDT não possui documentos registrados para o aviso.", "error"); return; }
    state.dialogRecord = record;
    const dialog = ensureDialog();
    dialog.querySelector("#egrdt-teams-dialog-body").innerHTML = renderDialog(record);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  async function sendConfirmed() {
    const record = state.dialogRecord;
    const dialog = ensureDialog();
    const checkbox = dialog.querySelector("#egrdt-teams-folder-confirmed");
    if (!record || !checkbox.checked) return;
    const session = root.GrconCloud?.state?.session;
    const membership = root.GrconCloud?.state?.membership;
    if (!session?.access_token || !membership?.workspace_id) {
      notify("Sua sessão compartilhada não está pronta. Entre novamente no GRCON e tente enviar.", "error");
      return;
    }
    const identity = root.GrconCloud?.getCurrentUserIdentity?.() || {};
    const payload = Core.buildPayload(record, {
      folderConfirmed: true,
      appVersion: APP_VERSION,
      workspaceId: membership.workspace_id,
      confirmedBy: identity.displayName || identity.metadataName || identity.email,
      confirmedByEmail: identity.email,
    });
    const id = payload.eventId;
    const sendButton = dialog.querySelector("#egrdt-teams-dialog-send");
    state.sending.add(id);
    sendButton.disabled = true;
    sendButton.textContent = "Enviando…";
    renderLatest();
    root.dispatchEvent(new CustomEvent("grcon:egrdt-teams-state"));
    root.dispatchEvent(new CustomEvent("grcon:egrdt-teams-send", { detail: { active: true, record, eventId: id } }));
    let sendOutcome = "error";
    try {
      const response = await fetch("/api/egrdt-teams-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        const error = new Error(result.message || "O Power Automate não confirmou o recebimento do aviso.");
        error.code = result.code || "NOTIFICATION_FAILED";
        throw error;
      }
      const audit = readAudit();
      audit[id] = { sentAt: result.notifiedAt || new Date().toISOString(), sentBy: identity.email || "", egrdtNumber: record.egrdtNumber };
      writeAudit(audit);
      sendOutcome = "success";
      if (dialog.open) dialog.close("sent");
      notify(`Aviso de ${record.egrdtNumber} enviado ao grupo ${Core.DESTINATION.name}.`, "success");
      root.dispatchEvent(new CustomEvent("grcon:egrdt-teams-notified", { detail: { record, result } }));
    } catch (error) {
      console.error("GRCON Teams:", error);
      const message = error.code === "POWER_AUTOMATE_NOT_CONFIGURED"
        ? "O botão está pronto, mas o fluxo do Power Automate ainda não foi conectado ao GRCON."
        : error.message || "Não foi possível enviar o aviso ao Teams.";
      notify(message, "error");
    } finally {
      root.dispatchEvent(new CustomEvent("grcon:egrdt-teams-send", { detail: { active: false, outcome: sendOutcome, record, eventId: id } }));
      state.sending.delete(id);
      sendButton.textContent = "Enviar ao grupo";
      sendButton.disabled = !checkbox.checked;
      renderLatest();
      root.dispatchEvent(new CustomEvent("grcon:egrdt-teams-state"));
    }
  }

  function resolveRecord(recordId) {
    const wanted = text(recordId);
    const all = [...state.latest, ...(root.GrconHistory?.read?.() || [])];
    return all.find((record) => text(record.id) === wanted || text(record.clientRecordId) === wanted) || null;
  }

  function renderLatest() {
    const panel = document.querySelector("#egrdt-teams-ready");
    const list = document.querySelector("#egrdt-teams-ready-list");
    if (!panel || !list) return;
    panel.hidden = state.latest.length === 0;
    list.innerHTML = state.latest.map((record) => `<article><div><strong>${escapeHtml(record.egrdtNumber)}</strong><span>${Core.documentRows(record).length} documento(s) · ${escapeHtml(statusLabel(record))}</span></div>${buttonHtml(record, { primary: true })}</article>`).join("");
  }

  function setLatest(records) {
    state.latest = (Array.isArray(records) ? records : []).filter((record) => record && record.egrdtNumber);
    renderLatest();
  }

  function bind() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-egrdt-teams-record-id]");
      if (!button || button.closest("#history-detail")) return;
      const record = resolveRecord(button.dataset.egrdtTeamsRecordId);
      if (record) open(record);
    });
    root.addEventListener("grcon:egrdt-generated", (event) => setLatest(event.detail?.records || []));
    root.addEventListener("grcon:egrdt-teams-notified", renderLatest);
    root.addEventListener("storage", (event) => { if (event.key === STORAGE_KEY) renderLatest(); });
  }

  root.GrconEgrdtTeamsNotification = Object.freeze({ open, setLatest, status, statusLabel, buttonHtml, documentRows: Core.documentRows });
  bind();
})(typeof globalThis !== "undefined" ? globalThis : window);
