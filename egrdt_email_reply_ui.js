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

  const state = {
    records: [], reply: null, open: false, lastFocus: null, panel: null, view: VIEWS.READ,
    configuration: {}, savedConfiguration: {}, templateVersions: [], templateEpoch: 0,
    messageDirty: false, configurationDirty: false, sessionEpoch: 0, editorOpen: false, activeModel: null,
    savingModel: false,
  };

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
    const align = reply.template?.columnAlign || {};
    const cellAlignment = column => ["left", "center", "right"].includes(align[column])
      ? align[column] : (Reply.COLUMN_ALIGN?.[column] || "left");
    const labels = reply.template?.columnLabels || {};
    const header = reply.template?.showHeader !== false;
    const head = columns.map((column) =>
      '<th scope="col" data-column="' + escapeHtml(column) + '" style="text-align:' +
      escapeHtml(cellAlignment(column)) + '">' +
      escapeHtml(labels[column] || column) + '</th>').join("");
    const body = (reply.rows || []).map((row, index) => {
      const cells = columns.map((column) =>
        '<td data-column="' + escapeHtml(column) + '" style="text-align:' +
        escapeHtml(cellAlignment(column)) + '">' +
        escapeHtml(row[column]) + '</td>').join("");
      return '<tr><th scope="row">' + (index + 1) + '</th>' + cells + '</tr>';
    }).join("");
    return '<table class="egrdt-email-reading">' +
      (header ? '<thead><tr><th scope="col">Nº</th>' + head + '</tr></thead>' : '') +
      '<tbody>' + body + '</tbody></table>';
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
    <span>HISTÓRICO DE EGRDTS / RESPOSTA DE E-MAIL</span>
    <h2 id="egrdt-email-title">Resposta de e-mail</h2>
    <p id="egrdt-email-subtitle">Edite, confira e copie para a conversa original no Outlook.</p>
    <ul class="egrdt-email-metrics" id="egrdt-email-metrics"></ul>
  </div>
  <button aria-label="Fechar a resposta de e-mail" class="icon-button" data-egrdt-email-action="close" type="button">✕</button>
</header>
<div class="egrdt-email-body">
  <section class="egrdt-email-editor-pane" aria-label="Editar resposta">
    <div class="egrdt-email-section-heading"><strong>1. Editar mensagem</strong><small>Somente esta resposta</small></div>
    <label class="egrdt-email-message">
      <span>Texto da resposta</span>
      <textarea id="egrdt-email-message" rows="9" spellcheck="true" aria-describedby="egrdt-email-edit-status"></textarea>
    </label>
    <div class="egrdt-email-editor-tools">
      <small id="egrdt-email-edit-status" role="status">Modelo carregado</small>
      <button class="secondary-button compact" data-egrdt-email-action="reset-message" type="button">Restaurar texto padrão</button>
    </div>
    <details id="egrdt-email-quick-settings" class="egrdt-email-quick-settings">
      <summary>Personalizar aparência desta resposta</summary>
      <div class="egrdt-email-presets" role="group" aria-label="Estilo da tabela">
        <button type="button" data-egrdt-email-action="preset-standard">Padrão</button>
        <button type="button" data-egrdt-email-action="preset-compact">Compacto</button>
        <button type="button" data-egrdt-email-action="preset-readable">Leitura facilitada</button>
      </div>
      <div class="email-model-grid egrdt-email-personal-styles">
        <label>Fonte<select data-email-style="fontFamily"><option>Calibri</option><option>Segoe UI</option><option>Arial</option><option>Verdana</option></select></label>
        <label>Tamanho da tabela (pt)<input data-email-style="fontSize" type="number" min="8" max="24" step="0.5"></label>
        <label>Tamanho da mensagem (pt)<input data-email-style="messageFontSize" type="number" min="8" max="24" step="0.5"></label>
        <label>Espaço nas células<input data-email-style="padding" type="number" min="0" max="24"></label>
        <label>Espaço entre parágrafos<input data-email-style="paragraphSpacing" type="number" min="0" max="32"></label>
        <label>Entrelinhas<input data-email-style="lineHeight" type="number" min="1" max="2.5" step="0.05"></label>
        <label>Largura da tabela (%)<input data-email-style="tableWidth" type="number" min="20" max="100"></label>
        <label>Cor do texto<input data-email-style="bodyColor" type="color"></label>
        <label>Fundo do cabeçalho<input data-email-style="headerBackground" type="color"></label>
        <label>Cor do cabeçalho<input data-email-style="headerColor" type="color"></label>
        <label>Fundo da tabela<input data-email-style="bodyBackground" type="color"></label>
        <label>Cor das bordas<input data-email-style="borderColor" type="color"></label>
      </div>
      <p class="egrdt-email-settings-help">Marque as colunas que devem aparecer no e-mail. Os dados do histórico não são alterados.</p>
      <div class="egrdt-email-column-options" id="egrdt-email-column-options"></div>
    </details>
    <div class="egrdt-email-model-header">
      <button class="secondary-button compact" data-egrdt-email-action="edit-model" type="button" hidden>Editar modelo compartilhado</button>
      <small id="egrdt-email-model-status" role="status"></small>
    </div>
    <details id="egrdt-email-model-editor" hidden><summary>Configuração do modelo</summary><div id="egrdt-email-model-fields"></div></details>
  </section>
  <section class="egrdt-email-preview-pane" aria-label="Conferir resposta">
    <div class="egrdt-email-section-heading"><strong>2. Conferir resposta</strong><small id="egrdt-email-count">Nenhuma linha</small></div>
    <div class="egrdt-email-views" role="group" aria-label="Como exibir a relação">
      <button aria-pressed="false" class="egrdt-email-view" data-egrdt-email-view="paste" type="button">Visualização para Outlook</button>
      <button aria-pressed="true" class="egrdt-email-view" data-egrdt-email-view="read" type="button">Conferência</button>
    </div>
    <p class="egrdt-email-hint" id="egrdt-email-hint"></p>
    <div class="egrdt-email-preview" id="egrdt-email-preview" tabindex="0" role="region" aria-label="Prévia completa da resposta"></div>
  </section>
