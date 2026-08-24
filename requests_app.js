/**
 * GRCON — Tela de Consulta de documentos
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
    central: null,      // índice da central de alocação, quando anexada
    index: null,
    running: false,
    search: "",
    situation: "",
    allocation: "",
    sort: "entrada",
    undo: [],          // pilha de estados anteriores da lista de documentos
    modelos: [],       // modelos de exportação: embutidos + salvos aqui + da equipe
    modeloEditor: null, // modelo aberto no editor de colunas
  };

  let proximoId = 1;
  const novoId = () => `doc-${proximoId++}`;

  function notify(mensagem, tipo) {
    if (root.GrconNotify) root.GrconNotify(mensagem, tipo || "info");
  }

  const text = (valor) => (valor === null || valor === undefined ? "" : String(valor).trim());

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
  // Central de alocação
  //
  // A aba "Central de alocação" do Controle de Solicitações registra cada ALOC
  // enviada, com o status e o que a fiscal respondeu — inclusive o motivo de
  // um documento não estar alocado. Anexar é opcional: sem ela a consulta
  // responde o que sempre respondeu, e as colunas da fiscal ficam de fora.
  // ---------------------------------------------------------------------------
  function camposDaCentral(documento) {
    const AC = root.GrconAllocationCenter;
    if (!AC || !state.central || !state.central.ok) return {};
    return AC.centerFields(AC.allocationCenterLookup(documento, state.central, C()));
  }

  /**
   * Célula do status da alocação. Distingue três coisas que não podem virar a
   * mesma: sem central anexada, documento que não consta na central, e o
   * status registrado. Dizer "não alocado" em qualquer um dos dois primeiros
   * seria afirmar o que ninguém apurou.
   */
  function celulaCentralStatus(linha) {
    if (!state.central || !state.central.ok) return '<span class="requests-vazio">sem central</span>';
    if (!linha || !linha.centerFound) return '<span class="requests-vazio">não consta na central</span>';
    const extra = linha.centerAllocation
      ? `<small class="requests-multi">${escapeHtml(linha.centerAllocation)}${linha.centerSentAt ? ` · ${escapeHtml(linha.centerSentAt)}` : ""}</small>`
      : "";
    const envios = Number(linha.centerSubmissions) > 1
      ? `<small class="requests-rule">${linha.centerSubmissions} envios; vale o mais recente.</small>` : "";
    return `${escapeHtml(linha.centerStatus) || '<span class="requests-vazio">—</span>'}${extra}${envios}`;
  }

  /** O texto da fiscal sai como está na planilha: sem cortar e sem reescrever. */
  function celulaFiscal(linha) {
    if (!state.central || !state.central.ok) return '<span class="requests-vazio">—</span>';
    if (!linha || !linha.centerFiscalAnswer) return '<span class="requests-vazio">—</span>';
    return escapeHtml(linha.centerFiscalAnswer);
  }

  function renderCentral() {
    if (!els.centralStatus) return;
    const indice = state.central;
    if (!indice) {
      els.centralStatus.textContent = "Nenhuma central anexada. A consulta responde sem as colunas da fiscal.";
      els.centralStatus.classList.remove("tem-erro");
      if (els.centralClear) els.centralClear.hidden = true;
      return;
    }
    if (!indice.ok) {
      els.centralStatus.textContent = indice.error;
      els.centralStatus.classList.add("tem-erro");
      if (els.centralClear) els.centralClear.hidden = false;
      return;
    }
    els.centralStatus.classList.remove("tem-erro");
    els.centralStatus.textContent = `${indice.nomeArquivo} · aba “${indice.sheetName}” · `
      + `${indice.count.toLocaleString("pt-BR")} envio(s) de ALOC para `
      + `${indice.documents.toLocaleString("pt-BR")} documento(s).`;
    if (els.centralClear) els.centralClear.hidden = false;
  }

  async function anexarCentral(file) {
    if (!file) return;
    const AC = root.GrconAllocationCenter;
    if (!AC) { notify("O leitor da central não está disponível.", "warn"); return; }
    try {
      await root.GRCONModuleLoader.ensure("xlsx");
      const buffer = root.GrconFileAccess
        ? await root.GrconFileAccess.read(file, { context: "o Controle de Solicitações", retries: 1 })
        : await file.arrayBuffer();
      // cellDates é obrigatório: a escolha do envio mais recente compara datas,
      // e sem isto elas chegariam como texto e a ordem sairia errada.
      const workbook = root.XLSX.read(buffer, { type: "array", cellDates: true, cellStyles: false });
      const indice = AC.parseAllocationCenter(workbook, { xlsx: root.XLSX, core: C() });
      indice.nomeArquivo = file.name;
      state.central = indice;
      renderCentral();
      if (!indice.ok) { notify(indice.error, "warn"); return; }
      notify(`Central lida: ${indice.count} envio(s) para ${indice.documents} documento(s).`, "success");
      // Já havia consulta na tela: refaz para as colunas novas aparecerem sem
      // obrigar a pessoa a consultar tudo de novo.
      if (state.results.size) await consultar(false);
    } catch (erro) {
      state.central = { ok: false, error: (erro && erro.message) || "Não foi possível ler esta planilha.", nomeArquivo: file.name };
      renderCentral();
      notify(state.central.error, "error");
    }
  }

  async function removerCentral() {
    state.central = null;
    renderCentral();
    if (state.results.size) await consultar(false);
    notify("Central de alocação removida.", "info");
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

    // A sincronização compartilhada pode ter atualizado o histórico depois que
    // a aba abriu. Uma única reindexação antes do lote garante eGRDT e revisão
    // atuais sem reler os mesmos registros para cada documento consultado.
    root.GrconGrdtHistoryIndicator?.refresh?.();

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
        state.results.set(item.id, {
          ...R().consultationRow(resultado),
          ...R().issuedColumns(historicoDoGrcon(resultado, item.document)),
          ...camposDaCentral(item.document),
        });
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

  /**
   * O que o histórico do próprio GRCON sabe sobre o documento: em que eGRDT ele
   * já saiu, quando e em qual revisão. Procura primeiro pela grafia da LD, que
   * é a que vai para a eGRDT, e só depois pelo código informado.
   */
  function historicoDoGrcon(resultado, informado) {
    const Indicador = root.GrconGrdtHistoryIndicator;
    if (!Indicador || typeof Indicador.getEntries !== "function") return [];
    const candidatos = [
      resultado && resultado.chosen && resultado.chosen.document,
      resultado && resultado.ldDocument,
      informado,
    ].map(text).filter(Boolean);
    for (const candidato of [...new Set(candidatos)]) {
      const entradas = Indicador.getEntries(candidato);
      if (entradas && entradas.length) return entradas;
    }
    return [];
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

  /**
   * A eGRDT em que o documento já saiu, com a data logo abaixo do número.
   * Sem consulta ainda, a célula fica em branco; consultado e sem registro,
   * ela diz "não emitido" — que é resposta, não ausência dela.
   */
  function celulaEmitido(linha) {
    if (!linha) return '<span class="requests-vazio">—</span>';
    if (!linha.issuedEgrdt) return '<span class="requests-nao-emitido">Não emitido</span>';
    const anteriores = Number(linha.issuedCount) > 1
      ? `<small class="requests-multi">+${Number(linha.issuedCount) - 1} anterior(es)</small>`
      : "";
    const titulo = (linha.issuedAll || []).map((item) => `${item.egrdt}${item.revision ? ` — Rev. ${item.revision}` : " — revisão não registrada"}${item.date ? ` — ${item.date}` : ""}`).join("\n");
    return `<span class="requests-emitido" title="${escapeHtml(titulo)}">
      <strong>${escapeHtml(linha.issuedEgrdt)}</strong>
      ${linha.issuedAt ? `<small>${escapeHtml(linha.issuedAt)}</small>` : ""}
      ${anteriores}
    </span>`;
  }

  /** Revisão vinculada à mesma eGRDT mostrada na coluna anterior. */
  function celulaRevisaoEmitida(linha) {
    if (!linha) return '<span class="requests-vazio">—</span>';
    if (!linha.issuedEgrdt) return '<span class="requests-nao-emitido">Não emitido</span>';
    if (!linha.issuedRevision) return '<span class="requests-revisao-ausente">Não registrada no histórico</span>';
    return `<span class="requests-revisao-emitida" title="Revisão registrada pelo GRCON na ${escapeHtml(linha.issuedEgrdt)}">
      <strong>Rev. ${escapeHtml(linha.issuedRevision)}</strong>
      <small>${escapeHtml(linha.issuedEgrdt)}</small>
    </span>`;
  }

  /** Revisão mais alta localizada diretamente na aba Colar SIGEM da LD. */
  function celulaRevisaoColarSigem(linha) {
    if (!linha) return '<span class="requests-vazio">—</span>';
    if (!linha.sigemLdRevision) return '<span class="requests-nao-emitido">Não encontrado</span>';
    const anteriores = Number(linha.sigemLdRevisionCount) > 1
      ? `<small class="requests-multi">+${Number(linha.sigemLdRevisionCount) - 1} anterior(es)</small>`
      : "";
    const titulo = (linha.sigemLdRevisionAll || []).map((item) => `Rev. ${item.revision}${item.status ? ` — ${item.status}` : ""}`).join("\n");
    return `<span class="requests-revisao-emitida" title="${escapeHtml(titulo || linha.sigemLdRevisionLabel || "Revisão encontrada na Colar SIGEM")}">
      <strong>Rev. ${escapeHtml(linha.sigemLdRevision)}</strong>
      <small>Colar SIGEM</small>
      ${anteriores}
    </span>`;
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
        <td class="requests-col-revisao-colar-sigem">${celulaRevisaoColarSigem(linha)}</td>
        <td>${linha && linha.allocated ? escapeHtml(linha.allocated) : '<span class="requests-vazio">—</span>'}</td>
        <td>${linha && linha.lastGrdt ? escapeHtml(linha.lastGrdt) : '<span class="requests-vazio">—</span>'}</td>
        <td class="requests-col-emitido">${celulaEmitido(linha)}</td>
        <td class="requests-col-revisao-emitida">${celulaRevisaoEmitida(linha)}</td>
        <td>${linha && linha.sigemStatus ? escapeHtml(linha.sigemStatus) : '<span class="requests-vazio">—</span>'}</td>
        <td class="requests-col-central">${celulaCentralStatus(linha)}</td>
        <td class="requests-col-fiscal">${celulaFiscal(linha)}</td>
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
          sigemLdRevision: linha.sigemLdRevision,
          sigemLdRevisionCell: linha.sigemLdRevisionCell,
          allocated: linha.allocated,
          allocation: linha.allocation,
          lastGrdt: linha.lastGrdt,
          issued: linha.issued,
          issuedCell: linha.issuedCell,
          issuedEgrdt: linha.issuedEgrdt,
          issuedAt: linha.issuedAt,
          issuedRevision: linha.issuedRevision,
          issuedRevisionCell: linha.issuedRevisionCell,
          sigemStatus: linha.sigemStatus,
          // Central de alocação: saem vazias quando nenhuma central foi
          // anexada, e é assim que devem sair — a planilha não pode afirmar
          // "não alocado" por ausência de fonte.
          centerStatus: linha.centerStatus,
          centerFiscalAnswer: linha.centerFiscalAnswer,
          centerAllocationCell: linha.centerAllocationCell,
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
    // Uma célula pode ter mais de uma linha (a eGRDT emitida traz a data
    // embaixo). Numa colagem por tabulação isso viraria uma linha nova na
    // planilha, então aqui as quebras viram separadores.
    const celula = (valor) => String(valor === null || valor === undefined ? "" : valor).replace(/\s*\n\s*/g, " · ");
    const corpo = linhas.map((linha) => Report.COLUMNS.map((coluna) => celula(linha[coluna.key])).join("\t")).join("\n");
    try {
      await navigator.clipboard.writeText(`${cabecalho}\n${corpo}`);
      notify(`${linhas.length} linha(s) copiadas. Cole direto na planilha.`, "success");
    } catch (_) {
      notify("O navegador bloqueou a cópia automática. Use a exportação para Excel.", "warn");
    }
  }

  async function exportarExcel(modeloEscolhido) {
    const Report = root.GrconRequestsReport;
    const modelo = Report.normalizeExportTemplate(modeloEscolhido || modeloAtual());
    const linhas = linhasParaSaida();
    if (!linhas.length) {
      notify("Consulte os documentos antes de exportar.", "warn");
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
      const sheet = workbook.addWorksheet("Consulta", { properties: { defaultRowHeight: 20 }, views: [{ showGridLines: false, zoomScale: 85 }] });
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
      link.download = `GRCON_CONSULTA_${carimbo}.xlsx`;
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
    const linhas = linhasParaSaida();
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
    els.drop = $("#requests-drop");
    els.ldInput = $("#requests-ld-input");
    els.ldList = $("#requests-ld-list");
    els.ldAdd = $("#requests-ld-add");
    els.centralAdd = $("#requests-central-add");
    els.centralInput = $("#requests-central-input");
    els.centralClear = $("#requests-central-clear");
    els.centralStatus = $("#requests-central-status");
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
    els.areaConsulta = $("#requests-area-consulta");
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
    if (els.centralAdd) {
      els.centralAdd.addEventListener("click", () => els.centralInput.click());
      els.centralInput.addEventListener("change", (evento) => {
        anexarCentral(evento.target.files && evento.target.files[0]);
        evento.target.value = "";
      });
      els.centralClear.addEventListener("click", removerCentral);
    }
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
    document.querySelectorAll("[data-requests-area]").forEach((botao) =>
      botao.addEventListener("click", () => mostrarArea(botao.dataset.requestsArea)));

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
