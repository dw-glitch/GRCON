/**
 * GRCON — Painel da resposta de e-mail da eGRDT
 *
 * Abre sozinho assim que uma eGRDT é gerada e pode ser reaberto a qualquer
 * momento pelo botão "Resposta de e-mail" da triagem ou pelo botão da eGRDT
 * selecionada no Histórico. O painel mostra a mensagem (editável) e a relação
 * dos documentos postados, e copia as duas coisas em um clique — como tabela
 * de verdade no Outlook e como texto tabulado nos clientes em texto puro.
 *
 * O conteúdo é montado por egrdt_email_reply.js; aqui fica só a tela.
 */
(function (root) {
  "use strict";

  const Reply = root.GrconEgrdtEmailReply;
  if (!Reply || typeof document === "undefined") return;

  const AUTO_KEY = "grcon-egrdt-email-auto";
  const state = { records: [], lastGenerated: [], reply: null, open: false, lastFocus: null, panel: null };

  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
  }

  function autoOpenEnabled() {
    try { return localStorage.getItem(AUTO_KEY) !== "0"; } catch (_) { console.debug("[EmailReply] preferência indisponível:", _); return true; }
  }

  function saveAutoOpen(enabled) {
    try { localStorage.setItem(AUTO_KEY, enabled ? "1" : "0"); } catch (_) { console.debug("[EmailReply] preferência não persistida:", _); }
  }

  function ensurePanel() {
    if (state.panel) return state.panel;
    const overlay = document.createElement("div");
    overlay.className = "egrdt-email-overlay";
    overlay.id = "egrdt-email-overlay";
    overlay.hidden = true;

    const panel = document.createElement("aside");
    panel.className = "egrdt-email-panel";
    panel.id = "egrdt-email-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "egrdt-email-title");
    panel.innerHTML = `
      <header class="egrdt-email-header">
        <div>
          <span>RESPOSTA DE E-MAIL</span>
          <h2 id="egrdt-email-title">Documentos postados</h2>
          <p id="egrdt-email-subtitle">Relação pronta para colar na resposta.</p>
        </div>
        <button aria-label="Fechar a resposta de e-mail" class="icon-button" data-egrdt-email-action="close" type="button">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"></path></svg>
        </button>
      </header>
      <div class="egrdt-email-body">
        <label class="egrdt-email-message">
          <span>Mensagem da resposta (edite se precisar)</span>
          <textarea id="egrdt-email-message" rows="6" spellcheck="false"></textarea>
        </label>
        <div class="egrdt-email-preview-heading">
          <strong>Relação dos documentos</strong>
          <small id="egrdt-email-count">Nenhuma linha</small>
        </div>
        <div class="egrdt-email-preview" id="egrdt-email-preview"></div>
      </div>
      <footer class="egrdt-email-footer">
        <label class="egrdt-email-auto">
          <input id="egrdt-email-auto" type="checkbox"/>
          <span>Abrir este painel ao gerar a eGRDT</span>
        </label>
        <div class="egrdt-email-actions">
          <button class="secondary-button compact" data-egrdt-email-action="mail" type="button">Abrir no e-mail</button>
          <button class="secondary-button compact" data-egrdt-email-action="copy-table" type="button">Copiar só a tabela</button>
          <button class="primary-button compact" data-egrdt-email-action="copy-all" type="button">Copiar resposta</button>
        </div>
      </footer>`;

    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    overlay.addEventListener("click", close);
    panel.addEventListener("click", (event) => {
      const action = event.target.closest("[data-egrdt-email-action]")?.dataset.egrdtEmailAction;
      if (action === "close") close();
      if (action === "copy-all") void copyReply(false);
      if (action === "copy-table") void copyReply(true);
      if (action === "mail") void openMail();
    });
    panel.querySelector("#egrdt-email-auto").addEventListener("change", (event) => saveAutoOpen(event.target.checked));

    state.panel = { overlay, panel };
    return state.panel;
  }

  function currentMessage() {
    const field = document.getElementById("egrdt-email-message");
    return field ? field.value : (state.reply ? state.reply.message : "");
  }

  function currentReply() {
    return Reply.build(state.records, { message: currentMessage() });
  }

  function render() {
    const { panel } = ensurePanel();
    const reply = state.reply;
    const numbers = reply.summary.egrdtNumbers;
    panel.querySelector("#egrdt-email-title").textContent = numbers.length === 1 ? numbers[0] : "Documentos postados";
    panel.querySelector("#egrdt-email-subtitle").textContent = numbers.length > 1
      ? `${numbers.length} eGRDTs · ${reply.summary.documents} documento(s) · ${reply.summary.files} arquivo(s)`
      : `${reply.summary.documents} documento(s) · ${reply.summary.files} arquivo(s)`;
    panel.querySelector("#egrdt-email-message").value = reply.message;
    panel.querySelector("#egrdt-email-count").textContent = `${reply.rows.length} linha(s)`;
    panel.querySelector("#egrdt-email-preview").innerHTML = reply.tableHtml;
    panel.querySelector("#egrdt-email-auto").checked = autoOpenEnabled();
  }

  function onKeydown(event) {
    if (event.key === "Escape") { event.stopPropagation(); close(); }
  }

  function open(records, options) {
    const list = (Array.isArray(records) ? records : [records]).filter((record) => record && (record.files || []).length);
    if (!list.length) { notify("Esta eGRDT não tem arquivos registrados para montar a resposta.", "warning"); return false; }
    const { overlay, panel } = ensurePanel();
    state.records = list;
    state.reply = Reply.build(list, options || {});
    render();
    overlay.hidden = false;
    panel.hidden = false;
    state.open = true;
    state.lastFocus = document.activeElement;
    document.addEventListener("keydown", onKeydown, true);
    root.setTimeout(() => panel.querySelector("#egrdt-email-message")?.focus(), 0);
    return true;
  }

  function close() {
    if (!state.open || !state.panel) return;
    state.panel.overlay.hidden = true;
    state.panel.panel.hidden = true;
    state.open = false;
    document.removeEventListener("keydown", onKeydown, true);
    if (state.lastFocus && typeof state.lastFocus.focus === "function") state.lastFocus.focus();
    state.lastFocus = null;
  }

  /**
   * O cliente de e-mail cola a tabela quando a área de transferência carrega
   * text/html; text/plain é o que sobra para quem escreve em texto puro e para
   * colar em colunas no Excel. Por isso os dois formatos vão juntos.
   */
  async function writeClipboard(html, plain) {
    try {
      if (navigator.clipboard && typeof root.ClipboardItem === "function") {
        await navigator.clipboard.write([new root.ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        })]);
        return true;
      }
    } catch (error) {
      console.debug("[EmailReply] área de transferência rica indisponível:", error);
    }
    if (copyBySelection(html)) return true;
    try {
      await navigator.clipboard.writeText(plain);
      return true;
    } catch (error) {
      console.warn("GRCON: não foi possível copiar a resposta de e-mail.", error);
      return false;
    }
  }

  // Navegadores antigos e contextos sem permissão de escrita continuam
  // copiando pela seleção, que preserva a tabela no formato rico.
  function copyBySelection(html) {
    const holder = document.createElement("div");
    holder.setAttribute("contenteditable", "true");
    holder.style.cssText = "position:fixed;left:-10000px;top:0;opacity:0";
    holder.innerHTML = html;
    document.body.appendChild(holder);
    const selection = typeof root.getSelection === "function" ? root.getSelection() : null;
    if (!selection) { holder.remove(); return false; }
    const range = document.createRange();
    range.selectNodeContents(holder);
    selection.removeAllRanges();
    selection.addRange(range);
    let copied = false;
    try { copied = document.execCommand("copy"); } catch (error) { console.debug("[EmailReply] execCommand indisponível:", error); }
    selection.removeAllRanges();
    holder.remove();
    return copied;
  }

  async function copyReply(tableOnly) {
    if (!state.records.length) return;
    const reply = currentReply();
    const copied = tableOnly
      ? await writeClipboard(reply.tableHtml, reply.tableText)
      : await writeClipboard(reply.html, reply.text);
    notify(
      copied
        ? (tableOnly ? "Tabela copiada. Cole na resposta do e-mail." : "Resposta copiada. Cole na resposta do e-mail.")
        : "Não foi possível copiar automaticamente. Selecione o texto do painel e use Ctrl+C.",
      copied ? "success" : "error",
    );
  }

  async function openMail() {
    if (!state.records.length) return;
    const reply = currentReply();
    const copied = await writeClipboard(reply.html, reply.text);
    const link = Reply.mailtoUrl(reply);
    root.location.href = link.url;
    if (link.truncated) notify("A relação é grande para o link do e-mail: ela ficou na área de transferência, use Ctrl+V no corpo da mensagem.", "warning");
    else if (!copied) notify("O e-mail foi aberto com a resposta; a cópia automática não estava disponível.", "warning");
  }

  function trackButton() {
    return document.getElementById("egrdt-email-reply");
  }

  function refreshTrackButton() {
    const button = trackButton();
    if (!button) return;
    const available = state.lastGenerated && state.lastGenerated.length;
    button.disabled = !available;
    button.title = available
      ? "Copiar a resposta de e-mail com os documentos da última eGRDT gerada"
      : "Gere uma eGRDT para montar a resposta de e-mail";
  }

  function openLastGenerated() {
    if (state.lastGenerated && state.lastGenerated.length) open(state.lastGenerated);
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("#egrdt-email-reply")) openLastGenerated();
  });

  // Toda geração de eGRDT — final, pacote ou ZIP — passa pelo mesmo evento com
  // os registros recém-salvos no histórico. Ouvir aqui evita repetir a chamada
  // em cada caminho de exportação. A sincronização do Supabase dispara o mesmo
  // evento com o histórico inteiro, por isso só `generated` abre o painel.
  root.addEventListener("grcon:history-updated", (event) => {
    const detail = event && event.detail;
    if (!detail || !detail.generated) return;
    const records = detail.records;
    if (!Array.isArray(records) || !records.length) return;
    state.lastGenerated = records;
    refreshTrackButton();
    if (autoOpenEnabled()) open(records);
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refreshTrackButton, { once: true });
  else refreshTrackButton();

  root.GrconEgrdtEmailReplyUi = { open, close, openLastGenerated, autoOpenEnabled };
})(typeof globalThis !== "undefined" ? globalThis : this);