</div>
<footer class="egrdt-email-footer">
  <span class="egrdt-email-footer-note">No Outlook, cole com “Manter formatação de origem”. O GRCON não envia este e-mail.</span>
  <div class="egrdt-email-actions">
    <button class="secondary-button compact" data-egrdt-email-action="mail" type="button" title="Cria uma nova mensagem; não responde à conversa original">Criar novo e-mail</button>
    <button class="secondary-button compact" data-egrdt-email-action="copy-text" type="button">Copiar só texto</button>
    <button class="secondary-button compact" data-egrdt-email-action="copy-table" type="button">Copiar tabela</button>
    <button class="primary-button compact" data-egrdt-email-action="copy-all" type="button">Copiar resposta completa</button>
  </div>
</footer>
`;

    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    overlay.addEventListener("click", () => close());
    panel.addEventListener("click", (event) => {
      const view = event.target.closest("[data-egrdt-email-view]")?.dataset.egrdtEmailView;
      if (view) { setView(view); return; }
      const action = event.target.closest("[data-egrdt-email-action]")?.dataset.egrdtEmailAction;
      if (action === "edit-model") void openEditor();
      if (action === "save-model") void saveModel();
      if (action === "restore-model") void restoreModel();
      if (action === "preview-model") previewModel();
      if (action === "cancel-model") cancelEditor();
      if (action === "reset-message") resetMessage();
      if (action === "preset-standard") applyPreset("standard");
      if (action === "preset-compact") applyPreset("compact");
      if (action === "preset-readable") applyPreset("readable");
      if (action === "close") close();
      if (action === "copy-all") void copyReply(false);
      if (action === "copy-table") void copyReply(true);
      if (action === "copy-text") void copyText();
      if (action === "mail") void openMail();
    });
    panel.querySelector("#egrdt-email-message").addEventListener("input", () => {
      state.messageDirty = true;
      refreshReply({ messageOnly: true });
    });
    panel.querySelector("#egrdt-email-column-options").addEventListener("change", (event) => {
      const target = event.target;
      if (!target.matches("[data-email-column]")) return;
      const column = target.dataset.emailColumn;
      const selected = Reply.normalizeColumns(state.configuration.columns);
      if (!target.checked && selected.length === 1) {
        target.checked = true;
        notify("Mantenha pelo menos uma coluna visível.", "warning");
        return;
      }
      state.configuration = { ...state.configuration,
        columns: target.checked ? Reply.COLUMNS.filter(c => selected.includes(c) || c === column) :
          selected.filter(c => c !== column) };
      state.configurationDirty = true;
      state.view = VIEWS.PASTE;
      renderColumnOptions();
      refreshReply();
    });
    panel.querySelector(".egrdt-email-personal-styles").addEventListener("change", event => {
      const field = event.target;
      const key = field.dataset.emailStyle;
      if (!key || !field.checkValidity()) return;
      state.configuration = { ...state.configuration,
        styles: { ...(state.configuration.styles || {}), [key]: field.type === "number" ? Number(field.value) : field.value } };
      state.configurationDirty = true;
      state.view = VIEWS.PASTE;
      renderColumnOptions();
      refreshReply();
    });
    state.panel = { overlay, panel };
    return state.panel;
  }

  function currentMessage() {
    const field = document.getElementById("egrdt-email-message");
    return field ? field.value : (state.reply ? state.reply.message : "");
  }

  function currentReply() {
    return Reply.build(state.records, { ...state.configuration, message: currentMessage() });
  }

  function replyContext() {
    const membership = root.GrconCloud?.state?.membership;
    return { epoch: state.sessionEpoch, workspace: membership?.workspace_id, contract: membership?.contract_id };
  }

  function isCurrentContext(context) {
    const current = replyContext();
    return state.open && context.epoch === current.epoch &&
      context.workspace === current.workspace && context.contract === current.contract;
  }

  function metric(value, singular, plural) {
    return '<li><strong>' + escapeHtml(value) + '</strong> ' +
      escapeHtml(value === 1 ? singular : plural) + '</li>';
  }

  function refreshEditStatus() {
    const status = document.getElementById("egrdt-email-edit-status");
    if (status) status.textContent = state.messageDirty
      ? "Texto personalizado nesta resposta"
      : "Texto do modelo padrão · pode editar livremente";
  }

  function renderColumnOptions() {
    const columns = Reply.normalizeColumns(state.configuration.columns);
    const holder = document.getElementById("egrdt-email-column-options");
    if (!holder) return;
    holder.innerHTML = Reply.COLUMNS.map(column =>
      '<label><input type="checkbox" data-email-column="' + escapeHtml(column) +
      '" ' + (columns.includes(column) ? 'checked' : '') + '> ' +
      escapeHtml(state.configuration.columnLabels?.[column] || column) + '</label>').join("");
    const styles = state.configuration.styles || {};
    const defaults = { fontFamily: "Segoe UI", fontSize: 10, messageFontSize: styles.fontSize ?? 10.5,
      padding: 3, paragraphSpacing: 12, lineHeight: 1.3, tableWidth: 100,
      bodyColor: "#10222F", headerBackground: "#EAF1F6", headerColor: "#10222F", bodyBackground: "#FFFFFF", borderColor: "#9FB3C3" };
    document.querySelectorAll("[data-email-style]").forEach(field => {
      field.value = styles[field.dataset.emailStyle] ?? defaults[field.dataset.emailStyle];
    });
    const preset = styles.fontSize === 8 && styles.messageFontSize === 8 && styles.padding === 3 && styles.paragraphSpacing === 8 && styles.lineHeight === 1.15 ? "compact" :
      styles.fontSize === 12 && styles.messageFontSize === 12 && styles.padding === 9 && styles.paragraphSpacing === 16 && styles.lineHeight === 1.4 ? "readable" : "";
    document.querySelectorAll('.egrdt-email-presets button').forEach(button => {
      button.setAttribute("aria-pressed", String(Boolean(preset) && button.dataset.egrdtEmailAction === "preset-" + preset));
    });
  }

  function renderPreview() {
    const { panel } = ensurePanel();
    const reply = state.reply;
    const preview = panel.querySelector("#egrdt-email-preview");
    const position = { top: preview.scrollTop, left: preview.scrollLeft };
    const paste = state.view === VIEWS.PASTE;
    preview.dataset.view = state.view;
    const message = '<div class="egrdt-email-preview-message">' + reply.messageHtml + '</div>';
    preview.innerHTML = reply.rows.length
      ? (paste
        ? '<iframe id="egrdt-email-outlook-preview" title="Resposta formatada para Outlook" sandbox="allow-same-origin"></iframe>'
        : '<div class="egrdt-email-reading-sheet">' + message + readingTableHtml(reply) + '</div>')
      : '<p class="egrdt-email-empty">Esta eGRDT não tem arquivos registrados para montar a relação.</p>';
    const frame = preview.querySelector("iframe");
    if (frame) frame.srcdoc = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body style="margin:16px;background:#FFFFFF">' + reply.html + '</body></html>';
    preview.scrollTop = position.top;
    preview.scrollLeft = position.left;
    panel.querySelector("#egrdt-email-hint").textContent = paste
      ? "Esta é a formatação copiada: mensagem, tabela, fontes, cores e espaços. No Outlook, escolha Manter formatação de origem."
      : "Conferência com códigos legíveis e destaque da revisão. A cópia mantém o formato de Outlook.";
    panel.querySelectorAll("[data-egrdt-email-view]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.egrdtEmailView === state.view));
    });
    panel.querySelector("#egrdt-email-count").textContent =
      reply.rows.length + " linha(s) · " + reply.columns.length + " colunas";
  }

  function refreshReply(options = {}) {
    if (!state.records.length) return;
    state.reply = currentReply();
    if (options.messageOnly) {
      const target = document.getElementById("egrdt-email-outlook-preview")?.contentDocument?.querySelector("[data-grcon-email-message]") ||
        document.querySelector("#egrdt-email-preview .egrdt-email-preview-message");
      if (target) target.innerHTML = state.reply.messageHtml;
      else renderPreview();
    } else renderPreview();
    refreshEditStatus();
  }

  function setView(view) {
    const next = view === VIEWS.READ ? VIEWS.READ : VIEWS.PASTE;
    if (next === state.view) return;
    state.view = next;
    refreshReply();
  }

  function render() {
    const { panel } = ensurePanel();
    const reply = state.reply;
    const numbers = reply.summary.egrdtNumbers;
    panel.querySelector("#egrdt-email-title").textContent =
      numbers.length === 1 ? numbers[0] : "Documentos postados";
    panel.querySelector("#egrdt-email-subtitle").textContent = numbers.length > 1
      ? numbers.length + " eGRDTs reunidas nesta resposta"
      : "Edite, confira e copie para a conversa original no Outlook.";
    panel.querySelector("#egrdt-email-metrics").innerHTML = [
      metric(reply.summary.documents, "documento", "documentos"),
      metric(reply.summary.files, "arquivo", "arquivos"),
      metric(reply.rows.length, "linha", "linhas"),
    ].join("");
    // render() não escreve no textarea: reconstruções visuais nunca apagam o rascunho.
    renderColumnOptions();
    refreshEditStatus();
    renderPreview();
  }

  function resetMessage() {
    if (!state.records.length) return;
    const message = Reply.build(state.records, state.configuration).message;
    document.getElementById("egrdt-email-message").value = message;
    state.messageDirty = false;
    refreshReply({ messageOnly: true });
  }

  function applyPreset(preset) {
    if (!state.records.length) return;
    const styles = { ...(state.configuration.styles || {}) };
    if (preset === "standard") {
      state.configuration = { ...state.savedConfiguration, columns: state.configuration.columns };
    } else {
      styles.fontSize = preset === "compact" ? 8 : 12;
      styles.messageFontSize = styles.fontSize;
      styles.padding = preset === "compact" ? 3 : 9;
      styles.paragraphSpacing = preset === "compact" ? 8 : 16;
      styles.lineHeight = preset === "compact" ? 1.15 : 1.4;
      styles.tableWidth = 100;
      state.configuration = { ...state.configuration, styles };
    }
    state.configurationDirty = true;
    state.view = VIEWS.PASTE;
    renderColumnOptions();
    refreshReply();
  }

  function onKeydown(event) {
    if (event.key === "Escape") { event.stopPropagation(); close(); }
  }

  function open(records, options) {
    const list = (Array.isArray(records) ? records : [records]).filter(record => record && (record.files || []).length);
    if (!list.length) { notify("Esta eGRDT não tem arquivos registrados para montar a resposta.", "warning"); return false; }
    if (state.open && !close()) return false;
    const { overlay, panel } = ensurePanel();
    state.lastFocus = document.activeElement;
    state.records = list;
    state.view = VIEWS.READ;
    state.configuration = { ...(options || {}) };
    state.savedConfiguration = { ...(options || {}) };
    state.reply = Reply.build(list, state.configuration);
    state.messageDirty = false;
    state.configurationDirty = false;
    state.sessionEpoch++;
    state.editorOpen = false;
    const editor = document.getElementById("egrdt-email-model-editor");
    editor.hidden = true; editor.open = false;
    panel.querySelector("#egrdt-email-quick-settings").open = false;
    panel.querySelector("#egrdt-email-message").value = state.reply.message;
    overlay.hidden = false;
    panel.hidden = false;
    state.open = true;
    render();
    document.addEventListener("keydown", onKeydown, true);
    void loadTemplate();
    root.setTimeout(() => panel.querySelector("#egrdt-email-message")?.focus(), 0);
    return true;
  }

  function canEditModel() { return ["owner", "admin"].includes(root.GrconCloud?.state?.membership?.role); }
  async function loadTemplate() {
    const epoch = ++state.templateEpoch;
    const context = replyContext();
    const before = currentMessage();
    const editor = document.getElementById("egrdt-email-model-editor");
    if (!state.editorOpen) { editor.hidden = true; editor.open = false; }
    document.querySelector('[data-egrdt-email-action="edit-model"]').hidden = !canEditModel();
    try {
      const model = await root.GrconCloud?.emailTemplateGet?.();
      if (epoch !== state.templateEpoch || !isCurrentContext(context)) return;
      const edited = state.messageDirty || currentMessage() !== before;
      state.activeModel = model;
      state.savedConfiguration = { ...(model?.configuration || {}) };
      if (!state.configurationDirty) state.configuration = { ...state.savedConfiguration };
      if (!edited) {
        const defaultReply = Reply.build(state.records, state.configuration);
        document.getElementById("egrdt-email-message").value = defaultReply.message;
      }
      refreshReply();
      renderColumnOptions();
      document.getElementById("egrdt-email-model-status").textContent = model ? "Modelo " + (model.scope === "global" ? "global" : "do contrato") + " · versão " + model.version : "Modelo padrão do GRCON";
    } catch (error) {
      if (epoch === state.templateEpoch && isCurrentContext(context))
        notify(error.message || "Não foi possível carregar o modelo compartilhado.", "warning");
    }
  }
  async function openEditor() {
    if (!canEditModel()) return;
    const context = replyContext();
    const target = document.getElementById("egrdt-email-model-fields");
    const cfg = state.configuration;
    const styles = cfg.styles || {};
    const currentColumns = Reply.normalizeColumns(cfg.columns);
    const ordered = currentColumns.concat(Reply.COLUMNS.filter(c => !currentColumns.includes(c)));
    const input = (label, key, type, value, attrs = "") => '<label>' + label + '<input data-model-style="' + key + '" type="' + type + '" value="' + escapeHtml(value) + '" ' + attrs + '></label>';
    target.innerHTML = '<label>Mensagem padrão<textarea id="email-model-message" rows="5">' + escapeHtml(cfg.messageTemplate || "Prezado(a),\n\nInformamos que os documentos abaixo foram postados por meio das eGRDTs {{egrdts}} em {{data}}.\n\nSolicitamos consultar a Consulta Geral para verificar a efetivação da postagem.") + '</textarea></label><small>Campos disponíveis: {{egrdt}}, {{egrdts}}, {{data}}, {{documentos}}, {{arquivos}}.</small>' +
      '<div class="email-model-grid"><label>Fonte<select data-model-style="fontFamily">' + ["Segoe UI", "Calibri", "Arial", "Verdana"].map(font => '<option ' + (font === styles.fontFamily ? "selected" : "") + '>' + font + '</option>').join("") + '</select></label>' +
      input("Tamanho (pt)", "fontSize", "number", styles.fontSize ?? 10, 'min="8" max="24"') + input("Tamanho da mensagem (pt)", "messageFontSize", "number", styles.messageFontSize ?? styles.fontSize ?? 10.5, 'min="8" max="24" step="0.5"') + input("Entrelinhas", "lineHeight", "number", styles.lineHeight ?? 1.3, 'min="1" max="2.5" step="0.05"') + input("Espaço entre parágrafos", "paragraphSpacing", "number", styles.paragraphSpacing ?? 12, 'min="0" max="32"') + input("Largura da tabela (%)", "tableWidth", "number", styles.tableWidth ?? 100, 'min="20" max="100"') + input("Espaçamento (px)", "padding", "number", styles.padding ?? 3, 'min="0" max="24"') + input("Borda (px)", "borderWidth", "number", styles.borderWidth ?? 1, 'min="0" max="4"') +
      input("Cor da borda", "borderColor", "color", styles.borderColor || "#9FB3C3") + input("Fundo do cabeçalho", "headerBackground", "color", styles.headerBackground || "#EAF1F6") + input("Texto do cabeçalho", "headerColor", "color", styles.headerColor || "#10222F") + input("Texto da tabela", "bodyColor", "color", styles.bodyColor || "#10222F") + input("Fundo da tabela", "bodyBackground", "color", styles.bodyBackground || "#FFFFFF") + '</div>' +
      '<label><input id="email-model-show-header" type="checkbox" ' + (cfg.showHeader === false ? "" : "checked") + '> Exibir cabeçalho</label>' +
      '<div class="email-model-columns">' + ordered.map((column, index) => '<div data-model-column="' + escapeHtml(column) + '"><label><input type="checkbox" data-model-visible ' + (currentColumns.includes(column) ? "checked" : "") + '>' + escapeHtml(column) + '</label><input aria-label="Nome da coluna" data-model-label value="' + escapeHtml(cfg.columnLabels?.[column] || column) + '"><input aria-label="Ordem da coluna" data-model-order type="number" min="1" max="8" value="' + (index + 1) + '"><input aria-label="Largura relativa da coluna" data-model-width type="number" min="1" max="1000" value="' + (cfg.columnWidths?.[column] || Reply.COLUMN_WIDTHS[column]) + '"><select aria-label="Alinhamento da coluna" data-model-align>' + ["left", "center", "right"].map(a => '<option value="' + a + '" ' + (a === (cfg.columnAlign?.[column] || Reply.COLUMN_ALIGN[column] || "left") ? "selected" : "") + '>' + ({left:"Esquerda",center:"Centro",right:"Direita"}[a]) + '</option>').join("") + '</select></div>').join("") + '</div>' +
      '<label>Salvar para<select id="email-model-scope"><option value="contract">Este contrato</option>' + (root.GrconCloud?.state?.membership?.role === "owner" ? '<option value="global">Todos os contratos (modelo global)</option>' : "") + '</select></label>' +
      '<div class="egrdt-email-actions"><button type="button" data-egrdt-email-action="preview-model">Aplicar na prévia</button><button type="button" data-egrdt-email-action="save-model">Salvar modelo compartilhado</button><button type="button" data-egrdt-email-action="cancel-model">Cancelar edição do modelo</button></div><label>Versões anteriores<select id="email-model-version"></select></label><button type="button" data-egrdt-email-action="restore-model">Restaurar versão</button>';
    const editor = document.getElementById("egrdt-email-model-editor"); editor.hidden = false; editor.open = true;
    state.editorOpen = true;
    try {
      const versions = await root.GrconCloud.emailTemplateVersions();
      if (!isCurrentContext(context) || !state.editorOpen) return;
      state.templateVersions = versions;
      document.getElementById("email-model-version").innerHTML = state.templateVersions.map(v => '<option value="' + escapeHtml(v.template_id) + '">' + escapeHtml(v.scope) + ' · v' + v.version + (v.active ? " · atual" : "") + '</option>').join("");
    } catch (error) { if (isCurrentContext(context)) notify(error.message, "error"); }
  }
  function editorConfiguration() {
    const cfg = { styles: {}, columns: [], columnLabels: {}, columnWidths: {}, columnAlign: {}, messageTemplate: document.getElementById("email-model-message").value, showHeader: document.getElementById("email-model-show-header").checked };
    document.querySelectorAll('[data-model-style]').forEach(el => { cfg.styles[el.dataset.modelStyle] = el.type === "number" ? Number(el.value) : el.value; });
    const columns = Array.from(document.querySelectorAll('[data-model-column]')).sort((a,b) => Number(a.querySelector('[data-model-order]').value) - Number(b.querySelector('[data-model-order]').value));
    columns.forEach(el => { const c = el.dataset.modelColumn; if (el.querySelector('[data-model-visible]').checked) cfg.columns.push(c); cfg.columnLabels[c] = el.querySelector('[data-model-label]').value; cfg.columnWidths[c] = Number(el.querySelector('[data-model-width]').value); cfg.columnAlign[c] = el.querySelector('[data-model-align]').value; });
    if (!cfg.columns.length) throw new Error("Mantenha pelo menos uma coluna visível.");
    return cfg;
  }
  function previewModel() {
    try {
      state.configuration = editorConfiguration();
      state.configurationDirty = true;
      state.view = VIEWS.PASTE;
      if (!state.messageDirty) {
        document.getElementById("egrdt-email-message").value =
          Reply.build(state.records, state.configuration).message;
      }
      refreshReply();
      renderColumnOptions();
    } catch (error) { notify(error.message, "warning"); }
  }

  function cancelEditor() {
    state.configuration = { ...state.savedConfiguration };
    state.configurationDirty = false;
    if (!state.messageDirty) {
      document.getElementById("egrdt-email-message").value =
        Reply.build(state.records, state.configuration).message;
    }
    state.editorOpen = false;
    const editor = document.getElementById("egrdt-email-model-editor");
    editor.open = false; editor.hidden = true;
    refreshReply();
    renderColumnOptions();
  }

  async function saveModel() {
    if (!canEditModel() || state.savingModel) return;
    const context = replyContext();
    state.savingModel = true;
    const button = document.querySelector('[data-egrdt-email-action="save-model"]');
    if (button) { button.disabled = true; button.textContent = "Salvando..."; }
    try {
      const cfg = editorConfiguration();
      await root.GrconCloud.emailTemplateSave(document.getElementById("email-model-scope").value, cfg);
      if (!isCurrentContext(context)) return;
      state.savedConfiguration = { ...cfg };
      state.configuration = { ...cfg };
      state.configurationDirty = false;
      state.editorOpen = false;
      const editor = document.getElementById("egrdt-email-model-editor");
      editor.open = false; editor.hidden = true;
      if (!state.messageDirty) {
        document.getElementById("egrdt-email-message").value = Reply.build(state.records, cfg).message;
      }
      refreshReply();
      renderColumnOptions();
      notify("Modelo salvo com uma nova versão.", "success");
      await loadTemplate();
    } catch (error) {
      if (isCurrentContext(context)) notify(error.message || "Não foi possível salvar o modelo.", "error");
    }
    finally {
      state.savingModel = false;
      if (button) { button.disabled = false; button.textContent = "Salvar modelo compartilhado"; }
    }
  }

  async function restoreModel() {
    if (!canEditModel()) return;
    const id = document.getElementById("email-model-version")?.value;
    if (!id || !root.confirm("Restaurar esta versão do modelo compartilhado?")) return;
    const context = replyContext();
    try {
      await root.GrconCloud.emailTemplateRestore(id);
      if (!isCurrentContext(context)) return;
      state.configurationDirty = false;
      state.editorOpen = false;
      const editor = document.getElementById("egrdt-email-model-editor");
      editor.hidden = true; editor.open = false;
      await loadTemplate();
      notify("Modelo restaurado em uma nova versão.", "success");
    } catch (error) {
      if (isCurrentContext(context)) notify(error.message || "Não foi possível restaurar o modelo.", "error");
    }
  }

  function close(force = false) {
    if (!state.open || !state.panel) return true;
    if (!force && (state.messageDirty || state.editorOpen) &&
      typeof root.confirm === "function" &&
      !root.confirm("Descartar as alterações desta resposta?")) return false;
    state.panel.overlay.hidden = true;
    state.panel.panel.hidden = true;
    state.open = false;
    state.sessionEpoch++;
    state.templateEpoch++;
    document.removeEventListener("keydown", onKeydown, true);
    if (state.lastFocus && typeof state.lastFocus.focus === "function") state.lastFocus.focus();
    state.lastFocus = null;
    state.messageDirty = false;
    state.editorOpen = false;
    return true;
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
        return { ok: true, rich: true };
      }
    } catch (error) {
      console.debug("[EmailReply] área de transferência rica indisponível:", error);
    }
    if (copyBySelection(html, plain)) return { ok: true, rich: true };
    try {
      await navigator.clipboard.writeText(plain);
      return { ok: true, rich: false };
    } catch (error) {
      console.warn("GRCON: não foi possível copiar a resposta de e-mail.", error);
      return { ok: false, rich: false };
    }
  }

  // Navegadores antigos e contextos sem permissão de escrita continuam
  // copiando pela seleção, que preserva a tabela no formato rico.
  function copyBySelection(html, plain) {
    const holder = document.createElement("div");
    holder.setAttribute("contenteditable", "true");
    holder.style.cssText = "position:fixed;left:-10000px;top:0;opacity:0";
    holder.innerHTML = html;
    document.body.appendChild(holder);
    const selection = typeof root.getSelection === "function" ? root.getSelection() : null;
    if (!selection) { holder.remove(); return false; }
    const range = document.createRange();
    const previousRanges = Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange());
    const active = document.activeElement;
    range.selectNodeContents(holder);
    selection.removeAllRanges();
    selection.addRange(range);
    let copied = false;
    const onCopy = event => {
      if (!event.clipboardData) return;
      event.clipboardData.setData("text/html", html);
      event.clipboardData.setData("text/plain", plain);
      event.preventDefault();
      copied = true;
    };
    document.addEventListener("copy", onCopy);
    try { copied = document.execCommand("copy") && copied; } catch (error) { console.debug("[EmailReply] execCommand indisponível:", error); }
    document.removeEventListener("copy", onCopy);
    selection.removeAllRanges();
    previousRanges.forEach(previous => selection.addRange(previous));
    holder.remove();
    active?.focus({ preventScroll: true });
    return copied;
  }

  async function copyText() {
    const copied = await writeClipboard(currentReply().messageHtml, currentMessage());
    notify(copied.ok ? "Texto copiado." : "Não foi possível copiar o texto.", copied.ok ? "success" : "error");
  }

  async function copyReply(tableOnly) {
    if (!state.records.length) return;
    const reply = currentReply();
    const copied = tableOnly
      ? await writeClipboard(reply.tableHtml, reply.tableText)
      : await writeClipboard(reply.html, reply.text);
    notify(
      copied.ok
        ? (copied.rich
          ? (tableOnly ? "Tabela formatada copiada. No Outlook, mantenha a formatação de origem." : "Resposta formatada copiada. No Outlook, mantenha a formatação de origem.")
          : "O navegador copiou somente texto, sem a formatação. Permita a cópia formatada e tente novamente.")
        : "Não foi possível copiar automaticamente. Selecione o texto do painel e use Ctrl+C.",
      copied.ok ? (copied.rich ? "success" : "warning") : "error",
    );
  }

  async function openMail() {
    if (!state.records.length) return;
    const reply = currentReply();
    const copied = await writeClipboard(reply.html, reply.text);
    const link = Reply.mailtoUrl(reply);
    root.location.href = link.url;
    notify("Uma nova mensagem será aberta; para responder à conversa original, use Copiar resposta completa.", "info");
    if (link.truncated) notify("A relação é grande para o link do e-mail: ela ficou na área de transferência, use Ctrl+V no corpo da mensagem.", "warning");
    else if (!copied.ok || !copied.rich) notify("O novo e-mail usa texto simples. Para preservar o formato na conversa original, use Copiar resposta completa e Manter formatação de origem.", "warning");
  }

  root.addEventListener("grcon:contract-context-changed", () => close(true));
  root.GrconEgrdtEmailReplyUi = { open, close };
})(typeof globalThis !== "undefined" ? globalThis : this);
