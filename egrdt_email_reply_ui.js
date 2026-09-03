/**
 * GRCON — Painel da resposta de e-mail da eGRDT
 *
 * É aberto exclusivamente pelo botão "Resposta de e-mail" da eGRDT
 * selecionada no Histórico. O painel mostra a mensagem (editável) e a relação
 * dos documentos postados, e copia as duas coisas em um clique — como tabela
 * de verdade no Outlook e como texto tabulado nos clientes em texto puro.
 *
 * A prévia da relação tem duas leituras, alternadas no próprio painel:
 * "Como será colado" mostra a tabela do e-mail no tamanho real, e "Leitura
 * ampla" remonta a mesma relação com o visual do GRCON, cada coluna por
 * extenso, para conferir antes de copiar. O que vai para a área de
 * transferência é sempre a tabela do e-mail, independente da leitura aberta.
 *
 * O conteúdo é montado por egrdt_email_reply.js; aqui fica só a tela.
 */
(function (root) {
  "use strict";

  const Reply = root.GrconEgrdtEmailReply;
  if (!Reply || typeof document === "undefined") return;

  // "paste"  — a tabela exatamente como o e-mail vai recebê-la: o HTML com
  //            estilo embutido de egrdt_email_reply.js, na largura real.
  // "read"   — a mesma relação remontada com o visual do GRCON, ocupando o
  //            painel inteiro, para conferir código e nome de arquivo por
  //            extenso antes de copiar.
  // A conferência e a fidelidade são duas leituras diferentes da mesma
  // relação; forçar as duas numa só era o que deixava a prévia ilegível.
  const VIEWS = { PASTE: "paste", READ: "read" };

  const state = { records: [], reply: null, open: false, lastFocus: null, panel: null, view: VIEWS.PASTE };

  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
  }

  function escapeHtml(value) {
    const utils = root.GrconUtils;
    if (utils && utils.escapeHtml) return utils.escapeHtml(value);
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * A relação remontada para leitura na tela. Não vai para a área de
   * transferência: usa as cores do tema do GRCON (o e-mail é sempre claro),
   * deixa cada coluna com a largura do próprio conteúdo e marca a coluna da
   * revisão, que é o campo que se confere de relance.
   */
  function readingTableHtml(reply) {
    const columns = reply.columns || [];
    const align = Reply.COLUMN_ALIGN || {};
    const head = columns.map((column) => `<th scope="col" style="text-align:${align[column] || "left"}">${escapeHtml(column)}</th>`).join("");
    const body = (reply.rows || []).map((row, index) => {
      const cells = columns.map((column) => `<td style="text-align:${align[column] || "left"}">${escapeHtml(row[column])}</td>`).join("");
      return `<tr><th scope="row">${index + 1}</th>${cells}</tr>`;
    }).join("");
    return `<table class="egrdt-email-reading"><thead><tr><th scope="col"><span class="sr-only">Linha</span></th>${head}</tr></thead><tbody>${body}</tbody></table>`;
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
        <div class="egrdt-email-heading">
          <span>RESPOSTA DE E-MAIL</span>
          <h2 id="egrdt-email-title">Documentos postados</h2>
          <p id="egrdt-email-subtitle">Relação pronta para colar na resposta.</p>
          <ul class="egrdt-email-metrics" id="egrdt-email-metrics"></ul>
        </div>
        <button aria-label="Fechar a resposta de e-mail" class="icon-button" data-egrdt-email-action="close" type="button">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"></path></svg>
        </button>
      </header>
      <div class="egrdt-email-body">
        <label class="egrdt-email-message">
          <span>Mensagem da resposta (edite se precisar)</span>
          <textarea id="egrdt-email-message" rows="5" spellcheck="false"></textarea>
        </label>
        <div class="egrdt-email-preview-heading">
          <div class="egrdt-email-preview-label">
            <strong>Relação dos documentos</strong>
            <small id="egrdt-email-count">Nenhuma linha</small>
          </div>
          <div class="egrdt-email-views" role="group" aria-label="Como exibir a relação">
            <button aria-pressed="true" class="egrdt-email-view" data-egrdt-email-view="paste" type="button">Como será colado</button>
            <button aria-pressed="false" class="egrdt-email-view" data-egrdt-email-view="read" type="button">Leitura ampla</button>
          </div>
        </div>
        <p class="egrdt-email-hint" id="egrdt-email-hint"></p>
        <div class="egrdt-email-preview" id="egrdt-email-preview" tabindex="0" role="region" aria-label="Prévia da relação dos documentos"></div>
      </div>
      <footer class="egrdt-email-footer">
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
      const view = event.target.closest("[data-egrdt-email-view]")?.dataset.egrdtEmailView;
      if (view) { setView(view); return; }
      const action = event.target.closest("[data-egrdt-email-action]")?.dataset.egrdtEmailAction;
      if (action === "close") close();
      if (action === "copy-all") void copyReply(false);
      if (action === "copy-table") void copyReply(true);
      if (action === "mail") void openMail();
    });
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

  function metric(value, singular, plural) {
    return `<li><strong>${escapeHtml(value)}</strong> ${escapeHtml(value === 1 ? singular : plural)}</li>`;
  }

  /**
   * A prévia é a única parte do painel que muda de forma: o cabeçalho, a
   * mensagem e os botões continuam onde estão quando o operador troca de
   * leitura — inclusive o texto que ele já editou, que um render completo
   * apagaria.
   */
  function renderPreview() {
    const { panel } = ensurePanel();
    const reply = state.reply;
    const preview = panel.querySelector("#egrdt-email-preview");
    const paste = state.view === VIEWS.PASTE;
    preview.dataset.view = state.view;
    // A folha de papel do modo "Como será colado" é um invólucro próprio: o
    // afastamento precisa ficar dentro do conteúdo que rola, e não no quadro,
    // senão as linhas passam por trás do cabeçalho fixo na faixa do
    // preenchimento superior.
    preview.innerHTML = reply.rows.length
      ? (paste ? `<div class="egrdt-email-sheet">${reply.tableHtml}</div>` : readingTableHtml(reply))
      : `<p class="egrdt-email-empty">Esta eGRDT não tem arquivos registrados para montar a relação.</p>`;
    panel.querySelector("#egrdt-email-hint").textContent = paste
      ? "A tabela ocupa toda a largura da mensagem, terminando onde a frase acima dela termina; o texto que não cabe quebra dentro da célula, como o destinatário vai receber."
      : "Ajustada à tela para conferência — o e-mail continua recebendo a tabela do modo “Como será colado”.";
    panel.querySelectorAll("[data-egrdt-email-view]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.egrdtEmailView === state.view));
    });
  }

  function setView(view) {
    const next = view === VIEWS.READ ? VIEWS.READ : VIEWS.PASTE;
    if (next === state.view) return;
    state.view = next;
    if (state.reply) renderPreview();
  }

  function render() {
    const { panel } = ensurePanel();
    const reply = state.reply;
    const numbers = reply.summary.egrdtNumbers;
    panel.querySelector("#egrdt-email-title").textContent = numbers.length === 1 ? numbers[0] : "Documentos postados";
    panel.querySelector("#egrdt-email-subtitle").textContent = numbers.length > 1
      ? `${numbers.length} eGRDTs reunidas nesta resposta`
      : "Relação pronta para colar na resposta.";
    // Documentos, arquivos e linhas eram uma frase única com barras: os três
    // números viram selos, que é o que se lê de relance antes de copiar.
    panel.querySelector("#egrdt-email-metrics").innerHTML = [
      metric(reply.summary.documents, "documento", "documentos"),
      metric(reply.summary.files, "arquivo", "arquivos"),
      metric(reply.rows.length, "linha na tabela", "linhas na tabela"),
    ].join("");
    panel.querySelector("#egrdt-email-message").value = reply.message;
    panel.querySelector("#egrdt-email-count").textContent = `${reply.rows.length} linha(s) · ${reply.columns.length} colunas`;
    renderPreview();
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

  root.GrconEgrdtEmailReplyUi = { open, close };
})(typeof globalThis !== "undefined" ? globalThis : this);
