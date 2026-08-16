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

  async function exportarExcel() {
    const linhas = linhasParaSaida();
    if (!linhas.length) return;
    els.export.disabled = true;
    try {
      await root.GRCONModuleLoader.ensure("excel");
      await root.GRCONModuleLoader.ensure("brand");
      const workbook = new root.ExcelJS.Workbook();
      workbook.creator = "GRCON";
      workbook.company = "CONSAG Engenharia";
      workbook.title = "Consulta de documentos GRCON";
      const sheet = workbook.addWorksheet("Consulta", { properties: { defaultRowHeight: 20 }, views: [{ showGridLines: false, zoomScale: 85 }] });
      const nomes = state.lds.filter((item) => !item.error).map((item) => item.name).join(" · ");
      root.GrconRequestsReport.writeConsultationSheet(sheet, linhas, {
        metadata: `${linhas.length.toLocaleString("pt-BR")} documento(s) · ${new Date().toLocaleString("pt-BR")}`,
        ldNames: nomes,
      });
      // Mesmo logo, mesmo construtor das planilhas da Triagem.
      await root.GrconRequestsReport.attachBrandLogo(workbook, sheet, root.GRCONBrandAssets, root.fetch.bind(root));
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const carimbo = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      link.href = url;
      link.download = `GRCON_CONSULTA_${carimbo}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      notify(`Planilha gerada com ${linhas.length} documento(s).`, "success");
    } catch (erro) {
      notify((erro && erro.message) || "Não foi possível gerar a planilha.", "error");
    } finally {
      els.export.disabled = false;
    }
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
    els.export.addEventListener("click", exportarExcel);
    els.undo.addEventListener("click", desfazer);
    els.clear.addEventListener("click", limparConsulta);
    els.toRequest.addEventListener("click", abrirPainelSolicitacao);
    els.reqCopy.addEventListener("click", () => copiarLinhasDaSolicitacao(false));
    els.reqCopyHeaders.addEventListener("click", () => copiarLinhasDaSolicitacao(true));
    els.reqClose.addEventListener("click", () => { els.requestPanel.hidden = true; });
    els.batchApply.addEventListener("click", aplicarEmLote);
    els.batchUndo.addEventListener("click", desfazerLote);
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
