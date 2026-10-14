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

  const state = { records: [], reply: null, open: false, lastFocus: null, panel: null, view: VIEWS.READ, configuration: {}, templateVersions: [], templateEpoch: 0, messageDirty: false, editorDirty: false, editorMode: "local", editorOriginal: null, previewTimer: null, copiedSignature: null };

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
    const align = { ...(Reply.COLUMN_ALIGN || {}), ...(reply.template?.columnAlign || {}) };
    const labels = reply.template?.columnLabels || {};
    const head = columns.map(column => '<th scope="col" data-email-column="' + escapeHtml(column) + '" style="text-align:' + escapeHtml(align[column] || "left") + '">' + escapeHtml(labels[column] || column) + '</th>').join("");
    const body = (reply.rows || []).map((row, index) => {
      const cells = columns.map(column => '<td data-email-column="' + escapeHtml(column) + '" style="text-align:' + escapeHtml(align[column] || "left") + '">' + escapeHtml(row[column]) + '</td>').join("");
      return '<tr><th scope="row">' + (index + 1) + '</th>' + cells + '</tr>';
    }).join("");
    const tableHead = reply.template?.showHeader === false ? "" : '<thead><tr><th scope="col"><span class="sr-only">Linha</span></th>' + head + '</tr></thead>';
    return '<table class="egrdt-email-reading">' + tableHead + '<tbody>' + body + '</tbody></table>';
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
        <div class="egrdt-email-workspace">
          <section class="egrdt-email-compose" aria-label="Editar resposta">
        <div class="egrdt-email-compose-heading"><strong>Editar resposta</strong><small>Personalize o texto desta eGRDT sem alterar o modelo compartilhado.</small></div>
        <label class="egrdt-email-message">
          <span>Texto da mensagem</span>
          <textarea id="egrdt-email-message" rows="8" spellcheck="true"></textarea>
        </label>
        <div class="egrdt-email-compose-actions"><button class="secondary-button compact" data-egrdt-email-action="reset-message" type="button">Restaurar texto padrão</button><button class="secondary-button compact" data-egrdt-email-action="edit-table" type="button">Personalizar tabela</button><button class="secondary-button compact" data-egrdt-email-action="edit-model" type="button" hidden>Editar modelo compartilhado</button></div>
        <small id="egrdt-email-model-status"></small>
        <details id="egrdt-email-model-editor" hidden><summary>Configurações da tabela</summary><div id="egrdt-email-model-fields"></div></details>
          </section>
          <section class="egrdt-email-review" aria-label="Visualização da resposta">
        <div class="egrdt-email-preview-heading">
          <div class="egrdt-email-preview-label">
            <strong>Prévia completa da resposta</strong>
            <small id="egrdt-email-count">Nenhuma linha</small>
          </div>
          <button class="secondary-button compact egrdt-email-expand" data-egrdt-email-action="expand-preview" type="button" aria-pressed="false">Expandir prévia</button>
          <div class="egrdt-email-views" role="group" aria-label="Como exibir a relação">
            <button aria-pressed="false" class="egrdt-email-view" data-egrdt-email-view="paste" type="button">Visualização para Outlook</button>
            <button aria-pressed="true" class="egrdt-email-view" data-egrdt-email-view="read" type="button">Conferência</button>
          </div>
        </div>
        <p class="egrdt-email-hint" id="egrdt-email-hint"></p>
        <div class="egrdt-email-preview" id="egrdt-email-preview" tabindex="0" role="region" aria-label="Prévia completa da resposta de e-mail"></div>
          </section>
        </div>
      </div>
      <footer class="egrdt-email-footer">
        <small id="egrdt-email-feedback" role="status" aria-live="polite"></small>
        <div class="egrdt-email-actions">
          <button class="secondary-button compact" data-egrdt-email-action="mail" type="button" title="Abre uma nova mensagem; não responde à conversa original">Novo e-mail</button>
          <button class="secondary-button compact" data-egrdt-email-action="copy-message" type="button">Copiar só o texto</button>
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
      if (action === "edit-model") void openEditor("shared");
      if (action === "edit-table") void openEditor("local");
      if (action === "reset-message") restoreMessage();
      if (action === "expand-preview") togglePreviewSize();
      if (action === "cancel-settings") cancelEditor();
      if (action === "apply-settings") applyEditor();
      if (action === "save-model") void saveModel();
      if (action === "restore-model") void restoreModel();
      if (action === "preview-model") previewModel();
      if (action === "close") close();
      if (action === "copy-all") void copyReply("all");
      if (action === "copy-table") void copyReply("table");
      if (action === "copy-message") void copyReply("message");
      if (action === "mail") void openMail();
    });
    panel.addEventListener("input", handleEditorInput);
    panel.addEventListener("change", handleEditorInput);
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

  function showFeedback(message) {
    const node = state.panel?.panel.querySelector("#egrdt-email-feedback");
    if (node) node.textContent = message;
  }

  function updateChanges() {
    if (state.editorDirty) showFeedback("Ajustes da tabela ainda não confirmados");
    else if (state.messageDirty) showFeedback("Texto personalizado para esta resposta");
    else showFeedback("");
  }

  function handleEditorInput(event) {
    const target = event.target;
    if (!state.open || !target) return;
    if (target.id === "egrdt-email-message") {
      state.messageDirty = true;
      root.clearTimeout(state.previewTimer);
      state.previewTimer = root.setTimeout(renderPreview, 90);
      updateChanges();
      return;
    }
    if (target.id === "email-layout-preset") {
      applyPreset(target.value);
      return;
    }
    if (!target.closest("#egrdt-email-model-fields")) return;
    state.editorDirty = true;
    updateChanges();
    root.clearTimeout(state.previewTimer);
    state.previewTimer = root.setTimeout(() => previewModel(true), 160);
  }

  function replySignature() {
    return JSON.stringify({ message: currentMessage(), configuration: state.configuration });
  }

  function togglePreviewSize() {
    const work = state.panel?.panel.querySelector(".egrdt-email-workspace");
    const button = state.panel?.panel.querySelector('[data-egrdt-email-action="expand-preview"]');
    if (!work || !button) return;
    const expanded = work.dataset.expanded !== "true";
    work.dataset.expanded = String(expanded);
    button.setAttribute("aria-pressed", String(expanded));
    button.textContent = expanded ? "Voltar à edição" : "Expandir prévia";
  }

  function restoreMessage() {
    if (!state.records.length) return;
    state.messageDirty = false;
    state.reply = Reply.build(state.records, state.configuration);
    render();
    updateChanges();
  }

  function applyPreset(preset) {
    const options = preset === "compact" ? { fontSize: 9, padding: 3, borderWidth: 1 }
      : preset === "reading" ? { fontSize: 11, padding: 9, borderWidth: 1 }
      : { fontSize: 10, padding: 6, borderWidth: 1 };
    Object.entries(options).forEach(([key, value]) => {
      const input = state.panel?.panel.querySelector('[data-model-style="' + key + '"]');
      if (input) input.value = value;
    });
    state.editorDirty = true;
    updateChanges();
    previewModel(true);
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
    const reply = currentReply();
    const preview = panel.querySelector("#egrdt-email-preview");
    const paste = state.view === VIEWS.PASTE;
    preview.dataset.view = state.view;
    // A folha de papel do modo "Como será colado" é um invólucro próprio: o
    // afastamento precisa ficar dentro do conteúdo que rola, e não no quadro,
    // senão as linhas passam por trás do cabeçalho fixo na faixa do
    // preenchimento superior.
    preview.innerHTML = reply.rows.length
      ? (paste ? `<div class="egrdt-email-sheet">${reply.html}</div>` : `<div class="egrdt-email-reading-message">${Reply.messageHtml(reply.message)}</div>${readingTableHtml(reply)}`)
      : `<p class="egrdt-email-empty">Esta eGRDT não tem arquivos registrados para montar a relação.</p>`;
    panel.querySelector("#egrdt-email-hint").textContent = paste
      ? "Mostra o HTML efetivamente copiado, com texto e tabela. O Outlook pode ajustar fontes e larguras conforme o cliente."
      : "Texto e tabela para conferência rápida. A cópia continua usando a formatação do modo Outlook.";
    panel.querySelector("#egrdt-email-count").textContent = `${reply.rows.length} linha(s) · ${reply.columns.length} colunas`;
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

  function render(options = {}) {
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
    if (!options.preserveMessage) panel.querySelector("#egrdt-email-message").value = reply.message;
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
    state.configuration = options || {};
    state.copiedSignature = null;
    const expanded = panel.querySelector(".egrdt-email-workspace");
    if (expanded) expanded.dataset.expanded = "false";
    const expandButton = panel.querySelector('[data-egrdt-email-action="expand-preview"]');
    if (expandButton) { expandButton.setAttribute("aria-pressed", "false"); expandButton.textContent = "Expandir prévia"; }
    state.messageDirty = false;
    state.editorDirty = false;
    state.editorOriginal = null;
    state.view = VIEWS.READ;
    state.reply = Reply.build(list, state.configuration);
    render();
    void loadTemplate();
    overlay.hidden = false;
    panel.hidden = false;
    state.open = true;
    state.lastFocus = document.activeElement;
    document.addEventListener("keydown", onKeydown, true);
    root.setTimeout(() => panel.querySelector("#egrdt-email-message")?.focus(), 0);
    return true;
  }

  function canEditModel() { return ["owner", "admin"].includes(root.GrconCloud?.state?.membership?.role); }
  async function loadTemplate() {
    const epoch = ++state.templateEpoch;
    const workspace = root.GrconCloud?.state?.membership?.workspace_id;
    const editor = document.getElementById("egrdt-email-model-editor");
    editor.hidden = true; editor.open = false;
    document.querySelector('[data-egrdt-email-action="edit-model"]').hidden = !canEditModel();
    try {
      const model = await root.GrconCloud?.emailTemplateGet?.();
      if (epoch !== state.templateEpoch || !state.open || workspace !== root.GrconCloud?.state?.membership?.workspace_id || state.editorDirty) return;
      const editedText = state.messageDirty ? currentMessage() : null;
      state.configuration = model?.configuration || {};
      state.reply = Reply.build(state.records, { ...state.configuration, ...(state.messageDirty ? { message: editedText } : {}) });
      render({ preserveMessage: state.messageDirty });
      updateChanges();
      document.getElementById("egrdt-email-model-status").textContent = model ? "Modelo " + (model.scope === "global" ? "global" : "do contrato") + " · versão " + model.version : "Modelo padrão do GRCON";
    } catch (error) { notify(error.message || "Não foi possível carregar o modelo compartilhado.", "warning"); }
  }
  async function openEditor(mode = "local") {
    if (mode === "shared" && !canEditModel()) return;
    if (!state.records.length) return;
    state.editorMode = mode;
    state.editorDirty = false;
    state.editorOriginal = JSON.parse(JSON.stringify(state.configuration));
    const target = document.getElementById("egrdt-email-model-fields");
    const cfg = state.configuration;
    const styles = cfg.styles || {};
    const currentColumns = Reply.normalizeColumns(cfg.columns);
    const ordered = currentColumns.concat(Reply.COLUMNS.filter(c => !currentColumns.includes(c)));
    const input = (label, key, type, value, attrs = "") => '<label>' + label + '<input data-model-style="' + key + '" type="' + type + '" value="' + escapeHtml(value) + '" ' + attrs + '></label>';
    target.innerHTML = '<label>Mensagem padrão<textarea id="email-model-message" rows="5">' + escapeHtml(cfg.messageTemplate || "Prezado(a),\n\nInformamos que os documentos abaixo foram postados por meio das eGRDTs {{egrdts}} em {{data}}.\n\nSolicitamos consultar a Consulta Geral para verificar a efetivação da postagem.") + '</textarea></label><small>Campos disponíveis: {{egrdt}}, {{egrdts}}, {{data}}, {{documentos}}, {{arquivos}}.</small>' +
      '<div class="email-model-grid"><label>Fonte<select data-model-style="fontFamily">' + ["Segoe UI", "Calibri", "Arial", "Verdana"].map(font => '<option ' + (font === styles.fontFamily ? "selected" : "") + '>' + font + '</option>').join("") + '</select></label>' +
      input("Tamanho (pt)", "fontSize", "number", styles.fontSize ?? 10, 'min="8" max="24"') + input("Largura da tabela (%)", "tableWidth", "number", styles.tableWidth ?? 100, 'min="20" max="100"') + input("Espaçamento (px)", "padding", "number", styles.padding ?? 6, 'min="0" max="24"') + input("Borda (px)", "borderWidth", "number", styles.borderWidth ?? 1, 'min="0" max="4"') +
      input("Cor da borda", "borderColor", "color", styles.borderColor || "#9FB3C3") + input("Fundo do cabeçalho", "headerBackground", "color", styles.headerBackground || "#EAF1F6") + input("Texto do cabeçalho", "headerColor", "color", styles.headerColor || "#10222F") + input("Texto da tabela", "bodyColor", "color", styles.bodyColor || "#10222F") + input("Fundo da tabela", "bodyBackground", "color", styles.bodyBackground || "#FFFFFF") + '</div>' +
      '<label><input id="email-model-show-header" type="checkbox" ' + (cfg.showHeader === false ? "" : "checked") + '> Exibir cabeçalho</label>' +
      '<div class="email-model-columns">' + ordered.map((column, index) => '<div data-model-column="' + escapeHtml(column) + '"><label><input type="checkbox" data-model-visible ' + (currentColumns.includes(column) ? "checked" : "") + '>' + escapeHtml(column) + '</label><input aria-label="Nome da coluna" data-model-label value="' + escapeHtml(cfg.columnLabels?.[column] || column) + '"><input aria-label="Ordem da coluna" data-model-order type="number" min="1" max="8" value="' + (index + 1) + '"><input aria-label="Largura relativa da coluna" data-model-width type="number" min="1" max="1000" value="' + (cfg.columnWidths?.[column] || Reply.COLUMN_WIDTHS[column]) + '"><select aria-label="Alinhamento da coluna" data-model-align>' + ["left", "center", "right"].map(a => '<option value="' + a + '" ' + (a === (cfg.columnAlign?.[column] || Reply.COLUMN_ALIGN[column] || "left") ? "selected" : "") + '>' + ({left:"Esquerda",center:"Centro",right:"Direita"}[a]) + '</option>').join("") + '</select></div>').join("") + '</div>' +
      '<label>Salvar para<select id="email-model-scope"><option value="contract">Este contrato</option>' + (root.GrconCloud?.state?.membership?.role === "owner" ? '<option value="global">Todos os contratos (modelo global)</option>' : "") + '</select></label>' +
      '<div class="egrdt-email-actions"><button type="button" data-egrdt-email-action="preview-model">Atualizar prévia</button><button type="button" data-egrdt-email-action="save-model">Salvar modelo compartilhado</button></div><label>Versões anteriores<select id="email-model-version"></select></label><button type="button" data-egrdt-email-action="restore-model">Restaurar versão</button>';
    const editor = document.getElementById("egrdt-email-model-editor");
    const shared = mode === "shared";
    editor.hidden = false;
    editor.open = true;
    editor.querySelector("summary").textContent = shared ? "Editar modelo compartilhado" : "Ajustar apenas esta resposta";
    target.insertAdjacentHTML("afterbegin", '<label class="email-layout-preset">Visual rápido<select id="email-layout-preset"><option value="custom">Configuração atual</option><option value="standard">Padrão GRCON</option><option value="compact">Compacto</option><option value="reading">Leitura facilitada</option></select></label>');
    target.insertAdjacentHTML("beforeend", '<div class="egrdt-email-editor-actions"><button type="button" class="secondary-button compact" data-egrdt-email-action="cancel-settings">Cancelar ajustes</button><button type="button" class="primary-button compact" data-egrdt-email-action="apply-settings">Concluir ajustes</button></div>');
    const scope = target.querySelector("#email-model-scope")?.closest("label");
    const save = target.querySelector('[data-egrdt-email-action="save-model"]');
    const versions = target.querySelector("#email-model-version")?.closest("label");
    const restore = target.querySelector('[data-egrdt-email-action="restore-model"]');
    if (scope) scope.hidden = !shared;
    if (save) save.hidden = !shared;
    if (versions) versions.hidden = !shared;
    if (restore) restore.hidden = !shared;
    if (!shared) return;
    try {
      state.templateVersions = await root.GrconCloud.emailTemplateVersions();
      if (!state.open || state.editorMode !== mode) return;
      document.getElementById("email-model-version").innerHTML = state.templateVersions.map(v => '<option value="' + escapeHtml(v.template_id) + '">' + escapeHtml(v.scope) + ' · v' + v.version + (v.active ? " · atual" : "") + '</option>').join("");
    } catch (error) { notify(error.message || "Não foi possível carregar as versões.", "error"); }
  }
  function editorConfiguration() {
    const cfg = { styles: {}, columns: [], columnLabels: {}, columnWidths: {}, columnAlign: {}, messageTemplate: document.getElementById("email-model-message").value, showHeader: document.getElementById("email-model-show-header").checked };
    document.querySelectorAll('[data-model-style]').forEach(el => { cfg.styles[el.dataset.modelStyle] = el.type === "number" ? Number(el.value) : el.value; });
    const columns = Array.from(document.querySelectorAll('[data-model-column]')).sort((a,b) => Number(a.querySelector('[data-model-order]').value) - Number(b.querySelector('[data-model-order]').value));
    columns.forEach(el => { const c = el.dataset.modelColumn; if (el.querySelector('[data-model-visible]').checked) cfg.columns.push(c); cfg.columnLabels[c] = el.querySelector('[data-model-label]').value; cfg.columnWidths[c] = Number(el.querySelector('[data-model-width]').value); cfg.columnAlign[c] = el.querySelector('[data-model-align]').value; });
    if (!cfg.columns.length) throw new Error("Mantenha pelo menos uma coluna visível.");
    return cfg;
  }
  function previewModel(silent = false) {
    try {
      state.configuration = editorConfiguration();
      state.reply = Reply.build(state.records, { ...state.configuration, ...(state.messageDirty ? { message: currentMessage() } : {}) });
      render({ preserveMessage: state.messageDirty });
    } catch (error) {
      if (!silent) notify(error.message || "Configuração inválida.", "warning");
    }
  }
  function applyEditor() {
    try {
      previewModel();
      editorConfiguration();
      state.editorDirty = false;
      state.editorOriginal = null;
      const editor = document.getElementById("egrdt-email-model-editor");
      editor.hidden = true;
      editor.open = false;
      updateChanges();
    } catch (error) { notify(error.message || "Revise as configurações.", "warning"); }
  }
  function cancelEditor() {
    root.clearTimeout(state.previewTimer);
    if (state.editorOriginal) state.configuration = state.editorOriginal;
    state.editorOriginal = null;
    state.editorDirty = false;
    state.reply = Reply.build(state.records, { ...state.configuration, ...(state.messageDirty ? { message: currentMessage() } : {}) });
    render({ preserveMessage: state.messageDirty });
    const editor = document.getElementById("egrdt-email-model-editor");
    editor.hidden = true;
    editor.open = false;
    updateChanges();
  }
  async function saveModel() {
    if (!canEditModel()) return;
    try {
      const cfg = editorConfiguration();
      await root.GrconCloud.emailTemplateSave(document.getElementById("email-model-scope").value, cfg);
      state.configuration = cfg;
      state.editorOriginal = null;
      state.editorDirty = false;
      state.reply = Reply.build(state.records, { ...cfg, ...(state.messageDirty ? { message: currentMessage() } : {}) });
      render({ preserveMessage: state.messageDirty });
      const editor = document.getElementById("egrdt-email-model-editor");
      editor.hidden = true; editor.open = false;
      notify("Modelo salvo com uma nova versão.", "success");
      await loadTemplate();
    } catch (error) { notify(error.message || "Não foi possível salvar o modelo.", "error"); }
  }
  async function restoreModel() {
    if (!canEditModel()) return;
    const id = document.getElementById("email-model-version")?.value;
    if (!id) return;
    try {
      await root.GrconCloud.emailTemplateRestore(id);
      state.editorDirty = false;
      state.editorOriginal = null;
      await loadTemplate();
      notify("Modelo restaurado em uma nova versão.", "success");
    } catch (error) { notify(error.message || "Não foi possível restaurar.", "error"); }
  }

  function close(reason) {
    if (!state.open || !state.panel) return;
    const contractChange = reason?.type === "grcon:contract-context-changed";
    if (!contractChange && (state.editorDirty || ((state.messageDirty || state.editorOriginal) && state.copiedSignature !== replySignature())) && typeof root.confirm === "function" &&
        !root.confirm("Descartar alterações não copiadas desta resposta?")) return;
    root.clearTimeout(state.previewTimer);
    state.previewTimer = null;
    state.panel.overlay.hidden = true;
    state.panel.panel.hidden = true;
    state.open = false;
    state.templateEpoch++;
    state.editorDirty = false;
    state.messageDirty = false;
    state.editorOriginal = null;
    state.copiedSignature = null;
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

  async function copyReply(mode = "all") {
    if (!state.records.length) return;
    const reply = currentReply();
    const html = mode === "table" ? reply.tableHtml : mode === "message" ? Reply.messageHtml(reply.message) : reply.html;
    const plain = mode === "table" ? reply.tableText : mode === "message" ? reply.message : reply.text;
    const copied = await writeClipboard(html, plain);
    const feedback = copied
      ? (mode === "table" ? "Tabela copiada. Cole na conversa do Outlook." : mode === "message" ? "Texto copiado." : "Resposta completa copiada. Cole na conversa do Outlook.")
      : "Não foi possível copiar automaticamente. Verifique a permissão de área de transferência.";
    if (copied) state.copiedSignature = replySignature();
    showFeedback(feedback);
    notify(feedback, copied ? "success" : "error");
  }

  async function openMail() {
    if (!state.records.length) return;
    const reply = currentReply();
    const copied = await writeClipboard(reply.html, reply.text);
    if (copied) state.copiedSignature = replySignature();
    const link = Reply.mailtoUrl(reply);
    root.location.href = link.url;
    showFeedback("Abrindo novo e-mail; para responder à conversa original, use Copiar resposta completa.");
    if (link.truncated) notify("A relação é grande para o link do e-mail: ela ficou na área de transferência, use Ctrl+V no corpo da mensagem.", "warning");
    else if (!copied) notify("O e-mail foi aberto com a resposta; a cópia automática não estava disponível.", "warning");
  }

  root.addEventListener("grcon:contract-context-changed", close);
  root.GrconEgrdtEmailReplyUi = { open, close };
})(typeof globalThis !== "undefined" ? globalThis : this);
