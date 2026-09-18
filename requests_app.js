/**
 * GRCON — Modelos de exportação da tela de Consultas
 *
 * A partir desta migração, a área "Consulta de documentos" (anexar LDs,
 * informar documentos, consultar, filtrar, exportar) é uma ilha React —
 * veja src/react/consultas/. Este arquivo cuida só do que continua legado:
 * a aba "Modelos de exportação" (estrutura/ordem das colunas do Excel
 * gerado) e a troca entre as duas abas do módulo Consultas.
 *
 * A leitura/gravação dos modelos usa as mesmas chaves de localStorage e o
 * mesmo `GrconRequestsReport` de sempre — a ilha React lê os modelos daqui
 * (mesma fonte) através do adaptador (src/react/consultas/services/
 * consultasAdapter.js) e é avisada de qualquer mudança pelo evento
 * "grcon:export-templates-changed" disparado no fim de `carregarModelos()`.
 */
(function (root) {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const els = {};
  const state = {
    modelos: [],        // modelos de exportação: embutidos + salvos aqui + da equipe
    modeloEditor: null,  // modelo aberto no editor de colunas
  };

  function notify(mensagem, tipo) {
    if (root.GrconNotify) root.GrconNotify(mensagem, tipo || "info");
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /**
   * Linhas da consulta atual, para a prévia do editor de modelos. A consulta
   * em si roda na ilha React; o adaptador expõe as linhas prontas para saída
   * sem que este arquivo precise conhecer o estado interno de React.
   */
  function linhasParaPreviaAtual() {
    const adapter = root.GrconConsultasAdapter;
    return (adapter && typeof adapter.getExportRows === "function" && adapter.getExportRows()) || [];
  }

  // ---------------------------------------------------------------------------
  // Modelos de exportação
  //
  // Cada frente cola o resultado numa planilha com ordem e nomes próprios, e
  // rearrumar coluna a coluna depois de exportar é justamente o retrabalho que
  // esta aba existe para tirar do caminho.
  //
  // Ficam gravados aqui no navegador e, havendo área compartilhada, também no
  // banco — assim quem trabalha sozinho não fica sem o recurso e quem trabalha
  // em equipe não precisa cadastrar o mesmo modelo em cada máquina.
  // ---------------------------------------------------------------------------
  const CHAVE_MODELOS = "grcon-requests-export-templates";
  const EVENTO_MODELOS = "grcon:export-templates-changed";

  function modelosLocais() {
    try {
      const bruto = JSON.parse(root.localStorage.getItem(CHAVE_MODELOS) || "[]");
      return (Array.isArray(bruto) ? bruto : []).map((item) => root.GrconRequestsReport.normalizeExportTemplate({ ...item, scope: "local" }));
    } catch (_) {
      return [];
    }
  }

  function gravarModelosLocais(lista) {
    try {
      root.localStorage.setItem(CHAVE_MODELOS, JSON.stringify(lista.map((modelo) => ({
        id: modelo.id, name: modelo.name, base: modelo.base, columns: modelo.columns,
      }))));
      return true;
    } catch (_) {
      // Armazenamento cheio ou bloqueado: o modelo continua valendo nesta
      // sessão, mas seria desonesto dizer que ficou salvo.
      return false;
    }
  }

  async function carregarModelos() {
    const Report = root.GrconRequestsReport;
    const porId = new Map();
    Report.BUILTIN_EXPORT_TEMPLATES.forEach((modelo) => porId.set(modelo.id, modelo));
    modelosLocais().forEach((modelo) => porId.set(modelo.id, modelo));
    const Cloud = root.GrconCloud;
    if (Cloud && Cloud.getExportTemplates) {
      const salvos = await Cloud.getExportTemplates();
      // O da equipe vence o local de mesmo id: é o combinado entre todos.
      (salvos || []).forEach((modelo) => porId.set(modelo.id, Report.normalizeExportTemplate({ ...modelo, scope: "equipe" })));
    }
    state.modelos = [...porId.values()];
    renderModelos();
    // A ilha React de Consultas usa o mesmo conjunto de modelos no seletor de
    // exportação; este evento é como ela sabe que precisa recarregar.
    root.dispatchEvent(new CustomEvent(EVENTO_MODELOS));
  }

  function origemDoModelo(modelo) {
    if (modelo.builtIn) return "embutido no GRCON";
    return modelo.scope === "equipe" ? "da equipe" : "salvo neste navegador";
  }

  function renderModelos() {
    if (!els.modelosTbody) return;
    const dono = ehProprietario();
    els.modelosTbody.innerHTML = state.modelos.map((modelo) => {
      const semDado = modelo.columns.filter((coluna) => !coluna.key).length;
      return `<tr>
        <td><strong>${escapeHtml(modelo.name)}</strong></td>
        <td>${escapeHtml(root.GrconRequestsReport.TEMPLATE_BASES[modelo.base].label)}</td>
        <td>${modelo.columns.length} coluna(s)${semDado ? ` · ${semDado} em branco` : ""}</td>
        <td>${escapeHtml(origemDoModelo(modelo))}</td>
        <td>
          <button class="text-button" data-modelo-edit="${escapeHtml(modelo.id)}" type="button">${modelo.builtIn ? "Duplicar e editar" : "Editar"}</button>
          ${modelo.builtIn || (!dono && modelo.scope === "equipe") ? "" : `<button class="text-button danger" data-modelo-remove="${escapeHtml(modelo.id)}" type="button">Excluir</button>`}
        </td>
      </tr>`;
    }).join("");
    renderEditorModelo();
  }

  function abrirEditorModelo(id) {
    const Report = root.GrconRequestsReport;
    const modelo = state.modelos.find((item) => item.id === id);
    if (!modelo) return;
    // Modelo embutido nunca é alterado no lugar: vira uma cópia com nome novo,
    // para o padrão do GRCON continuar disponível quando a cópia não servir.
    state.modeloEditor = modelo.builtIn
      ? Report.normalizeExportTemplate({ name: `${modelo.name} (cópia)`, base: modelo.base, columns: modelo.columns, id: "" })
      : Report.normalizeExportTemplate(modelo);
    if (modelo.builtIn) state.modeloEditor.id = "";
    els.modeloName.value = state.modeloEditor.name;
    els.modeloBase.value = state.modeloEditor.base;
    renderEditorModelo();
    els.modeloName.focus();
  }

  function novoModelo(base) {
    const Report = root.GrconRequestsReport;
    state.modeloEditor = Report.normalizeExportTemplate({ id: "", name: "", base: base || "consulta", columns: Report.exportFieldCatalog(base || "consulta") });
    els.modeloName.value = "";
    els.modeloBase.value = state.modeloEditor.base;
    renderEditorModelo();
  }

  function renderEditorModelo() {
    if (!els.modeloColumns) return;
    const Report = root.GrconRequestsReport;
    const editor = state.modeloEditor;
    els.modeloEditor.hidden = !editor;
    if (!editor) return;
    // A base fica na barra de cima, sempre visível, porque a importação também
    // depende dela: escondê-la dentro do editor deixava o botão de importar sem
    // como dizer para qual planilha a estrutura vale.
    if (els.modeloBaseNote) els.modeloBaseNote.textContent = `Linhas de: ${Report.TEMPLATE_BASES[editor.base].label}`;
    els.modeloColumns.innerHTML = editor.columns.map((coluna, indice) => `<li class="requests-modelo-coluna${coluna.key ? "" : " sem-dado"}">
      <span class="requests-modelo-ordem">${indice + 1}</span>
      <input aria-label="Nome da coluna ${indice + 1}" data-modelo-header="${indice}" type="text" value="${escapeHtml(coluna.header)}"/>
      <span class="requests-modelo-campo">${coluna.key ? escapeHtml(coluna.key) : "sai em branco"}</span>
      <button class="text-button" data-modelo-up="${indice}" title="Subir" type="button">↑</button>
      <button class="text-button" data-modelo-down="${indice}" title="Descer" type="button">↓</button>
      <button class="text-button danger" data-modelo-drop="${indice}" title="Remover" type="button">×</button>
    </li>`).join("");
    const usados = new Set(editor.columns.map((coluna) => coluna.key).filter(Boolean));
    const disponiveis = Report.exportFieldCatalog(editor.base).filter((campo) => !usados.has(campo.key));
    els.modeloAddField.innerHTML = disponiveis.length
      ? disponiveis.map((campo) => `<option value="${escapeHtml(campo.key)}">${escapeHtml(campo.header)}</option>`).join("")
      : '<option value="">Todos os campos já estão no modelo</option>';
    els.modeloAdd.disabled = !disponiveis.length;
    renderPreviaModelo();
  }

  /**
   * A prévia mostra as linhas reais que sairiam agora. Sem consulta feita não
   * há o que prever — e inventar exemplo aqui seria ensinar errado como o
   * arquivo vai ficar.
   */
  function renderPreviaModelo() {
    if (!els.modeloPreview || !state.modeloEditor) return;
    const Report = root.GrconRequestsReport;
    const linhas = linhasParaPreviaAtual();
    const previa = Report.previewExportTemplate(state.modeloEditor, linhas, 5);
    if (!linhas.length) {
      els.modeloPreview.innerHTML = `<p class="requests-vazio">Sem prévia: consulte os documentos para ver as linhas reais neste modelo.</p>`;
      return;
    }
    els.modeloPreview.innerHTML = `<table class="requests-batch-table">
      <thead><tr>${previa.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>${previa.rows.map((linha) => `<tr>${linha.map((valor) => `<td>${escapeHtml(valor)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
    <small class="requests-tipos-hint">${previa.rows.length} de ${previa.total} linha(s)${previa.hidden ? ` · ${previa.hidden} não exibida(s) na prévia` : ""}.</small>`;
  }

  /**
   * Importa a estrutura de uma planilha oficial: lê o cabeçalho e monta um
   * modelo com a mesma ordem e os mesmos nomes. O que o GRCON reconhece passa a
   * ser preenchido; o que não reconhece fica em branco e é dito na tela, para
   * ninguém supor que aquela coluna virá resolvida.
   */
  async function importarModelo(file) {
    if (!file) return;
    const Report = root.GrconRequestsReport;
    try {
      await root.GRCONModuleLoader.ensure("xlsx");
      const buffer = root.GrconFileAccess
        ? await root.GrconFileAccess.read(file, { context: "o painel oficial", retries: 1 })
        : await file.arrayBuffer();
      const workbook = root.XLSX.read(buffer, { type: "array", cellDates: false, cellStyles: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      // Células mescladas guardam o valor só no canto superior esquerdo; sem
      // replicar, as demais linhas do intervalo chegam vazias aqui.
      if (root.TriagemCore && root.TriagemCore.expandMergedCells) root.TriagemCore.expandMergedCells(sheet);
      const linhas = root.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
      // O cabeçalho da planilha oficial nem sempre está na primeira linha. Em
      // vez de fixar um número, vale a linha mais preenchida do começo do
      // arquivo.
      let melhor = { indice: -1, preenchidas: 0 };
      linhas.slice(0, 20).forEach((linha, indice) => {
        const preenchidas = linha.filter((valor) => String(valor || "").trim()).length;
        if (preenchidas > melhor.preenchidas) melhor = { indice, preenchidas };
      });
      if (melhor.indice < 0 || melhor.preenchidas < 3) {
        notify("Não foi possível reconhecer uma linha de cabeçalho nesta planilha.", "warn");
        return;
      }
      const cabecalho = linhas[melhor.indice].map((valor) => String(valor || "").trim());
      const base = els.modeloBase ? els.modeloBase.value : "consulta";
      const resultado = Report.importExportTemplate(file.name.replace(/\.[^.]+$/, ""), cabecalho, base);
      state.modeloEditor = resultado.template;
      els.modeloName.value = resultado.template.name;
      els.modeloBase.value = resultado.template.base;
      renderEditorModelo();
      notify(resultado.unmatched.length
        ? `Estrutura importada da linha ${melhor.indice + 1}: ${resultado.matched} coluna(s) o GRCON preenche, ${resultado.unmatched.length} sairão em branco (${resultado.unmatched.slice(0, 3).join(", ")}${resultado.unmatched.length > 3 ? "…" : ""}).`
        : `Estrutura importada da linha ${melhor.indice + 1}: o GRCON preenche todas as ${resultado.matched} colunas.`,
      resultado.unmatched.length ? "warn" : "success");
    } catch (erro) {
      notify((erro && erro.message) || "Não foi possível ler a planilha do painel.", "error");
    }
  }

  async function salvarModelo() {
    const Report = root.GrconRequestsReport;
    if (!state.modeloEditor) return;
    const nome = els.modeloName.value.trim();
    if (!nome) { notify("Dê um nome ao modelo.", "warn"); els.modeloName.focus(); return; }
    if (!state.modeloEditor.columns.length) { notify("O modelo precisa de pelo menos uma coluna.", "warn"); return; }
    const modelo = Report.normalizeExportTemplate({ ...state.modeloEditor, name: nome, id: state.modeloEditor.id || "" });
    els.modeloSave.disabled = true;
    try {
      const locais = modelosLocais().filter((item) => item.id !== modelo.id);
      const gravou = gravarModelosLocais([...locais, modelo]);
      let compartilhado = false;
      const Cloud = root.GrconCloud;
      if (Cloud && Cloud.saveExportTemplate && ehProprietario()) {
        const resultado = await Cloud.saveExportTemplate(modelo);
        compartilhado = Boolean(resultado && resultado.ok);
        if (resultado && !resultado.ok && !resultado.indisponivel) notify(resultado.error, "warn");
      }
      state.modeloEditor = null;
      await carregarModelos();
      notify(compartilhado
        ? `Modelo “${modelo.name}” salvo para toda a equipe.`
        : gravou ? `Modelo “${modelo.name}” salvo neste navegador.`
          : `Modelo “${modelo.name}” em uso nesta sessão, mas o navegador não permitiu gravar.`,
      gravou || compartilhado ? "success" : "warn");
    } finally {
      els.modeloSave.disabled = false;
    }
  }

  async function removerModelo(id) {
    const modelo = state.modelos.find((item) => item.id === id);
    if (!modelo || modelo.builtIn) return;
    if (!window.confirm(`Excluir o modelo “${modelo.name}”?`)) return;
    gravarModelosLocais(modelosLocais().filter((item) => item.id !== id));
    const Cloud = root.GrconCloud;
    if (modelo.scope === "equipe" && Cloud && Cloud.deleteExportTemplate) {
      const resultado = await Cloud.deleteExportTemplate(id);
      if (!resultado.ok) { notify(resultado.error, "warn"); return; }
    }
    if (state.modeloEditor && state.modeloEditor.id === id) state.modeloEditor = null;
    await carregarModelos();
    notify(`Modelo “${modelo.name}” excluído.`, "success");
  }

  /**
   * Sem área compartilhada configurada o GRCON é de uso local, e não há a quem
   * restringir. Tratar "sem área" como "não é proprietário" esconderia a
   * configuração de quem está trabalhando sozinho — mesma regra do app.js.
   */
  function ehProprietario() {
    const Cloud = root.GrconCloud;
    if (!Cloud || !Cloud.state?.membership) return true;
    return Boolean(Cloud.canManageMembers && Cloud.canManageMembers());
  }

  function mostrarArea(area) {
    els.areaConsulta.hidden = area !== "consulta";
    els.areaModelos.hidden = area !== "modelos";
    document.querySelectorAll("[data-requests-area]").forEach((botao) => {
      botao.classList.toggle("active", botao.dataset.requestsArea === area);
    });
    if (area === "modelos") carregarModelos();
  }

  // ---------------------------------------------------------------------------
  // Ligações
  // ---------------------------------------------------------------------------
  function ligar() {
    els.areaConsulta = $("#requests-area-consulta");
    els.areaModelos = $("#requests-area-modelos");
    els.modelosTbody = $("#requests-modelos-tbody");
    els.modeloNew = $("#requests-modelo-new");
    els.modeloImport = $("#requests-modelo-import");
    els.modeloImportInput = $("#requests-modelo-import-input");
    els.modeloEditor = $("#requests-modelo-editor");
    els.modeloName = $("#requests-modelo-name");
    els.modeloBase = $("#requests-modelo-base");
    els.modeloBaseNote = $("#requests-modelo-base-note");
    els.modeloColumns = $("#requests-modelo-columns");
    els.modeloAddField = $("#requests-modelo-add-field");
    els.modeloAdd = $("#requests-modelo-add");
    els.modeloAddBlank = $("#requests-modelo-add-blank");
    els.modeloPreview = $("#requests-modelo-preview");
    els.modeloSave = $("#requests-modelo-save");
    els.modeloCancel = $("#requests-modelo-cancel");
    if (!els.modelosTbody) return false;

    els.modeloNew.addEventListener("click", () => novoModelo(els.modeloBase.value));
    els.modeloImport.addEventListener("click", () => els.modeloImportInput.click());
    els.modeloImportInput.addEventListener("change", (evento) => {
      importarModelo(evento.target.files && evento.target.files[0]);
      evento.target.value = "";
    });
    els.modeloBase.addEventListener("change", () => {
      // Trocar de base troca os campos disponíveis: começar do catálogo da nova
      // base evita um modelo com colunas que aquela base não sabe preencher.
      if (state.modeloEditor) novoModelo(els.modeloBase.value);
    });
    els.modeloSave.addEventListener("click", salvarModelo);
    els.modeloCancel.addEventListener("click", () => { state.modeloEditor = null; renderEditorModelo(); });
    els.modeloAdd.addEventListener("click", () => {
      const campo = root.GrconRequestsReport.exportFieldCatalog(state.modeloEditor.base)
        .find((item) => item.key === els.modeloAddField.value);
      if (!campo) return;
      state.modeloEditor.columns.push({ ...campo });
      renderEditorModelo();
    });
    els.modeloAddBlank.addEventListener("click", () => {
      if (!state.modeloEditor) return;
      state.modeloEditor.columns.push({ key: "", header: "Coluna em branco", width: 24 });
      renderEditorModelo();
    });
    els.modeloColumns.addEventListener("click", (evento) => {
      const editor = state.modeloEditor;
      if (!editor) return;
      const subir = evento.target.closest("[data-modelo-up]");
      const descer = evento.target.closest("[data-modelo-down]");
      const remover = evento.target.closest("[data-modelo-drop]");
      if (subir) {
        const indice = Number(subir.dataset.modeloUp);
        if (indice > 0) editor.columns.splice(indice - 1, 0, editor.columns.splice(indice, 1)[0]);
      } else if (descer) {
        const indice = Number(descer.dataset.modeloDown);
        if (indice < editor.columns.length - 1) editor.columns.splice(indice + 1, 0, editor.columns.splice(indice, 1)[0]);
      } else if (remover) {
        editor.columns.splice(Number(remover.dataset.modeloDrop), 1);
      } else {
        return;
      }
      renderEditorModelo();
    });
    els.modeloColumns.addEventListener("input", (evento) => {
      const campo = evento.target.closest("[data-modelo-header]");
      if (!campo || !state.modeloEditor) return;
      const coluna = state.modeloEditor.columns[Number(campo.dataset.modeloHeader)];
      // Só o nome muda; renderizar de novo aqui tiraria o cursor do campo.
      if (coluna) { coluna.header = campo.value; renderPreviaModelo(); }
    });
    els.modelosTbody.addEventListener("click", (evento) => {
      const editar = evento.target.closest("[data-modelo-edit]");
      if (editar) { abrirEditorModelo(editar.dataset.modeloEdit); return; }
      const remover = evento.target.closest("[data-modelo-remove]");
      if (remover) removerModelo(remover.dataset.modeloRemove);
    });
    document.querySelectorAll("[data-requests-area]").forEach((botao) =>
      botao.addEventListener("click", () => mostrarArea(botao.dataset.requestsArea)));

    // Os modelos alimentam o seletor de exportação da ilha React (consulta);
    // carregar já na abertura do módulo evita a exportação ficar sem opções
    // até alguém visitar a aba "Modelos de exportação".
    carregarModelos();
    return true;
  }

  root.GrconRequestsUi = Object.freeze({
    init: ligar,
    state,
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ligar, { once: true });
  } else {
    ligar();
  }
})(window);
