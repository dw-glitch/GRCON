/**
 * GRCON — Motor de Consultas e Solicitações
 *
 * Camada sem interface: consulta de documentos nas LDs, protocolos, tipos de
 * solicitação e a classificação da triagem. Fica separada da tela porque é a
 * parte que precisa ser testada sozinha, e porque o mesmo motor atende tanto a
 * consulta rápida quanto a triagem das solicitações.
 *
 * Duas regras atravessam o arquivo inteiro e explicam quase todas as decisões:
 *
 *   1. Nunca inventar. Quando a identificação não é confiável, o resultado diz
 *      "não localizado" ou "requer validação manual" — nunca um palpite.
 *   2. Nunca casar por semelhança. A correspondência usa o código completo e
 *      normalizado (com a regra do nt- do próprio motor de triagem). Título
 *      parecido ou pedaço de código não geram correspondência.
 */
(function (root, factory) {
  const C = root.TriagemCore || (typeof module === "object" && module.exports ? require("./core.js") : null);
  const api = factory(C);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconRequestsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (C) {
  "use strict";

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function norm(value) {
    return C && C.norm ? C.norm(value) : text(value).toUpperCase();
  }

  // ---------------------------------------------------------------------------
  // Tipos de solicitação
  //
  // Ficam no banco e são editáveis pelo usuário. Esta lista é só a semente da
  // primeira carga: nada aqui é obrigatório e nada é fixo no código, senão a
  // área de configuração não teria sentido.
  // ---------------------------------------------------------------------------
  const DEFAULT_REQUEST_TYPES = Object.freeze([
    { code: "POSTAGEM", label: "Postagem de documento", defaultAction: "Postar no SIGEM", defaultDeadlineDays: 3, defaultPriority: "normal", order: 1 },
    { code: "TITULO", label: "Alteração ou correção de título", defaultAction: "Conferir o título oficial na LD", defaultDeadlineDays: 5, defaultPriority: "normal", order: 2 },
    { code: "INCLUSAO_LD", label: "Inclusão na LD", defaultAction: "Analisar a inclusão e a alocação", defaultDeadlineDays: 10, defaultPriority: "normal", order: 3 },
    { code: "REVISAO", label: "Emissão ou atualização de revisão", defaultAction: "Atualizar a revisão e postar", defaultDeadlineDays: 5, defaultPriority: "normal", order: 4 },
    { code: "LINHA_TEMPO", label: "Atualização da linha do tempo", defaultAction: "Atualizar a linha do tempo na LD", defaultDeadlineDays: 5, defaultPriority: "baixa", order: 5 },
    { code: "ALOCACAO", label: "Alocação", defaultAction: "Regularizar a alocação na LD", defaultDeadlineDays: 7, defaultPriority: "alta", order: 6 },
    { code: "STATUS", label: "Consulta de status", defaultAction: "Responder a situação atual", defaultDeadlineDays: 2, defaultPriority: "baixa", order: 7 },
    { code: "CORRECAO", label: "Correção de informações", defaultAction: "Corrigir o cadastro na LD", defaultDeadlineDays: 5, defaultPriority: "normal", order: 8 },
    { code: "CANCELAMENTO", label: "Cancelamento", defaultAction: "Cancelar conforme solicitado", defaultDeadlineDays: 3, defaultPriority: "normal", order: 9 },
    { code: "SUBSTITUICAO", label: "Substituição", defaultAction: "Substituir o documento indicado", defaultDeadlineDays: 5, defaultPriority: "normal", order: 10 },
  ]);

  const PRIORITIES = Object.freeze(["baixa", "normal", "alta", "urgente"]);

  const REQUEST_STATUSES = Object.freeze([
    { code: "rascunho", label: "Rascunho", open: true },
    { code: "recebido", label: "Recebido", open: true },
    { code: "em_triagem", label: "Em triagem", open: true },
    { code: "aguardando_info", label: "Aguardando informação", open: true },
    { code: "pendente", label: "Pendente", open: true },
    { code: "em_execucao", label: "Em execução", open: true },
    { code: "aguardando_validacao", label: "Aguardando validação", open: true },
    { code: "concluido", label: "Concluído", open: false },
    { code: "cancelado", label: "Cancelado", open: false },
  ]);

  function normalizeRequestType(raw) {
    const source = raw || {};
    const label = text(source.label);
    if (!label) return null;
    const code = text(source.code).toUpperCase().replace(/[^A-Z0-9_]/g, "_")
      || norm(label).replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32);
    if (!code) return null;
    const priority = PRIORITIES.includes(text(source.defaultPriority).toLowerCase())
      ? text(source.defaultPriority).toLowerCase()
      : "normal";
    const days = Number(source.defaultDeadlineDays);
    return {
      code,
      label,
      description: text(source.description),
      defaultAction: text(source.defaultAction),
      defaultPriority: priority,
      // Sem prazo padrão é uma resposta válida: nem todo tipo tem prazo.
      defaultDeadlineDays: Number.isFinite(days) && days > 0 ? Math.trunc(days) : null,
      requiredFields: Array.isArray(source.requiredFields) ? source.requiredFields.map(text).filter(Boolean) : [],
      active: source.active === undefined ? true : Boolean(source.active),
      order: Number(source.order) || 0,
    };
  }

  function requestTypeList(saved) {
    const list = (Array.isArray(saved) && saved.length ? saved : DEFAULT_REQUEST_TYPES)
      .map(normalizeRequestType)
      .filter(Boolean);
    return list.sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label, "pt-BR"));
  }

  // ---------------------------------------------------------------------------
  // Protocolo
  //
  // Cada ITEM tem protocolo próprio, não a solicitação: uma solicitação com dez
  // documentos rende dez protocolos, porque é o item que é acompanhado,
  // concluído e cobrado individualmente.
  // ---------------------------------------------------------------------------
  function protocolFor(requestNumber, itemNumber, year) {
    const request = text(requestNumber).toUpperCase().replace(/\s+/g, "");
    const item = Math.max(1, Math.trunc(Number(itemNumber) || 1));
    const ano = Math.trunc(Number(year)) || new Date().getFullYear();
    if (!request) return "";
    return `${request}-${String(item).padStart(3, "0")}/${ano}`;
  }

  /**
   * Próximo número de item livre. Recebe os itens que já existem para não
   * repetir protocolo nem quando o usuário apaga um item do meio da lista.
   */
  function nextItemNumber(existingItems) {
    const usados = (existingItems || [])
      .map((item) => Math.trunc(Number(item && item.itemNumber)))
      .filter((value) => Number.isFinite(value) && value > 0);
    return usados.length ? Math.max(...usados) + 1 : 1;
  }

  function duplicatedProtocols(items) {
    const contagem = new Map();
    (items || []).forEach((item) => {
      const protocolo = text(item && item.protocol);
      if (!protocolo) return;
      contagem.set(protocolo, (contagem.get(protocolo) || 0) + 1);
    });
    return [...contagem.entries()].filter(([, quantas]) => quantas > 1).map(([protocolo]) => protocolo);
  }

  // ---------------------------------------------------------------------------
  // Entrada de documentos
  // ---------------------------------------------------------------------------

  /**
   * Lê uma lista colada, um documento por linha. Também aceita as colagens que
   * vêm de planilha, em que a linha traz código e título separados por tabulação
   * — nesse caso o que vem depois da primeira tabulação é tratado como o título
   * informado pelo solicitante, e não como parte do código.
   */
  function parseDocumentList(rawText) {
    const linhas = String(rawText || "").split(/\r?\n/);
    const itens = [];
    linhas.forEach((linha, indice) => {
      const conteudo = linha.trim();
      if (!conteudo) return;
      const partes = conteudo.split("\t");
      const documento = text(partes[0]);
      if (!documento) return;
      itens.push({
        document: documento,
        requestedTitle: text(partes.slice(1).join(" ")),
        sourceLine: indice + 1,
      });
    });
    return itens;
  }

  /**
   * Remove repetições pelo código normalizado, preservando a primeira ocorrência
   * e o título informado quando a primeira linha veio sem ele. Devolve também o
   * que saiu, para a tela poder mostrar o que foi descartado em vez de sumir com
   * as linhas silenciosamente.
   */
  function dedupeDocuments(items) {
    const vistos = new Map();
    const mantidos = [];
    const removidos = [];
    (items || []).forEach((item) => {
      const chave = C && C.key ? C.key(item && item.document) : norm(item && item.document);
      if (!chave) return;
      if (vistos.has(chave)) {
        const anterior = vistos.get(chave);
        if (!anterior.requestedTitle && item.requestedTitle) anterior.requestedTitle = item.requestedTitle;
        removidos.push(item);
        return;
      }
      const copia = { ...item };
      vistos.set(chave, copia);
      mantidos.push(copia);
    });
    return { items: mantidos, removed: removidos };
  }

  // ---------------------------------------------------------------------------
  // Consulta nas LDs
  // ---------------------------------------------------------------------------

  function occurrenceFrom(record) {
    const estado = C && C.allocationState ? C.allocationState(record.allocationStatus) : { kind: "empty", label: "Não informado" };
    return {
      document: text(record.document),
      // O título sai exatamente como está na LD: sem maiúsculas forçadas, sem
      // mexer em acento, símbolo ou pontuação.
      title: text(record.title),
      allocationStatus: text(record.allocationStatus),
      allocationKind: estado.kind,
      allocationLabel: estado.label,
      allocation: text(record.allocation),
      lastGrdt: text(record.grdt),
      sigemStatus: text(record.sigemStatus),
      revision: text(record.revision),
      ld: text(record.source),
      ldVersion: text(record.ldVersion),
      sheet: text(record.sheet),
      row: Number(record.row) || null,
      sourceTimestamp: Number(record.sourceTimestamp) || 0,
    };
  }

  /**
   * Escolhe a ocorrência considerada correta quando o documento aparece em mais
   * de uma LD, e explica a regra aplicada. A escolha nunca combina campos de
   * LDs diferentes: uma ocorrência inteira é eleita, e as outras seguem
   * visíveis para conferência.
   */
  function chooseOccurrence(occurrences) {
    if (!occurrences.length) return { chosen: null, rule: "", conflicting: false };
    if (occurrences.length === 1) {
      return { chosen: occurrences[0], rule: "Única ocorrência localizada.", conflicting: false };
    }
    // Divergência é sobre o que a consulta responde. Duas LDs com o mesmo
    // conteúdo não são conflito, são repetição.
    const assinatura = (item) => [item.title, item.allocationKind, item.lastGrdt, item.sigemStatus, item.revision].join("|");
    const divergem = new Set(occurrences.map(assinatura)).size > 1;

    const ordenadas = [...occurrences].sort((a, b) => b.sourceTimestamp - a.sourceTimestamp);
    const maisRecente = ordenadas[0];
    const empatadas = ordenadas.filter((item) => item.sourceTimestamp === maisRecente.sourceTimestamp);

    if (!divergem) {
      return { chosen: maisRecente, rule: `Localizado em ${occurrences.length} LDs com a mesma informação.`, conflicting: false };
    }
    if (empatadas.length > 1) {
      // Sem critério para desempatar, quem decide é a pessoa.
      return {
        chosen: null,
        rule: `As LDs divergem e têm a mesma data de envio (${empatadas.map((item) => item.ld).join(", ")}). Escolha qual vale.`,
        conflicting: true,
      };
    }
    return {
      chosen: maisRecente,
      rule: `As LDs divergem. Considerada a mais recente: ${maisRecente.ld}. Confirme ou troque.`,
      conflicting: true,
    };
  }

  /**
   * Consulta um documento no índice montado a partir de todas as LDs anexadas.
   *
   * O índice do GRCON já resolve a regra do nt- (documentos ET) e uma
   * aproximação controlada do TAG que só vale quando existe uma única
   * correspondência. Ambas rebaixam a confiança do resultado, porque o código
   * informado não era exatamente o da LD.
   */
  function lookupDocument(document, index, options) {
    const settings = options || {};
    const informado = text(document);
    const base = {
      document: informado,
      requestedTitle: text(settings.requestedTitle),
      found: false,
      confidence: "nenhuma",
      needsManualValidation: true,
      occurrences: [],
      chosen: null,
      rule: "",
      conflicting: false,
      lookup: null,
      message: "Não localizado nas LDs anexadas.",
    };
    if (!informado || !index || !C) return base;

    const matches = C.matchDocuments(informado, index, settings.hintedSheet) || [];
    const primeiro = matches[0] || null;
    const lookup = C.documentLookup ? C.documentLookup(informado, matches.length === 1 ? primeiro : null, matches) : null;

    if (!primeiro) {
      return { ...base, lookup, message: lookup && lookup.message ? lookup.message : base.message };
    }

    // Todas as linhas do grupo: é isto que responde "em quais LDs foi achado".
    const registros = (primeiro.group && primeiro.group.records) || [];
    const occurrences = registros.map(occurrenceFrom);
    const { chosen, rule, conflicting } = chooseOccurrence(occurrences);

    const porVariante = Boolean(primeiro.matchKind && primeiro.matchKind !== "exact");
    const confidence = conflicting || !chosen
      ? "baixa"
      : porVariante
        ? "media"
        : occurrences.length > 1 ? "media" : "alta";

    return {
      document: informado,
      requestedTitle: text(settings.requestedTitle),
      found: true,
      confidence,
      // Só a confiança alta dispensa conferência; qualquer variação de código ou
      // divergência entre LDs volta para a pessoa decidir.
      needsManualValidation: confidence !== "alta",
      occurrences,
      chosen,
      rule,
      conflicting,
      matchKind: primeiro.matchKind || "exact",
      ldDocument: text(primeiro.document),
      lookup,
      message: lookup && lookup.message ? lookup.message : "",
    };
  }

  function lookupDocuments(documents, index, options) {
    return (documents || []).map((item) => {
      const documento = typeof item === "string" ? item : text(item && item.document);
      const titulo = typeof item === "string" ? "" : text(item && item.requestedTitle);
      return lookupDocument(documento, index, { ...(options || {}), requestedTitle: titulo });
    });
  }

  /**
   * As seis colunas que a consulta rápida responde, já prontas para a tela e
   * para o Excel. Quando não há ocorrência eleita, os campos ficam vazios em vez
   * de receberem o valor de uma LD qualquer.
   */
  function consultationRow(resultado) {
    const escolhida = resultado && resultado.chosen;
    const todas = (resultado && resultado.occurrences) || [];
    return {
      document: text(resultado && resultado.document),
      title: escolhida ? escolhida.title : "",
      allocated: escolhida
        ? (escolhida.allocationKind === "allocated" ? "SIM — Alocado"
          : escolhida.allocationKind === "not_allocated" ? "NÃO — Não alocado"
            : `REVISAR — ${escolhida.allocationLabel}`)
        : "",
      allocation: escolhida ? escolhida.allocation : "",
      lastGrdt: escolhida ? escolhida.lastGrdt : "",
      sigemStatus: escolhida ? escolhida.sigemStatus : "",
      ld: escolhida ? escolhida.ld : "",
      allLds: [...new Set(todas.map((item) => item.ld).filter(Boolean))].join(" | "),
      occurrenceCount: todas.length,
      confidence: resultado ? resultado.confidence : "nenhuma",
      needsManualValidation: Boolean(resultado && resultado.needsManualValidation),
      rule: text(resultado && resultado.rule),
      situation: !resultado || !resultado.found
        ? "Não localizado"
        : resultado.conflicting || !escolhida
          ? "Requer validação manual"
          : "Localizado",
    };
  }

  return Object.freeze({
    DEFAULT_REQUEST_TYPES,
    PRIORITIES,
    REQUEST_STATUSES,
    normalizeRequestType,
    requestTypeList,
    protocolFor,
    nextItemNumber,
    duplicatedProtocols,
    parseDocumentList,
    dedupeDocuments,
    lookupDocument,
    lookupDocuments,
    consultationRow,
    chooseOccurrence,
  });
});
