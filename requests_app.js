/**
 * GRCON — Tela de Consultas e Solicitações
 *
 * Área de consulta rápida: anexar uma ou várias LDs, informar os documentos e
 * receber, em uma linha por documento, só o que costumam perguntar — título
 * oficial, alocação, última GRDT, status no SIGEM e em que LD foi achado.
 *
 * A leitura das LDs e a correspondência dos códigos são as mesmas da Triagem de
 * GRDT: parseWorkbook e buildIndex do motor documental, e as regras de decisão
 * em requests_core.js. Esta camada cuida só de tela, seleção e atalhos.
 */
(function (root) {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const R = () => root.GrconRequestsCore;
  const C = () => root.TriagemCore;

  const els = {};
  const state = {
    lds: [],           // { id, file, name, records, error }
    documents: [],     // { id, document, requestedTitle, selected }
    results: new Map(), // id -> linha da consulta
    lookups: new Map(), // id -> resultado completo, usado para gerar a solicitação
    index: null,
    running: false,
    search: "",
    situation: "",
    allocation: "",
    sort: "entrada",
    undo: [],          // pilha de estados anteriores da lista de documentos
    requestRows: [],   // itens gerados para a solicitação; depois de gerados, a tabela manda
    requestUndo: [],   // pilha para desfazer alterações em lote
    painelItems: [],   // itens vindos da área compartilhada
    painelQuick: "todos",
    painelSearch: "",
    painelStatus: "",
    painelOwner: "",
    painelSelected: new Set(),
    tipos: [],         // tipos vindos da área compartilhada
    modelos: [],       // modelos de exportação: embutidos + salvos aqui + da equipe
    modeloEditor: null, // modelo aberto no editor de colunas
  };

  let proximoId = 1;
  const novoId = () => `doc-${proximoId++}`;

  function notify(mensagem, tipo) {
    if (root.GrconNotify) root.GrconNotify(mensagem, tipo || "info");
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // ---------------------------------------------------------------------------
  // Desfazer
  //
  // Guarda a lista de documentos antes de cada ação que apaga ou substitui algo.
  // Sem isto, uma limpeza acidental depois de colar 300 códigos custa o trabalho
  // inteiro de novo.
  // ---------------------------------------------------------------------------
  function guardarParaDesfazer(rotulo) {
    state.undo.push({ rotulo, documents: state.documents.map((item) => ({ ...item })) });
    if (state.undo.length > 20) state.undo.shift();
    atualizarAcoes();
  }

  function desfazer() {
    const anterior = state.undo.pop();
    if (!anterior) return;
    state.documents = anterior.documents;
    // Resultados de documentos que voltaram continuam válidos; os demais somem
    // sozinhos porque a tabela só mostra o que está na lista.
    render();
    notify(`Desfeito: ${anterior.rotulo}.`, "info");
  }

  // ---------------------------------------------------------------------------
  // LDs
  // ---------------------------------------------------------------------------
  async function lerLd(file) {
    await root.GRCONModuleLoader.ensure("xlsx");
    const buffer = root.GrconFileAccess
      ? await root.GrconFileAccess.read(file, { context: "a LD controlada", retries: 1 })
      : await file.arrayBuffer();
    const workbook = root.XLSX.read(buffer, { type: "array", cellDates: true, cellStyles: false });
    const parsed = C().parseWorkbook(workbook, file.name, file.lastModified);
    return parsed;
  }

  async function adicionarLds(fileList) {
    const arquivos = [...(fileList || [])];
    if (!arquivos.length) return;
    for (const file of arquivos) {
      if (state.lds.some((item) => item.name === file.name && item.size === file.size)) continue;
      const entrada = { id: `ld-${state.lds.length + 1}-${Date.now()}`, file, name: file.name, size: file.size, records: [], history: [], error: "" };
      state.lds.push(entrada);
      renderLds();
      try {
        const parsed = await lerLd(file);
        entrada.records = parsed.records || [];
        entrada.history = parsed.history || [];
        if (!entrada.records.length) entrada.error = "Nenhuma linha de documento foi reconhecida nesta planilha.";
      } catch (erro) {
        // Um arquivo inválido não pode derrubar os demais.
        entrada.error = (erro && erro.message) || "Não foi possível ler este arquivo.";
      }
      reconstruirIndice();
      renderLds();
    }
    if (root.GrconLdMemory && arquivos[0]) {
      try { root.GrconLdMemory.saveLastLd(arquivos[0]); } catch (_) { /* memória é conveniência, não requisito */ }
    }
    render();
  }

  function removerLd(id) {
    const alvo = state.lds.find((item) => item.id === id);
    if (!alvo) return;
    state.lds = state.lds.filter((item) => item.id !== id);
    reconstruirIndice();
    // O resultado anterior citava LDs que não estão mais anexadas.
    state.results.clear();
    state.lookups.clear();
    render();
    notify(`LD removida: ${alvo.name}. Consulte de novo para atualizar o resultado.`, "info");
  }

  function reconstruirIndice() {
    const validas = state.lds.filter((item) => !item.error && item.records.length);
    if (!validas.length) { state.index = null; return; }
    const registros = validas.flatMap((item) => item.records);
    const historico = validas.flatMap((item) => item.history || []);
    state.index = C().buildIndex(registros, historico);
  }

  function renderLds() {
    if (!els.ldList) return;
    els.ldList.innerHTML = state.lds.map((item) => {
      const linhas = item.records.length;
      const estado = item.error
        ? `<span class="requests-ld-error">${escapeHtml(item.error)}</span>`
        : linhas
          ? `<span class="requests-ld-ok">${linhas.toLocaleString("pt-BR")} linha(s) de documento</span>`
          : `<span class="requests-ld-loading">Lendo…</span>`;
      return `<div class="requests-ld-item${item.error ? " has-error" : ""}">
        <svg aria-hidden="true" viewbox="0 0 24 24"><path d="M6 2h8l4 4v16H6z"></path><path d="M14 2v4h4"></path></svg>
        <span class="requests-ld-name">${escapeHtml(item.name)}</span>
        ${estado}
        <button class="requests-ld-remove" data-remove-ld="${escapeHtml(item.id)}" title="Remover esta LD" type="button" aria-label="Remover ${escapeHtml(item.name)}">&times;</button>
      </div>`;
    }).join("");
    els.ldClear.hidden = !state.lds.length;
  }

  // ---------------------------------------------------------------------------
  // Documentos
  // ---------------------------------------------------------------------------
  function adicionarDocumentos(texto) {
    const novos = R().parseDocumentList(texto);
    if (!novos.length) { notify("Nenhum código foi reconhecido no texto colado.", "warn"); return; }
    guardarParaDesfazer(`adicionar ${novos.length} documento(s)`);
    novos.forEach((item) => {
      state.documents.push({ id: novoId(), document: item.document, requestedTitle: item.requestedTitle, selected: true });
    });
    const { items, removed } = R().dedupeDocuments(state.documents);
    if (removed.length) {
      state.documents = items;
      notify(`${novos.length} documento(s) adicionados. ${removed.length} repetido(s) foram descartados.`, "info");
    } else {
      notify(`${novos.length} documento(s) adicionados.`, "success");
    }
    els.paste.value = "";
    render();
  }

  function removerDuplicados() {
    const { items, removed } = R().dedupeDocuments(state.documents);
    if (!removed.length) { notify("Não há documentos repetidos na lista.", "info"); return; }
    guardarParaDesfazer(`remover ${removed.length} duplicado(s)`);
    state.documents = items;
    render();
    notify(`${removed.length} documento(s) repetido(s) removido(s).`, "success");
  }

  function limparConsulta() {
    if (!state.documents.length && !state.results.size) return;
    guardarParaDesfazer("limpar a consulta");
    state.documents = [];
    state.results.clear();
    state.lookups.clear();
    render();
    notify("Consulta limpa. Use Desfazer se foi sem querer.", "info");
  }

  // ---------------------------------------------------------------------------
  // Consulta
  // ---------------------------------------------------------------------------
  async function consultar(apenasSelecionados) {
    if (state.running) return;
    if (!state.index) { notify("Anexe pelo menos uma LD válida antes de consultar.", "warn"); return; }
    const alvos = apenasSelecionados ? state.documents.filter((item) => item.selected) : state.documents;
    if (!alvos.length) { notify(apenasSelecionados ? "Nenhum documento selecionado." : "Informe pelo menos um documento.", "warn"); return; }

    state.running = true;
    atualizarAcoes();
    els.progress.hidden = false;
    const total = alvos.length;

    // Processa em blocos para a tela continuar respondendo em listas grandes.
    for (let inicio = 0; inicio < total; inicio += 100) {
      const fim = Math.min(total, inicio + 100);
      for (let i = inicio; i < fim; i += 1) {
        const item = alvos[i];
        const resultado = R().lookupDocument(item.document, state.index, { requestedTitle: item.requestedTitle });
        state.results.set(item.id, R().consultationRow(resultado));
        state.lookups.set(item.id, resultado);
      }
      els.progressFill.style.width = `${Math.round((fim / total) * 100)}%`;
      els.progressText.textContent = `Consultando ${fim.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}…`;
      if (fim < total) await new Promise((resolve) => setTimeout(resolve, 0));
    }

    state.running = false;
    els.progress.hidden = true;
    els.progressFill.style.width = "0%";
    render();

    const linhas = [...state.results.values()];
    const validar = linhas.filter((linha) => linha.needsManualValidation).length;
    notify(validar
      ? `${total} documento(s) consultados. ${validar} precisam de conferência.`
      : `${total} documento(s) consultados.`, validar ? "warn" : "success");
  }

  // ---------------------------------------------------------------------------
  // Tabela
  // ---------------------------------------------------------------------------
  function linhasVisiveis() {
    const busca = state.search.trim().toLowerCase();
    let linhas = state.documents.map((item) => ({ item, linha: state.results.get(item.id) || null }));
    if (state.situation) linhas = linhas.filter(({ linha }) => linha && linha.situation === state.situation);
    if (state.allocation) {
      linhas = linhas.filter(({ linha }) => {
        const valor = (linha && linha.allocated || "").toUpperCase();
        if (state.allocation === "sim") return valor.startsWith("SIM");
        if (state.allocation === "nao") return valor.startsWith("NÃO");
        return valor.startsWith("REVISAR");
      });
    }
    if (busca) {
      linhas = linhas.filter(({ item, linha }) => [item.document, linha && linha.title, linha && linha.ld, linha && linha.allLds]
        .filter(Boolean).some((valor) => String(valor).toLowerCase().includes(busca)));
    }
    const ordem = {
      documento: (a, b) => a.item.document.localeCompare(b.item.document, "pt-BR"),
      situacao: (a, b) => String(a.linha && a.linha.situation || "").localeCompare(String(b.linha && b.linha.situation || ""), "pt-BR"),
      ld: (a, b) => String(a.linha && a.linha.ld || "").localeCompare(String(b.linha && b.linha.ld || ""), "pt-BR"),
    };
    return state.sort === "entrada" ? linhas : [...linhas].sort(ordem[state.sort] || (() => 0));
  }

  function selo(linha) {
    if (!linha) return '<span class="requests-badge pendente">Não consultado</span>';
    if (linha.situation === "Localizado") return '<span class="requests-badge ok">✓ Localizado</span>';
    if (linha.situation === "Requer validação manual") return '<span class="requests-badge alerta">! Validar</span>';
    return '<span class="requests-badge erro">✕ Não localizado</span>';
  }

  function render() {
    renderLds();
    const visiveis = linhasVisiveis();
    const temResultado = state.results.size > 0;

    els.tableWrap.hidden = !state.documents.length;
    els.empty.hidden = Boolean(state.documents.length);

    els.tbody.innerHTML = visiveis.map(({ item, linha }) => {
      const titulo = linha && linha.title ? escapeHtml(linha.title) : '<span class="requests-vazio">—</span>';
      const conflito = linha && linha.rule && linha.needsManualValidation
        ? `<div class="requests-rule">${escapeHtml(linha.rule)}</div>` : "";
      return `<tr data-doc="${escapeHtml(item.id)}"${linha && linha.needsManualValidation ? ' class="precisa-validar"' : ""}>
        <td class="requests-col-check"><input aria-label="Selecionar ${escapeHtml(item.document)}" data-select="${escapeHtml(item.id)}" type="checkbox"${item.selected ? " checked" : ""}/></td>
        <td>${selo(linha)}</td>
        <td class="requests-col-doc"><code>${escapeHtml(item.document)}</code>${conflito}</td>
        <td>${titulo}</td>
        <td>${linha && linha.allocated ? escapeHtml(linha.allocated) : '<span class="requests-vazio">—</span>'}</td>
        <td>${linha && linha.lastGrdt ? escapeHtml(linha.lastGrdt) : '<span class="requests-vazio">—</span>'}</td>
        <td>${linha && linha.sigemStatus ? escapeHtml(linha.sigemStatus) : '<span class="requests-vazio">—</span>'}</td>
        <td>${linha && linha.ld ? escapeHtml(linha.ld) : '<span class="requests-vazio">—</span>'}${linha && linha.occurrenceCount > 1 ? `<small class="requests-multi">${linha.occurrenceCount} LDs</small>` : ""}</td>
      </tr>`;
    }).join("");

    if (temResultado) {
      const linhas = [...state.results.values()];
      const localizados = linhas.filter((l) => l.situation === "Localizado").length;
      const validar = linhas.filter((l) => l.situation === "Requer validação manual").length;
      const ausentes = linhas.length - localizados - validar;
      els.summary.hidden = false;
      els.summary.innerHTML = `
        <div><span>Consultados</span><strong>${linhas.length.toLocaleString("pt-BR")}</strong></div>
        <div class="ok"><span>Localizados</span><strong>${localizados.toLocaleString("pt-BR")}</strong></div>
        <div class="alerta"><span>A validar</span><strong>${validar.toLocaleString("pt-BR")}</strong></div>
        <div class="erro"><span>Não localizados</span><strong>${ausentes.toLocaleString("pt-BR")}</strong></div>`;
    } else {
      els.summary.hidden = true;
    }

    atualizarPassos();
    atualizarAcoes();
  }

  function atualizarPassos() {
    const lds = state.lds.filter((item) => !item.error && item.records.length).length;
    const docs = state.documents.length;
    els.step1Note.textContent = lds ? `${lds} LD(s) carregada(s)` : "Nenhuma LD carregada";
    els.step2Note.textContent = docs ? `${docs.toLocaleString("pt-BR")} documento(s) na lista` : "Nenhum documento na lista";
    els.step3Note.textContent = state.results.size ? `${state.results.size.toLocaleString("pt-BR")} consultado(s)` : "Aguardando consulta";
    els.step1.classList.toggle("is-done", lds > 0);
    els.step2.classList.toggle("is-done", docs > 0);
    els.step3.classList.toggle("is-done", state.results.size > 0);
    els.step1.classList.toggle("is-current", !lds);
    els.step2.classList.toggle("is-current", lds > 0 && !docs);
    els.step3.classList.toggle("is-current", lds > 0 && docs > 0 && !state.results.size);
    els.docCount.textContent = `${docs.toLocaleString("pt-BR")} documento(s) na lista`;
  }

  function atualizarAcoes() {
    const temDocs = state.documents.length > 0;
    const selecionados = state.documents.filter((item) => item.selected).length;
    const temResultado = state.results.size > 0;
    const podeConsultar = temDocs && Boolean(state.index) && !state.running;
    els.run.disabled = !podeConsultar;
    els.runSelected.disabled = !podeConsultar || !selecionados;
    els.selectAll.disabled = !temDocs;
    els.selectNone.disabled = !selecionados;
    els.dedupe.disabled = !temDocs;
    els.copy.disabled = !temResultado;
    els.export.disabled = !temResultado;
    els.toRequest.disabled = !temResultado || !selecionados;
    els.clear.disabled = !temDocs && !temResultado;
    els.undo.disabled = !state.undo.length;
    els.selectionNote.textContent = selecionados
      ? `${selecionados.toLocaleString("pt-BR")} de ${state.documents.length.toLocaleString("pt-BR")} selecionado(s)`
      : "";
  }

  // ---------------------------------------------------------------------------
  // Copiar e exportar
  // ---------------------------------------------------------------------------
  function linhasParaSaida() {
    return state.documents
      .filter((item) => state.results.has(item.id))
      .map((item) => {
        const linha = state.results.get(item.id);
        return {
          situation: linha.situation,
          document: item.document,
          title: linha.title,
          allocated: linha.allocated,
          allocation: linha.allocation,
          lastGrdt: linha.lastGrdt,
          sigemStatus: linha.sigemStatus,
          ld: linha.ld,
          allLds: linha.allLds,
          rule: linha.rule,
        };
      });
  }

  async function copiarResultados() {
    const linhas = linhasParaSaida();
    if (!linhas.length) return;
    const Report = root.GrconRequestsReport;
    const cabecalho = Report.COLUMNS.map((coluna) => coluna.header).join("\t");
    const corpo = linhas.map((linha) => Report.COLUMNS.map((coluna) => String(linha[coluna.key] || "")).join("\t")).join("\n");
    try {
      await navigator.clipboard.writeText(`${cabecalho}\n${corpo}`);
      notify(`${linhas.length} linha(s) copiadas. Cole direto na planilha.`, "success");
    } catch (_) {
      notify("O navegador bloqueou a cópia automática. Use a exportação para Excel.", "warn");
    }
  }

  /**
   * As linhas da exportação dependem da base do modelo: a base "consulta" sai
   * do resultado da consulta; a base "controle" sai dos itens da solicitação,
   * que é onde existem item, responsável, data e as demais colunas da planilha
   * oficial. Um modelo do Controle sem solicitação aberta não tem de onde tirar
   * dado nenhum — e é isso que a tela diz, em vez de gerar um arquivo vazio.
   */
  function linhasDoModelo(modelo) {
    if (modelo && modelo.base === "controle") {
      // Depois de gerada, a tabela da solicitação é a verdade — é nela que as
      // edições em lote estão. Antes disso, as linhas saem do mesmo construtor.
      return state.requestRows.length ? state.requestRows : linhasDaSolicitacao();
    }
    return linhasParaSaida();
  }

  async function exportarExcel(modeloEscolhido) {
    const Report = root.GrconRequestsReport;
    const modelo = Report.normalizeExportTemplate(modeloEscolhido || modeloAtual());
    const linhas = linhasDoModelo(modelo);
    if (!linhas.length) {
      notify(modelo.base === "controle"
        ? "Este modelo usa as colunas do Controle de Solicitações: gere a solicitação antes de exportar."
        : "Consulte os documentos antes de exportar.", "warn");
      return;
    }
    els.export.disabled = true;
    try {
      await root.GRCONModuleLoader.ensure("excel");
      await root.GRCONModuleLoader.ensure("brand");
      const workbook = new root.ExcelJS.Workbook();
      workbook.creator = "GRCON";
      workbook.company = "CONSAG Engenharia";
      workbook.title = modelo.name;
      const aba = modelo.base === "controle" ? "Solicitações" : "Consulta";
      const sheet = workbook.addWorksheet(aba, { properties: { defaultRowHeight: 20 }, views: [{ showGridLines: false, zoomScale: 85 }] });
      const nomes = state.lds.filter((item) => !item.error).map((item) => item.name).join(" · ");
      Report.writeConsultationSheet(sheet, linhas, {
        columns: modelo.columns,
        title: `GRCON · ${modelo.name.toUpperCase()}`,
        footer: `GRCON · ${modelo.name}`,
        metadata: `${linhas.length.toLocaleString("pt-BR")} linha(s) · modelo “${modelo.name}” · ${new Date().toLocaleString("pt-BR")}`,
        ldNames: nomes,
      });
      // Mesmo logo, mesmo construtor das planilhas da Triagem.
      await Report.attachBrandLogo(workbook, sheet, root.GRCONBrandAssets, root.fetch.bind(root));
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const carimbo = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      link.href = url;
      link.download = `GRCON_${modelo.base === "controle" ? "SOLICITACOES" : "CONSULTA"}_${carimbo}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      lembrarUltimaExportacao(modelo);
      notify(`Planilha gerada com ${linhas.length} linha(s) no modelo “${modelo.name}”.`, "success");
    } catch (erro) {
      notify((erro && erro.message) || "Não foi possível gerar a planilha.", "error");
    } finally {
      els.export.disabled = false;
      atualizarAcoes();
    }
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
  const CHAVE_ULTIMA = "grcon-requests-last-export";

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
  }

  function modeloAtual() {
    const escolhido = els.modeloSelect && els.modeloSelect.value;
    return state.modelos.find((modelo) => modelo.id === escolhido)
      || state.modelos[0]
      || root.GrconRequestsReport.BUILTIN_EXPORT_TEMPLATES[0];
  }

  function origemDoModelo(modelo) {
    if (modelo.builtIn) return "embutido no GRCON";
    return modelo.scope === "equipe" ? "da equipe" : "salvo neste navegador";
  }

  function renderModelos() {
    const atual = els.modeloSelect ? els.modeloSelect.value : "";
    if (els.modeloSelect) {
      els.modeloSelect.innerHTML = state.modelos
        .map((modelo) => `<option value="${escapeHtml(modelo.id)}">${escapeHtml(modelo.name)}</option>`).join("");
      if (state.modelos.some((modelo) => modelo.id === atual)) els.modeloSelect.value = atual;
    }
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
    const linhas = linhasDoModelo(state.modeloEditor);
    const previa = Report.previewExportTemplate(state.modeloEditor, linhas, 5);
    if (!linhas.length) {
      els.modeloPreview.innerHTML = `<p class="requests-vazio">Sem prévia: ${state.modeloEditor.base === "controle"
        ? "gere uma solicitação para ver as linhas do Controle de Solicitações."
        : "consulte os documentos para ver as linhas reais neste modelo."}</p>`;
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
      const linhas = root.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
      // O cabeçalho da planilha oficial não está na primeira linha — na do
      // Controle de Solicitações está na quinta. Em vez de fixar um número,
      // vale a linha mais preenchida do começo do arquivo.
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
      const base = els.modeloBase ? els.modeloBase.value : "controle";
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
      if (els.modeloSelect) { els.modeloSelect.value = modelo.id; renderModelos(); }
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

  function lembrarUltimaExportacao(modelo) {
    try {
      root.localStorage.setItem(CHAVE_ULTIMA, JSON.stringify({ id: modelo.id, name: modelo.name, at: new Date().toISOString() }));
    } catch (_) { /* repetir a última é conveniência, não requisito */ }
    atualizarBotaoRepetir();
  }

  function ultimaExportacao() {
    try {
      const bruto = JSON.parse(root.localStorage.getItem(CHAVE_ULTIMA) || "null");
      return bruto && bruto.id ? bruto : null;
    } catch (_) {
      return null;
    }
  }

  function atualizarBotaoRepetir() {
    if (!els.modeloRepeat) return;
    const ultima = ultimaExportacao();
    els.modeloRepeat.hidden = !ultima;
    if (ultima) els.modeloRepeat.textContent = `Repetir “${ultima.name}”`;
  }

  /**
   * Repete a última exportação com o mesmo modelo e os dados de agora. Se o
   * modelo tiver sido excluído desde então, isso é dito — repetir em cima de
   * outro modelo qualquer entregaria um arquivo diferente do que foi pedido.
   */
  async function repetirUltimaExportacao() {
    const ultima = ultimaExportacao();
    if (!ultima) return;
    const modelo = state.modelos.find((item) => item.id === ultima.id);
    if (!modelo) {
      notify(`O modelo “${ultima.name}” não existe mais. Escolha outro para exportar.`, "warn");
      return;
    }
    if (els.modeloSelect) els.modeloSelect.value = modelo.id;
    await exportarExcel(modelo);
  }


  // ---------------------------------------------------------------------------
  // Transformar a consulta em solicitação
  //
  // É o caminho que evita redigitar: cada documento consultado vira um item do
  // Controle de Solicitações, numerado na sequência da planilha, já com o que a
  // LD respondeu. O que depende de etapas posteriores fica em branco de
  // propósito — a saída marca como "na" e a pessoa preenche quando acontecer.
  // ---------------------------------------------------------------------------
  function cabecalhoDaSolicitacao() {
    const data = els.reqReceived && els.reqReceived.value;
    const dataBr = data ? data.split("-").reverse().join("/") : "";
    return {
      owner: els.reqOwner ? els.reqOwner.value.trim() : "",
      receivedAt: dataBr,
      requester: els.reqRequester ? els.reqRequester.value.trim() : "",
      requestType: els.reqType ? els.reqType.value : "",
      origin: els.reqOrigin ? els.reqOrigin.value : "",
      documentPath: els.reqPath ? els.reqPath.value.trim() : "",
    };
  }

  function documentosParaSolicitacao() {
    return state.documents
      .filter((item) => item.selected && state.results.has(item.id))
      .map((item) => ({
        document: item.document,
        requestedTitle: item.requestedTitle,
        lookup: state.lookups.get(item.id) || null,
      }));
  }

  function linhasDaSolicitacao() {
    const proximo = Math.max(1, Math.trunc(Number(els.reqNextItem && els.reqNextItem.value)) || 1);
    // nextItemNumber devolve o maior + 1, então passamos o anterior ao desejado.
    const base = proximo > 1 ? [{ protocol: String(proximo - 1) }] : [];
    return R().buildControlRows(documentosParaSolicitacao(), cabecalhoDaSolicitacao(), base);
  }

  function renderPainelSolicitacao() {
    if (!els.reqPreview) return;
    const linhas = state.requestRows;
    if (!linhas.length) {
      els.reqPreview.innerHTML = '<p class="requests-vazio">Selecione ao menos um documento já consultado.</p>';
      els.batchBar.hidden = true;
      els.batchTableWrap.hidden = true;
      return;
    }
    const novos = linhas.filter((linha) => linha.needsLdInclusion === "sim").length;
    const validar = linhas.filter((linha) => linha._needsManualValidation).length;
    els.reqPreview.innerHTML = `<p><strong>${linhas.length}</strong> item(ns), do <strong>${linhas[0].item}</strong> ao <strong>${linhas[linhas.length - 1].item}</strong>.
      ${novos ? `${novos} precisam de inclusão na LD. ` : ""}${validar ? `${validar} pedem conferência antes de seguir.` : ""}
      Edite aqui antes de copiar: o que estiver na tabela é o que vai para a planilha.</p>`;

    const tipos = R().requestTypeList(null).filter((tipo) => tipo.active).map((tipo) => tipo.label);
    els.batchTbody.innerHTML = linhas.map((linha, indice) => {
      const opcoes = tipos.map((rotulo) => `<option${rotulo === linha.requestType ? " selected" : ""}>${escapeHtml(rotulo)}</option>`).join("");
      const inclusao = ["", "sim", "não", "na"].map((valor) =>
        `<option value="${valor}"${valor === linha.needsLdInclusion ? " selected" : ""}>${valor || "—"}</option>`).join("");
      return `<tr${linha._needsManualValidation ? ' class="precisa-validar"' : ""}>
        <td class="requests-col-check"><input aria-label="Selecionar item ${escapeHtml(linha.item)}" data-batch-select="${indice}" type="checkbox"${linha._selected === false ? "" : " checked"}/></td>
        <td><strong>${escapeHtml(linha.item)}</strong></td>
        <td><code>${escapeHtml(linha.document)}</code></td>
        <td><select data-batch-field="requestType" data-batch-row="${indice}">${opcoes}</select></td>
        <td><input data-batch-field="owner" data-batch-row="${indice}" type="text" value="${escapeHtml(linha.owner)}"/></td>
        <td><select data-batch-field="needsLdInclusion" data-batch-row="${indice}">${inclusao}</select></td>
        <td>${escapeHtml(linha.allocation || "—")}</td>
        <td>${escapeHtml(linha.sigemStatus || "—")}</td>
        <td><input data-batch-field="observations" data-batch-row="${indice}" type="text" value="${escapeHtml(linha.observations)}"/></td>
      </tr>`;
    }).join("");

    if (els.batchType && els.batchType.options.length <= 1) {
      tipos.forEach((rotulo) => {
        const opcao = document.createElement("option");
        opcao.value = rotulo; opcao.textContent = rotulo;
        els.batchType.appendChild(opcao);
      });
    }
    els.batchBar.hidden = false;
    els.batchTableWrap.hidden = false;
    atualizarContagemLote();
  }

  function atualizarContagemLote() {
    const quantos = state.requestRows.filter((linha) => linha._selected !== false).length;
    if (els.batchCount) els.batchCount.textContent = `${quantos} selecionado(s)`;
    if (els.batchUndo) els.batchUndo.disabled = !state.requestUndo.length;
  }

  /**
   * Aplica de uma vez os campos preenchidos na barra. Só os preenchidos: um
   * campo vazio não apaga o que já está na linha, senão aplicar responsável
   * limparia a descrição sem querer.
   */
  function aplicarEmLote() {
    const alvo = state.requestRows.filter((linha) => linha._selected !== false);
    if (!alvo.length) { notify("Selecione ao menos um item.", "warn"); return; }
    const tipo = els.batchType.value;
    const responsavel = els.batchOwner.value.trim();
    const inclusao = els.batchInclusion.value;
    const observacao = els.batchNote.value.trim();
    if (!tipo && !responsavel && !inclusao && !observacao) { notify("Preencha ao menos um campo da barra para aplicar.", "warn"); return; }

    state.requestUndo.push(state.requestRows.map((linha) => ({ ...linha })));
    if (state.requestUndo.length > 10) state.requestUndo.shift();

    alvo.forEach((linha) => {
      if (tipo) linha.requestType = tipo;
      if (responsavel) linha.owner = responsavel;
      if (inclusao) linha.needsLdInclusion = inclusao;
      // A observação é acrescentada, não substituída: o motivo da triagem é
      // informação que ninguém deveria perder ao anotar algo.
      if (observacao) linha.observations = [linha.observations, observacao].filter(Boolean).join(" ");
    });
    els.batchNote.value = "";
    renderPainelSolicitacao();
    notify(`Aplicado a ${alvo.length} item(ns).`, "success");
  }

  function desfazerLote() {
    const anterior = state.requestUndo.pop();
    if (!anterior) return;
    state.requestRows = anterior;
    renderPainelSolicitacao();
    notify("Alteração em lote desfeita.", "info");
  }

  function abrirPainelSolicitacao() {
    const disponiveis = documentosParaSolicitacao();
    if (!disponiveis.length) { notify("Consulte e selecione os documentos antes de gerar a solicitação.", "warn"); return; }
    // Semeia a lista de tipos com os rótulos do controle oficial.
    if (els.reqType && !els.reqType.options.length) {
      R().requestTypeList(null).filter((tipo) => tipo.active).forEach((tipo) => {
        const opcao = document.createElement("option");
        opcao.value = tipo.label;
        opcao.textContent = tipo.label;
        els.reqType.appendChild(opcao);
      });
    }
    if (els.reqReceived && !els.reqReceived.value) els.reqReceived.value = new Date().toISOString().slice(0, 10);
    state.requestRows = linhasDaSolicitacao().map((linha) => ({ ...linha, _selected: true }));
    state.requestUndo = [];
    els.requestPanel.hidden = false;
    renderPainelSolicitacao();
    els.requestPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function copiarLinhasDaSolicitacao(comCabecalho) {
    // O que vale é a tabela: ela já traz as edições e as ações em lote.
    const linhas = state.requestRows.filter((linha) => linha._selected !== false);
    if (!linhas.length) return;
    const texto = root.GrconRequestsReport.controlClipboardText(linhas, comCabecalho);
    try {
      await navigator.clipboard.writeText(texto);
      notify(`${linhas.length} linha(s) copiadas${comCabecalho ? " com cabeçalho" : ""}. Cole no Controle de Solicitações.`, "success");
    } catch (_) {
      notify("O navegador bloqueou a cópia automática.", "warn");
    }
  }


  /**
   * Grava a solicitação na área compartilhada. Só grava o que está selecionado
   * na tabela, e o número da solicitação é obrigatório porque é ele que agrupa
   * os itens — sem ele o banco recusa, e com razão.
   */
  async function salvarSolicitacao() {
    const Cloud = root.GrconCloud;
    if (!Cloud || !Cloud.saveRequest) { notify("Área compartilhada indisponível.", "warn"); return; }
    const numero = els.reqNumber ? els.reqNumber.value.trim() : "";
    if (!numero) {
      notify("Informe o número da solicitação antes de salvar.", "warn");
      if (els.reqNumber) els.reqNumber.focus();
      return;
    }
    const itens = state.requestRows.filter((linha) => linha._selected !== false);
    if (!itens.length) { notify("Selecione ao menos um item.", "warn"); return; }

    els.reqSave.disabled = true;
    els.reqSaved.textContent = "Salvando…";
    try {
      const resultado = await Cloud.saveRequest({
        requestNumber: numero,
        receivedAtIso: els.reqReceived ? els.reqReceived.value : "",
        requester: els.reqRequester ? els.reqRequester.value.trim() : "",
        owner: els.reqOwner ? els.reqOwner.value.trim() : "",
        status: "recebido",
      }, itens);
      if (!resultado.ok) {
        els.reqSaved.textContent = "";
        notify(resultado.error, "warn");
        return;
      }
      els.reqSaved.textContent = `${itens.length} item(ns) salvos em ${numero}.`;
      window.dispatchEvent(new CustomEvent("grcon:requests-saved"));
      notify(`Solicitação ${numero} salva com ${itens.length} item(ns).`, "success");
    } finally {
      els.reqSave.disabled = false;
    }
  }


  // ---------------------------------------------------------------------------
  // Painel de acompanhamento
  //
  // Mostra o que está gravado na área compartilhada, não o que está na tela: as
  // alterações feitas aqui valem para todos e passam pelo banco, que registra
  // cada uma no histórico do item.
  // ---------------------------------------------------------------------------
  const STATUS_ABERTOS = new Set(["rascunho", "recebido", "em_triagem", "aguardando_info", "pendente", "em_execucao", "aguardando_validacao"]);

  function rotuloStatus(codigo) {
    const encontrado = R().REQUEST_STATUSES.find((item) => item.code === codigo);
    return encontrado ? encontrado.label : (codigo || "—");
  }

  async function carregarPainel() {
    const Cloud = root.GrconCloud;
    if (!Cloud || !Cloud.listRequestItems) return;
    if (els.painelReload) els.painelReload.disabled = true;
    try {
      state.painelItems = await Cloud.listRequestItems();
      state.painelSelected.clear();
      renderPainel();
    } finally {
      if (els.painelReload) els.painelReload.disabled = false;
    }
  }

  function itensDoPainel() {
    const busca = state.painelSearch.trim().toLowerCase();
    return state.painelItems.filter((item) => {
      if (state.painelStatus && item.status !== state.painelStatus) return false;
      if (state.painelOwner && (item.owner_name || "") !== state.painelOwner) return false;
      if (state.painelQuick === "abertos" && !STATUS_ABERTOS.has(item.status)) return false;
      if (state.painelQuick === "validar" && !item.needs_manual_validation) return false;
      if (state.painelQuick === "novos" && !/novo/i.test(item.classification || "")) return false;
      if (state.painelQuick === "sem-responsavel" && (item.owner_name || "").trim()) return false;
      if (state.painelQuick === "concluidos" && item.status !== "concluido") return false;
      if (busca) {
        const campos = [item.protocol, item.document, item.request_number, item.owner_name, item.type_code, item.requester];
        if (!campos.filter(Boolean).some((valor) => String(valor).toLowerCase().includes(busca))) return false;
      }
      return true;
    });
  }

  function renderPainel() {
    if (!els.painelTbody) return;
    const todos = state.painelItems;
    const visiveis = itensDoPainel();

    // Indicadores: contam o conjunto inteiro, não o filtrado — senão o painel
    // diria que não há pendências só porque o filtro escondeu.
    const conta = (fn) => todos.filter(fn).length;
    const indicadores = [
      ["Itens registrados", todos.length, ""],
      ["Em aberto", conta((i) => STATUS_ABERTOS.has(i.status)), "alerta"],
      ["Aguardando validação", conta((i) => i.needs_manual_validation), "alerta"],
      ["Documentos novos", conta((i) => /novo/i.test(i.classification || "")), ""],
      ["Sem responsável", conta((i) => !(i.owner_name || "").trim()), "erro"],
      ["Concluídos", conta((i) => i.status === "concluido"), "ok"],
    ];
    els.indicators.innerHTML = indicadores.map(([rotulo, valor, classe]) =>
      `<div class="${classe}"><span>${rotulo}</span><strong>${valor.toLocaleString("pt-BR")}</strong></div>`).join("");
    if (els.painelCount) {
      const abertos = conta((i) => STATUS_ABERTOS.has(i.status));
      els.painelCount.hidden = !abertos;
      els.painelCount.textContent = String(abertos);
    }

    els.painelEmpty.hidden = Boolean(todos.length);
    els.painelTableWrap.hidden = !todos.length;

    els.painelTbody.innerHTML = visiveis.map((item) => `<tr${item.needs_manual_validation ? ' class="precisa-validar"' : ""}>
      <td class="requests-col-check"><input aria-label="Selecionar ${escapeHtml(item.protocol)}" data-painel-select="${escapeHtml(item.protocol)}" type="checkbox"${state.painelSelected.has(item.protocol) ? " checked" : ""}/></td>
      <td><strong>${escapeHtml(item.protocol)}</strong></td>
      <td>${escapeHtml(item.request_number || "—")}</td>
      <td><code>${escapeHtml(item.document || "—")}</code></td>
      <td>${escapeHtml(item.type_code || "—")}</td>
      <td>${escapeHtml(item.owner_name || "—")}</td>
      <td>${escapeHtml(rotuloStatus(item.status))}</td>
      <td>${escapeHtml(item.classification || "—")}</td>
      <td>${escapeHtml((item.observations || "").slice(0, 90))}<button class="text-button requests-history-open" data-history="${escapeHtml(item.protocol)}" type="button">Histórico</button></td>
    </tr>`).join("");

    // Listas de filtro montadas a partir do que existe, não de uma lista fixa.
    if (els.painelStatusSelect && els.painelStatusSelect.options.length <= 1) {
      R().REQUEST_STATUSES.forEach((estado) => {
        const opcao = document.createElement("option");
        opcao.value = estado.code; opcao.textContent = estado.label;
        els.painelStatusSelect.appendChild(opcao);
        const outra = opcao.cloneNode(true);
        if (els.painelSetStatus) els.painelSetStatus.appendChild(outra);
      });
    }
    const responsaveis = [...new Set(todos.map((i) => (i.owner_name || "").trim()).filter(Boolean))].sort();
    if (els.painelOwnerSelect && els.painelOwnerSelect.options.length - 1 !== responsaveis.length) {
      els.painelOwnerSelect.innerHTML = '<option value="">Todos</option>' +
        responsaveis.map((nome) => `<option>${escapeHtml(nome)}</option>`).join("");
      els.painelOwnerSelect.value = state.painelOwner;
    }

    els.painelBatch.hidden = !state.painelSelected.size;
    if (els.painelSelectedCount) els.painelSelectedCount.textContent = `${state.painelSelected.size} selecionado(s)`;
  }

  async function aplicarNoPainel() {
    const Cloud = root.GrconCloud;
    if (!Cloud || !Cloud.updateRequestItems) return;
    const protocolos = [...state.painelSelected];
    if (!protocolos.length) return;
    const novoStatus = els.painelSetStatus ? els.painelSetStatus.value : "";
    const novoResponsavel = els.painelSetOwner ? els.painelSetOwner.value.trim() : "";
    const nota = els.painelNote ? els.painelNote.value.trim() : "";
    if (!novoStatus && !novoResponsavel) { notify("Escolha um status ou informe um responsável.", "warn"); return; }

    els.painelApply.disabled = true;
    try {
      // Uma chamada por campo: o banco grava o valor anterior e o novo em cada
      // item, e é isso que permite reconstruir depois quem mudou o quê.
      if (novoStatus) {
        const r = await Cloud.updateRequestItems(protocolos, "status", novoStatus, nota);
        if (!r.ok) { notify(r.error, "warn"); return; }
      }
      if (novoResponsavel) {
        const r = await Cloud.updateRequestItems(protocolos, "owner_name", novoResponsavel, nota);
        if (!r.ok) { notify(r.error, "warn"); return; }
      }
      if (els.painelNote) els.painelNote.value = "";
      notify(`${protocolos.length} item(ns) atualizados para todos.`, "success");
      await carregarPainel();
    } finally {
      els.painelApply.disabled = false;
    }
  }

  function mostrarArea(area) {
    els.areaConsulta.hidden = area !== "consulta";
    els.areaPainel.hidden = area !== "painel";
    els.areaTipos.hidden = area !== "tipos";
    els.areaModelos.hidden = area !== "modelos";
    document.querySelectorAll("[data-requests-area]").forEach((botao) => {
      botao.classList.toggle("active", botao.dataset.requestsArea === area);
    });
    if (area === "painel") carregarPainel();
    if (area === "tipos") carregarTipos();
    if (area === "modelos") carregarModelos();
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


  // ---------------------------------------------------------------------------
  // Histórico do item
  //
  // O banco grava o valor anterior e o novo a cada alteração, e o histórico só
  // recebe inserções. Isto aqui apenas mostra o que já está registrado: editar
  // um item nunca sobrescreve o que havia antes.
  // ---------------------------------------------------------------------------
  function descreverEvento(evento) {
    const campos = {
      status: "Status", owner_name: "Responsável", type_code: "Descrição da solicitação",
      priority: "Prioridade", deadline: "Prazo", observations: "Observações",
      classification: "Classificação", needs_manual_validation: "Precisa de validação",
    };
    if (evento.action === "saved") return "Item gravado";
    const campo = campos[evento.field] || evento.field || "Alteração";
    const de = evento.old_value || "vazio";
    const para = evento.new_value || "vazio";
    return `${campo}: ${de} → ${para}`;
  }

  async function abrirHistorico(protocolo) {
    const Cloud = root.GrconCloud;
    if (!Cloud || !Cloud.requestItemHistory) { notify("Área compartilhada indisponível.", "warn"); return; }
    els.historyProtocol.textContent = protocolo;
    els.historyBody.innerHTML = '<p class="requests-vazio">Carregando…</p>';
    els.history.hidden = false;
    const eventos = await Cloud.requestItemHistory(protocolo);
    if (!eventos.length) {
      els.historyBody.innerHTML = '<p class="requests-vazio">Nenhum registro para este item ainda.</p>';
      return;
    }
    els.historyBody.innerHTML = `<ol class="requests-history-list">${eventos.map((evento) => {
      const quando = evento.created_at ? new Date(evento.created_at).toLocaleString("pt-BR") : "";
      return `<li>
        <span class="requests-history-when">${escapeHtml(quando)}</span>
        <strong>${escapeHtml(descreverEvento(evento))}</strong>
        ${evento.note ? `<span class="requests-history-note">${escapeHtml(evento.note)}</span>` : ""}
      </li>`;
    }).join("")}</ol>`;
  }

  // ---------------------------------------------------------------------------
  // Tipos de solicitação
  //
  // Ficam no banco e valem para a equipe. Excluir um tipo já usado não apaga
  // solicitações antigas: a função do banco desativa em vez de remover, e
  // devolve quantos itens foram preservados.
  // ---------------------------------------------------------------------------
  async function carregarTipos() {
    const Cloud = root.GrconCloud;
    if (Cloud && Cloud.getRequestTypes) {
      const salvos = await Cloud.getRequestTypes();
      state.tipos = R().requestTypeList(salvos && salvos.length ? salvos : null);
    } else {
      state.tipos = R().requestTypeList(null);
    }
    renderTipos();
  }

  function renderTipos() {
    if (!els.tiposTbody) return;
    const dono = ehProprietario();
    els.tiposTbody.innerHTML = state.tipos.map((tipo) => `<tr${tipo.active ? "" : ' class="requests-tipo-inativo"'}>
      <td><strong>${escapeHtml(tipo.label)}</strong></td>
      <td><code>${escapeHtml(tipo.code)}</code></td>
      <td>${escapeHtml(tipo.defaultAction || "—")}</td>
      <td>${tipo.defaultDeadlineDays ? `${tipo.defaultDeadlineDays} dia(s)` : "—"}</td>
      <td>${escapeHtml(tipo.defaultPriority)}</td>
      <td>${tipo.order}</td>
      <td>${tipo.active ? "sim" : "não"}</td>
      <td>${dono ? `<button class="text-button" data-tipo-edit="${escapeHtml(tipo.code)}" type="button">Editar</button>
           <button class="text-button danger" data-tipo-remove="${escapeHtml(tipo.code)}" type="button">Excluir</button>` : ""}</td>
    </tr>`).join("");
    if (els.tiposOwnerNote) els.tiposOwnerNote.hidden = dono;
    if (els.tipoForm) els.tipoForm.hidden = !dono;
  }

  function preencherFormularioTipo(codigo) {
    const tipo = state.tipos.find((item) => item.code === codigo);
    if (!tipo) return;
    els.tipoLabel.value = tipo.label;
    els.tipoCode.value = tipo.code;
    els.tipoAction.value = tipo.defaultAction || "";
    els.tipoDays.value = tipo.defaultDeadlineDays || "";
    els.tipoPriority.value = tipo.defaultPriority;
    els.tipoOrder.value = tipo.order;
    els.tipoLabel.focus();
  }

  async function salvarTipo() {
    const Cloud = root.GrconCloud;
    if (!Cloud || !Cloud.saveRequestType) { notify("Área compartilhada indisponível.", "warn"); return; }
    const rotulo = els.tipoLabel.value.trim();
    if (!rotulo) { notify("Informe o rótulo do tipo.", "warn"); els.tipoLabel.focus(); return; }
    els.tipoSave.disabled = true;
    try {
      // normalizeRequestType gera o código a partir do rótulo quando ele não é
      // informado, para ninguém precisar inventar um identificador.
      const tipo = R().normalizeRequestType({
        label: rotulo,
        code: els.tipoCode.value.trim(),
        defaultAction: els.tipoAction.value.trim(),
        defaultDeadlineDays: els.tipoDays.value,
        defaultPriority: els.tipoPriority.value,
        order: els.tipoOrder.value,
      });
      const resultado = await Cloud.saveRequestType(tipo);
      if (!resultado.ok) { notify(resultado.error, "warn"); return; }
      [els.tipoLabel, els.tipoCode, els.tipoAction, els.tipoDays, els.tipoOrder].forEach((campo) => { campo.value = ""; });
      notify(`Tipo “${tipo.label}” salvo para toda a equipe.`, "success");
      await carregarTipos();
    } finally {
      els.tipoSave.disabled = false;
    }
  }

  async function removerTipo(codigo) {
    const Cloud = root.GrconCloud;
    if (!Cloud || !Cloud.deleteRequestType) { notify("Área compartilhada indisponível.", "warn"); return; }
    const tipo = state.tipos.find((item) => item.code === codigo);
    if (!window.confirm(`Excluir o tipo “${tipo ? tipo.label : codigo}”?\n\nSe ele já estiver em uso, será apenas desativado e as solicitações antigas ficam intactas.`)) return;
    const resultado = await Cloud.deleteRequestType(codigo);
    if (!resultado.ok) { notify(resultado.error, "warn"); return; }
    notify(`Tipo ${resultado.detalhe || "removido"}.`, "success");
    await carregarTipos();
  }

  // ---------------------------------------------------------------------------
  // Ligações
  // ---------------------------------------------------------------------------
  function ligar() {
    els.drop = $("#requests-drop");
    els.ldInput = $("#requests-ld-input");
    els.ldList = $("#requests-ld-list");
    els.ldAdd = $("#requests-ld-add");
    els.ldReuse = $("#requests-ld-reuse");
    els.ldClear = $("#requests-ld-clear");
    els.paste = $("#requests-paste");
    els.pasteAdd = $("#requests-paste-add");
    els.pasteClipboard = $("#requests-paste-clipboard");
    els.docCount = $("#requests-doc-count");
    els.run = $("#requests-run");
    els.runSelected = $("#requests-run-selected");
    els.selectAll = $("#requests-select-all");
    els.selectNone = $("#requests-select-none");
    els.dedupe = $("#requests-dedupe");
    els.copy = $("#requests-copy");
    els.export = $("#requests-export");
    els.undo = $("#requests-undo");
    els.clear = $("#requests-clear");
    els.selectionNote = $("#requests-selection-note");
    els.search = $("#requests-search");
    els.filterSituation = $("#requests-filter-situation");
    els.filterAllocation = $("#requests-filter-allocation");
    els.sortSelect = $("#requests-sort");
    els.progress = $("#requests-progress");
    els.progressFill = $("#requests-progress-fill");
    els.progressText = $("#requests-progress-text");
    els.tableWrap = $("#requests-table-wrap");
    els.tbody = $("#requests-tbody");
    els.checkAll = $("#requests-check-all");
    els.empty = $("#requests-empty");
    els.summary = $("#requests-summary");
    els.toRequest = $("#requests-to-request");
    els.requestPanel = $("#requests-request-panel");
    els.reqNumber = $("#requests-req-number");
    els.reqNextItem = $("#requests-req-next-item");
    els.reqOwner = $("#requests-req-owner");
    els.reqReceived = $("#requests-req-received");
    els.reqRequester = $("#requests-req-requester");
    els.reqType = $("#requests-req-type");
    els.reqOrigin = $("#requests-req-origin");
    els.reqPath = $("#requests-req-path");
    els.reqPreview = $("#requests-req-preview");
    els.reqCopy = $("#requests-req-copy");
    els.reqCopyHeaders = $("#requests-req-copy-headers");
    els.reqClose = $("#requests-req-close");
    els.batchBar = $("#requests-batch-bar");
    els.batchCount = $("#requests-batch-count");
    els.batchType = $("#requests-batch-type");
    els.batchOwner = $("#requests-batch-owner");
    els.batchInclusion = $("#requests-batch-inclusion");
    els.batchNote = $("#requests-batch-note");
    els.batchApply = $("#requests-batch-apply");
    els.batchUndo = $("#requests-batch-undo");
    els.batchTableWrap = $("#requests-batch-table-wrap");
    els.batchTbody = $("#requests-batch-tbody");
    els.batchAll = $("#requests-batch-all");
    els.reqSave = $("#requests-req-save");
    els.reqSaved = $("#requests-req-saved");
    els.areaConsulta = $("#requests-area-consulta");
    els.areaPainel = $("#requests-area-painel");
    els.painelCount = $("#requests-painel-count");
    els.indicators = $("#requests-indicators");
    els.painelTbody = $("#requests-painel-tbody");
    els.painelTableWrap = $("#requests-painel-table-wrap");
    els.painelEmpty = $("#requests-painel-empty");
    els.painelSearch = $("#requests-painel-search");
    els.painelStatusSelect = $("#requests-painel-status");
    els.painelOwnerSelect = $("#requests-painel-owner");
    els.painelClear = $("#requests-painel-clear");
    els.painelReload = $("#requests-painel-reload");
    els.painelAll = $("#requests-painel-all");
    els.painelBatch = $("#requests-painel-batch");
    els.painelSelectedCount = $("#requests-painel-selected");
    els.painelSetStatus = $("#requests-painel-set-status");
    els.painelSetOwner = $("#requests-painel-set-owner");
    els.painelNote = $("#requests-painel-note");
    els.painelApply = $("#requests-painel-apply");
    els.areaTipos = $("#requests-area-tipos");
    els.tipoForm = $("#requests-tipo-form");
    els.tiposOwnerNote = $("#requests-tipos-owner-note");
    els.tiposTbody = $("#requests-tipos-tbody");
    els.tipoLabel = $("#requests-tipo-label");
    els.tipoCode = $("#requests-tipo-code");
    els.tipoAction = $("#requests-tipo-action");
    els.tipoDays = $("#requests-tipo-days");
    els.tipoPriority = $("#requests-tipo-priority");
    els.tipoOrder = $("#requests-tipo-order");
    els.tipoSave = $("#requests-tipo-save");
    els.areaModelos = $("#requests-area-modelos");
    els.modeloSelect = $("#requests-modelo-select");
    els.modeloRepeat = $("#requests-modelo-repeat");
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
    els.history = $("#requests-history");
    els.historyProtocol = $("#requests-history-protocol");
    els.historyBody = $("#requests-history-body");
    els.historyClose = $("#requests-history-close");
    els.step1 = $("#requests-step-1");
    els.step2 = $("#requests-step-2");
    els.step3 = $("#requests-step-3");
    els.step1Note = $("#requests-step-1-note");
    els.step2Note = $("#requests-step-2-note");
    els.step3Note = $("#requests-step-3-note");
    if (!els.drop) return false;

    els.drop.addEventListener("click", () => els.ldInput.click());
    els.drop.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter" || evento.key === " ") { evento.preventDefault(); els.ldInput.click(); }
    });
    els.ldAdd.addEventListener("click", () => els.ldInput.click());
    els.ldInput.addEventListener("change", (evento) => { adicionarLds(evento.target.files); evento.target.value = ""; });
    ["dragenter", "dragover"].forEach((tipo) => els.drop.addEventListener(tipo, (evento) => {
      evento.preventDefault(); els.drop.classList.add("is-over");
    }));
    ["dragleave", "drop"].forEach((tipo) => els.drop.addEventListener(tipo, (evento) => {
      evento.preventDefault(); els.drop.classList.remove("is-over");
    }));
    els.drop.addEventListener("drop", (evento) => adicionarLds(evento.dataTransfer && evento.dataTransfer.files));
    els.ldList.addEventListener("click", (evento) => {
      const botao = evento.target.closest("[data-remove-ld]");
      if (botao) removerLd(botao.dataset.removeLd);
    });
    els.ldClear.addEventListener("click", () => {
      state.lds = [];
      state.index = null;
      state.results.clear();
      render();
      notify("Todas as LDs foram removidas.", "info");
    });

    els.pasteAdd.addEventListener("click", () => adicionarDocumentos(els.paste.value));
    els.pasteClipboard.addEventListener("click", async () => {
      try {
        const texto = await navigator.clipboard.readText();
        if (!texto) { notify("A área de transferência está vazia.", "warn"); return; }
        adicionarDocumentos(texto);
      } catch (_) {
        notify("O navegador bloqueou a leitura da área de transferência. Cole no campo acima.", "warn");
      }
    });
    // Ctrl+Enter no campo de colagem adiciona sem tirar a mão do teclado.
    els.paste.addEventListener("keydown", (evento) => {
      if ((evento.ctrlKey || evento.metaKey) && evento.key === "Enter") { evento.preventDefault(); adicionarDocumentos(els.paste.value); }
    });

    els.run.addEventListener("click", () => consultar(false));
    els.runSelected.addEventListener("click", () => consultar(true));
    els.selectAll.addEventListener("click", () => { state.documents.forEach((item) => { item.selected = true; }); render(); });
    els.selectNone.addEventListener("click", () => { state.documents.forEach((item) => { item.selected = false; }); render(); });
    els.dedupe.addEventListener("click", removerDuplicados);
    els.copy.addEventListener("click", copiarResultados);
    els.export.addEventListener("click", () => exportarExcel());
    els.modeloRepeat.addEventListener("click", repetirUltimaExportacao);
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
    els.undo.addEventListener("click", desfazer);
    els.clear.addEventListener("click", limparConsulta);
    els.toRequest.addEventListener("click", abrirPainelSolicitacao);
    els.reqCopy.addEventListener("click", () => copiarLinhasDaSolicitacao(false));
    els.reqCopyHeaders.addEventListener("click", () => copiarLinhasDaSolicitacao(true));
    els.reqClose.addEventListener("click", () => { els.requestPanel.hidden = true; });
    els.batchApply.addEventListener("click", aplicarEmLote);
    els.batchUndo.addEventListener("click", desfazerLote);
    els.reqSave.addEventListener("click", salvarSolicitacao);
    document.querySelectorAll("[data-requests-area]").forEach((botao) =>
      botao.addEventListener("click", () => mostrarArea(botao.dataset.requestsArea)));
    els.painelReload.addEventListener("click", carregarPainel);
    els.painelApply.addEventListener("click", aplicarNoPainel);
    els.painelSearch.addEventListener("input", (evento) => { state.painelSearch = evento.target.value; renderPainel(); });
    els.painelStatusSelect.addEventListener("change", (evento) => { state.painelStatus = evento.target.value; renderPainel(); });
    els.painelOwnerSelect.addEventListener("change", (evento) => { state.painelOwner = evento.target.value; renderPainel(); });
    els.painelClear.addEventListener("click", () => {
      state.painelQuick = "todos"; state.painelSearch = ""; state.painelStatus = ""; state.painelOwner = "";
      els.painelSearch.value = ""; els.painelStatusSelect.value = ""; els.painelOwnerSelect.value = "";
      document.querySelectorAll("[data-quick]").forEach((chip) => chip.classList.toggle("active", chip.dataset.quick === "todos"));
      renderPainel();
    });
    document.querySelectorAll("[data-quick]").forEach((chip) => chip.addEventListener("click", () => {
      state.painelQuick = chip.dataset.quick;
      document.querySelectorAll("[data-quick]").forEach((outro) => outro.classList.toggle("active", outro === chip));
      renderPainel();
    }));
    els.historyClose.addEventListener("click", () => { els.history.hidden = true; });
    els.painelTbody.addEventListener("click", (evento) => {
      const botao = evento.target.closest("[data-history]");
      if (botao) abrirHistorico(botao.dataset.history);
    });
    els.painelTbody.addEventListener("change", (evento) => {
      const caixa = evento.target.closest("[data-painel-select]");
      if (!caixa) return;
      const protocolo = caixa.dataset.painelSelect;
      if (caixa.checked) state.painelSelected.add(protocolo); else state.painelSelected.delete(protocolo);
      renderPainel();
    });
    els.painelAll.addEventListener("change", () => {
      state.painelSelected.clear();
      if (els.painelAll.checked) itensDoPainel().forEach((item) => state.painelSelected.add(item.protocol));
      renderPainel();
    });
    // Depois de gravar, o painel deixa de estar desatualizado.
    window.addEventListener("grcon:requests-saved", carregarPainel);
    els.tipoSave.addEventListener("click", salvarTipo);
    els.tiposTbody.addEventListener("click", (evento) => {
      const editar = evento.target.closest("[data-tipo-edit]");
      if (editar) { preencherFormularioTipo(editar.dataset.tipoEdit); return; }
      const remover = evento.target.closest("[data-tipo-remove]");
      if (remover) removerTipo(remover.dataset.tipoRemove);
    });
    els.batchAll.addEventListener("change", () => {
      state.requestRows.forEach((linha) => { linha._selected = els.batchAll.checked; });
      renderPainelSolicitacao();
    });
    // Edição direta na tabela: sem abrir cada item numa tela separada.
    els.batchTbody.addEventListener("change", (evento) => {
      const selecao = evento.target.closest("[data-batch-select]");
      if (selecao) {
        const linha = state.requestRows[Number(selecao.dataset.batchSelect)];
        if (linha) { linha._selected = selecao.checked; atualizarContagemLote(); }
        return;
      }
      const campo = evento.target.closest("[data-batch-field]");
      if (!campo) return;
      const linha = state.requestRows[Number(campo.dataset.batchRow)];
      if (linha) linha[campo.dataset.batchField] = campo.value;
    });
    // Mudar o cabeçalho regera as linhas — mas só enquanto não houve edição em
    // lote, para uma correção de data não apagar o trabalho já feito na tabela.
    [els.reqNextItem, els.reqOwner, els.reqReceived, els.reqRequester, els.reqType, els.reqOrigin, els.reqPath]
      .forEach((campo) => campo && campo.addEventListener("input", () => {
        if (state.requestUndo.length) {
          notify("A tabela já foi editada: o cabeçalho não é reaplicado sozinho. Use a barra de ações em lote.", "info");
          return;
        }
        state.requestRows = linhasDaSolicitacao().map((linha) => ({ ...linha, _selected: true }));
        renderPainelSolicitacao();
      }));

    els.tbody.addEventListener("change", (evento) => {
      const caixa = evento.target.closest("[data-select]");
      if (!caixa) return;
      const alvo = state.documents.find((item) => item.id === caixa.dataset.select);
      if (alvo) { alvo.selected = caixa.checked; atualizarAcoes(); }
    });
    els.checkAll.addEventListener("change", () => {
      state.documents.forEach((item) => { item.selected = els.checkAll.checked; });
      render();
    });

    els.search.addEventListener("input", (evento) => { state.search = evento.target.value; render(); });
    els.filterSituation.addEventListener("change", (evento) => { state.situation = evento.target.value; render(); });
    els.filterAllocation.addEventListener("change", (evento) => { state.allocation = evento.target.value; render(); });
    els.sortSelect.addEventListener("change", (evento) => { state.sort = evento.target.value; render(); });

    // Atalhos só valem com a aba aberta, para não brigar com os outros módulos.
    document.addEventListener("keydown", (evento) => {
      const modulo = document.getElementById("requests-module");
      if (!modulo || modulo.hidden) return;
      const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "f") {
        evento.preventDefault(); els.search.focus(); return;
      }
      if ((evento.ctrlKey || evento.metaKey) && evento.key === "Enter" && !digitando) {
        evento.preventDefault(); consultar(false); return;
      }
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "z" && !digitando) {
        evento.preventDefault(); desfazer();
      }
    });

    if (root.GrconLdMemory && root.GrconLdMemory.getLastLd) {
      const ultima = root.GrconLdMemory.getLastLd();
      if (ultima && els.ldReuse) {
        els.ldReuse.hidden = false;
        els.ldReuse.textContent = `Reutilizar “${ultima.name}”`;
        els.ldReuse.addEventListener("click", () => {
          notify("Selecione o arquivo novamente: o navegador não guarda o conteúdo entre sessões, apenas o nome.", "info");
          els.ldInput.click();
        });
      }
    }

    // Os modelos alimentam o seletor da barra de ações, que fica na área da
    // consulta: carregar só ao abrir a aba de modelos deixaria a exportação
    // sem opções até alguém passar por lá.
    carregarModelos();
    atualizarBotaoRepetir();
    render();
    return true;
  }

  root.GrconRequestsUi = Object.freeze({
    init: ligar,
    state,
    // Exposto para os testes de tela conferirem sem depender do DOM.
    _debug: { linhasParaSaida, linhasVisiveis },
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ligar, { once: true });
  } else {
    ligar();
  }
})(window);
