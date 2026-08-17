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
  // O motor documental é resolvido na hora do uso, não aqui: no navegador este
  // arquivo pode ser avaliado antes de core.js, e capturar a referência agora
  // deixaria C nulo para sempre — a busca devolveria "não localizado" para tudo,
  // silenciosamente, mesmo com o documento na LD.
  const resolveCore = () => root.TriagemCore
    || (typeof module === "object" && module.exports ? require("./core.js") : null);
  const api = factory(resolveCore);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconRequestsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (resolveCore) {
  "use strict";

  // Açúcar para o corpo do módulo continuar lendo como antes.
  const core = () => resolveCore();

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function norm(value) {
    return core() && core().norm ? core().norm(value) : text(value).toUpperCase();
  }

  // ---------------------------------------------------------------------------
  // Tipos de solicitação
  //
  // Ficam no banco e são editáveis pelo usuário. Esta lista é só a semente da
  // primeira carga: nada aqui é obrigatório e nada é fixo no código, senão a
  // área de configuração não teria sentido.
  // ---------------------------------------------------------------------------
  // Os rótulos são os que já aparecem na coluna "Descrição da Solicitação" do
  // Controle de Solicitações, na ordem de frequência real: POSTAGEM NO SIGEM
  // responde por dois terços dos pedidos, ALOCAÇÃO e INCLUSÃO NA LD vêm em
  // seguida. Manter a grafia da planilha evita ter de traduzir na exportação.
  const DEFAULT_REQUEST_TYPES = Object.freeze([
    { code: "POSTAGEM_SIGEM", label: "POSTAGEM NO SIGEM", defaultAction: "Postar no SIGEM", defaultDeadlineDays: 3, defaultPriority: "normal", order: 1 },
    { code: "ALOCACAO", label: "ALOCAÇÃO", defaultAction: "Providenciar a alocação", defaultDeadlineDays: 7, defaultPriority: "alta", order: 2 },
    { code: "INCLUSAO_LD", label: "INCLUSÃO NA LD", defaultAction: "Analisar a inclusão na LD", defaultDeadlineDays: 10, defaultPriority: "normal", order: 3 },
    { code: "INCLUSAO_E_ALOCACAO", label: "INCLUIR NA LD E FAZER ALOCAÇÃO", defaultAction: "Incluir na LD e providenciar a alocação", defaultDeadlineDays: 10, defaultPriority: "alta", order: 4 },
    { code: "IMPRESSAO", label: "IMPRESSÃO", defaultAction: "Imprimir conforme solicitado", defaultDeadlineDays: 2, defaultPriority: "normal", order: 5 },
    { code: "ALTERACAO_TITULO", label: "ALTERAÇÃO DO TITULO", defaultAction: "Conferir o título oficial na LD antes de alterar", defaultDeadlineDays: 5, defaultPriority: "normal", order: 6 },
    { code: "CORRECAO_ALOCACAO", label: "CORREÇÃO DE ALOCAÇÃO", defaultAction: "Corrigir a alocação registrada", defaultDeadlineDays: 5, defaultPriority: "normal", order: 7 },
    { code: "CORRECAO_LD", label: "CORREÇÃO LD", defaultAction: "Corrigir o cadastro na LD", defaultDeadlineDays: 5, defaultPriority: "normal", order: 8 },
    { code: "INCLUSAO_CV", label: "INCLUSÃO DE CV", defaultAction: "Incluir o currículo na LD", defaultDeadlineDays: 5, defaultPriority: "normal", order: 9 },
    { code: "POSTAGEM_E_INCLUSAO", label: "POSTAGEM NO SIGEM / INCLUSÃO NA LD", defaultAction: "Incluir na LD e postar no SIGEM", defaultDeadlineDays: 7, defaultPriority: "normal", order: 10 },
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
  // O protocolo É o número do ITEM da planilha oficial de Controle de
  // Solicitações: um sequencial simples e contínuo, que na planilha em uso vai
  // de 1 a 556 sem falha. Não é composto por número de solicitação nem por ano.
  //
  // A sequência é global da planilha, não reinicia por solicitação: uma
  // solicitação com dez documentos consome dez números seguidos, porque é o
  // item que é acompanhado, concluído e cobrado individualmente.
  // ---------------------------------------------------------------------------
  function protocolFor(itemNumber) {
    const item = Math.trunc(Number(itemNumber));
    return Number.isFinite(item) && item > 0 ? String(item) : "";
  }

  /**
   * Próximo item livre, continuando a sequência da planilha. Recebe os itens
   * que já existem — inclusive os importados do controle oficial — para nunca
   * reaproveitar um número, nem quando alguém apaga um item do meio da lista.
   */
  function nextItemNumber(existingItems) {
    const usados = (existingItems || [])
      .map((item) => Math.trunc(Number(
        item && item.itemNumber !== undefined ? item.itemNumber : item && item.protocol
      )))
      .filter((value) => Number.isFinite(value) && value > 0);
    return usados.length ? Math.max(...usados) + 1 : 1;
  }

  /**
   * Numera uma leva de documentos a partir do próximo item livre, devolvendo
   * cada um já com o seu protocolo.
   */
  function assignItemNumbers(documents, existingItems) {
    let proximo = nextItemNumber(existingItems);
    return (documents || []).map((item) => {
      const numero = proximo;
      proximo += 1;
      return { ...item, itemNumber: numero, protocol: protocolFor(numero) };
    });
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
      const chave = core() && core().key ? core().key(item && item.document) : norm(item && item.document);
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
    const estado = core() && core().allocationState ? core().allocationState(record.allocationStatus) : { kind: "empty", label: "Não informado" };
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
    if (!informado || !index || !core()) return base;

    const matches = core().matchDocuments(informado, index, settings.hintedSheet) || [];
    const primeiro = matches[0] || null;
    const lookup = core().documentLookup ? core().documentLookup(informado, matches.length === 1 ? primeiro : null, matches) : null;

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

  // ---------------------------------------------------------------------------
  // Triagem das solicitações
  //
  // Classifica cada item a partir do que a LD respondeu. Toda classificação é
  // uma SUGESTÃO: sai com o motivo por extenso e pode ser trocada na tela. O
  // motor nunca conclui sozinho um caso que dependa de decisão.
  // ---------------------------------------------------------------------------
  const CLASSIFICATIONS = Object.freeze({
    NOVO: "Documento novo",
    PREVISTO_NAO_POSTADO: "Já previsto na LD",
    PREVISTO_NOVA_REVISAO: "Previsto com nova revisão",
    TITULO_DIVERGENTE: "Título divergente",
    NAO_LOCALIZADO: "Não localizado",
    VALIDAR: "Requer validação manual",
  });

  /**
   * Compara o título pedido com o oficial. O oficial nunca é alterado aqui: a
   * comparação existe para mostrar lado a lado e deixar a pessoa aprovar,
   * rejeitar ou editar.
   *
   * A diferença é medida por palavra e ignorando caixa e acento, senão qualquer
   * maiúscula sobrando viraria "título divergente" e o alerta perderia sentido.
   */
  function compareTitles(requested, official) {
    const pedido = text(requested);
    const oficial = text(official);
    if (!pedido || !oficial) return { differs: false, requested: pedido, official: oficial, addedWords: [], removedWords: [] };
    const palavras = (valor) => norm(valor).split(/[^A-Z0-9]+/).filter(Boolean);
    const doPedido = palavras(pedido);
    const doOficial = palavras(oficial);
    const conjuntoOficial = new Set(doOficial);
    const conjuntoPedido = new Set(doPedido);
    return {
      differs: doPedido.join(" ") !== doOficial.join(" "),
      requested: pedido,
      official: oficial,
      addedWords: doPedido.filter((palavra) => !conjuntoOficial.has(palavra)),
      removedWords: doOficial.filter((palavra) => !conjuntoPedido.has(palavra)),
    };
  }

  function postedInSigem(sigemStatus) {
    const valor = norm(sigemStatus);
    if (!valor) return false;
    // "NAO POSTADO" contém "POSTADO"; a negativa tem de ser testada antes.
    if (valor.includes("NAO POSTADO") || valor.includes("NÃO POSTADO")) return false;
    return valor.includes("POSTADO");
  }

  /**
   * Classifica um item da solicitação. Recebe o resultado da consulta e o que o
   * solicitante informou; devolve a classificação sugerida, a ação recomendada
   * e o que precisa de conferência.
   */
  function classifyRequestItem(input) {
    const dados = input || {};
    const resultado = dados.lookup || null;
    const linha = resultado ? consultationRow(resultado) : null;
    const escolhida = resultado && resultado.chosen;
    const pedidoTitulo = text(dados.requestedTitle);
    const pedidoRevisao = text(dados.requestedRevision);

    const base = {
      classification: CLASSIFICATIONS.NAO_LOCALIZADO,
      recommendedAction: "",
      reason: "",
      needsManualValidation: true,
      isNewDocument: false,
      allocated: false,
      titleComparison: compareTitles(pedidoTitulo, escolhida ? escolhida.title : ""),
      revisionInLd: escolhida ? escolhida.revision : "",
      requestedRevision: pedidoRevisao,
      row: linha,
    };

    // 8.6 / 8.1 — não localizado em nenhuma LD anexada.
    if (!resultado || !resultado.found) {
      return {
        ...base,
        classification: CLASSIFICATIONS.NOVO,
        isNewDocument: true,
        recommendedAction: "Analisar a inclusão na LD e providenciar a alocação.",
        reason: "O código não consta em nenhuma das LDs anexadas. Confirme se é documento novo ou se a LD em uso não é a mais recente.",
      };
    }

    // 8.5 / 8.6 — localizado, mas sem ocorrência eleita: a decisão é da pessoa.
    if (!escolhida) {
      return {
        ...base,
        classification: CLASSIFICATIONS.VALIDAR,
        recommendedAction: "Escolher qual LD vale antes de seguir.",
        reason: resultado.rule || "As LDs anexadas divergem e não foi possível eleger uma ocorrência.",
      };
    }

    const alocado = escolhida.allocationKind === "allocated";
    const postado = postedInSigem(escolhida.sigemStatus);
    const titulo = compareTitles(pedidoTitulo, escolhida.title);
    const revisaoDiferente = Boolean(pedidoRevisao) && norm(pedidoRevisao) !== norm(escolhida.revision);

    const comum = {
      ...base,
      allocated: alocado,
      titleComparison: titulo,
      // Correspondência por variação de código ou divergência entre LDs continua
      // pedindo conferência mesmo quando a classificação é clara.
      needsManualValidation: Boolean(resultado.needsManualValidation),
    };

    // 8.3 — previsto e postado, com revisão nova pedida.
    if (postado && revisaoDiferente) {
      return {
        ...comum,
        classification: CLASSIFICATIONS.PREVISTO_NOVA_REVISAO,
        recommendedAction: `Atualizar da revisão ${escolhida.revision || "atual"} para ${pedidoRevisao} e postar no SIGEM.`,
        reason: `O documento já está postado na revisão ${escolhida.revision || "registrada na LD"}. A solicitação pede a revisão ${pedidoRevisao}.`,
      };
    }

    // 8.4 — título divergente. Vem depois da revisão porque uma revisão nova
    // costuma trazer título novo junto, e aí a ação principal é a revisão.
    if (titulo.differs) {
      return {
        ...comum,
        classification: CLASSIFICATIONS.TITULO_DIVERGENTE,
        needsManualValidation: true,
        recommendedAction: "Conferir o título e decidir entre corrigir a LD ou o pedido. O GRCON não altera nada sozinho.",
        reason: `Título na LD: “${titulo.official}”. Título informado: “${titulo.requested}”.`,
      };
    }

    // 8.2 — previsto na LD e ainda não postado.
    if (!postado) {
      return {
        ...comum,
        classification: CLASSIFICATIONS.PREVISTO_NAO_POSTADO,
        recommendedAction: alocado
          ? "Postar no SIGEM. Não é documento novo e não precisa de nova inclusão."
          : "Regularizar a alocação na LD antes de postar.",
        reason: alocado
          ? `Já previsto na LD ${escolhida.ld}, revisão ${escolhida.revision || "não informada"}, ainda sem postagem no SIGEM.`
          : `Já previsto na LD ${escolhida.ld}, mas a confirmação de documentos previstos está como “${escolhida.allocationStatus || "não informada"}”.`,
      };
    }

    // Previsto, postado e sem revisão nova pedida: nada a fazer além de responder.
    return {
      ...comum,
      classification: CLASSIFICATIONS.PREVISTO_NAO_POSTADO,
      recommendedAction: "Nenhuma ação necessária: o documento já está postado no SIGEM.",
      reason: `Postado no SIGEM na revisão ${escolhida.revision || "registrada"}, conforme a LD ${escolhida.ld}.`,
    };
  }

  /**
   * Converte um item já triado numa linha do Controle de Solicitações.
   *
   * Só preenche o que veio da LD ou do que a pessoa informou no cabeçalho da
   * solicitação. O que depende de etapas posteriores — retorno da fiscal, datas
   * de submissão — fica em branco para a saída marcar como "na": inventar aqui
   * seria pior do que deixar a pessoa preencher.
   */
  function controlRowFromItem(input) {
    const dados = input || {};
    const triagem = dados.triage || {};
    const linha = triagem.row || {};
    const cabecalho = dados.header || {};
    const escolhida = dados.lookup && dados.lookup.chosen;

    // "sim" quando o documento não está na LD; "não" quando já está previsto.
    const precisaInclusao = triagem.isNewDocument ? "sim" : linha.situation === "Localizado" || linha.situation === "Requer validação manual" ? "não" : "";

    // A observação junta o motivo da classificação com a ação recomendada, que
    // é o que a pessoa precisa ler para decidir — sem repetir o óbvio.
    const observacao = [triagem.reason, triagem.recommendedAction]
      .map((valor) => text(valor)).filter(Boolean).join(" ");

    return {
      item: text(dados.protocol),
      owner: text(cabecalho.owner),
      receivedAt: text(cabecalho.receivedAt),
      requester: text(cabecalho.requester),
      // A família documental vem da aba em que a LD guardou o documento.
      // Com LD, a família vem da aba em que o documento foi achado. Sem LD, vem
      // do que a pessoa informou no cabeçalho — nunca de suposição.
      documentFamily: escolhida ? text(escolhida.sheet) : text(cabecalho.documentFamily),
      requestType: text(cabecalho.requestType),
      origin: text(cabecalho.origin),
      emailBody: text(cabecalho.emailBody),
      document: text(dados.document),
      documentPath: text(cabecalho.documentPath),
      needsLdInclusion: precisaInclusao,
      ldVersion: escolhida ? text(escolhida.ldVersion) : "",
      ldApprovedAt: "",
      allocation: escolhida ? text(escolhida.allocation) : "",
      reference: escolhida ? text(escolhida.ld) : "",
      allocSentAt: "",
      fiscal1ReturnedAt: "",
      fiscal1Answer: "",
      fiscal2ReturnedAt: "",
      sigemOwner: "",
      sigemStatus: escolhida ? text(escolhida.sigemStatus) : "",
      sigemSubmittedAt: "",
      observations: observacao,
      pwN1710: "",
      overallStatus: text(cabecalho.overallStatus) || "Recebida",
      statusDate: text(cabecalho.receivedAt),
    };
  }

  /**
   * Transforma os documentos consultados em linhas do controle, numerando os
   * itens a partir do próximo livre. É o caminho que evita redigitar o que o
   * GRCON já descobriu.
   */
  /**
   * Linhas de solicitação sem consulta à LD.
   *
   * Nem toda solicitação nasce de uma triagem: chega um pedido por e-mail e a
   * pessoa precisa registrar e colar na planilha. Aqui não há classificação
   * nenhuma — sem LD não há o que classificar, e inventar uma situação seria
   * pior do que deixar em branco para ela preencher.
   */
  function buildManualControlRows(entries, header, existingItems) {
    const numerados = assignItemNumbers(entries || [], existingItems);
    return numerados.map((entrada) => ({
      ...controlRowFromItem({
        protocol: entrada.protocol,
        document: entrada.document,
        header: header || {},
      }),
      // O título informado não vira "título oficial": ninguém conferiu na LD.
      _requestedTitle: text(entrada.requestedTitle),
      _itemNumber: entrada.itemNumber,
      _classification: "",
      _needsManualValidation: false,
      _manual: true,
    }));
  }

  function buildControlRows(entries, header, existingItems) {
    const numerados = assignItemNumbers(entries || [], existingItems);
    return numerados.map((entrada) => {
      const triagem = classifyRequestItem({
        lookup: entrada.lookup,
        requestedTitle: entrada.requestedTitle,
        requestedRevision: entrada.requestedRevision,
      });
      return {
        ...controlRowFromItem({
          protocol: entrada.protocol,
          document: entrada.document,
          lookup: entrada.lookup,
          triage: triagem,
          header: header || {},
        }),
        _itemNumber: entrada.itemNumber,
        _classification: triagem.classification,
        _needsManualValidation: triagem.needsManualValidation,
      };
    });
  }

  return Object.freeze({
    CLASSIFICATIONS,
    controlRowFromItem,
    buildControlRows,
    buildManualControlRows,
    compareTitles,
    classifyRequestItem,
    DEFAULT_REQUEST_TYPES,
    PRIORITIES,
    REQUEST_STATUSES,
    normalizeRequestType,
    requestTypeList,
    protocolFor,
    nextItemNumber,
    assignItemNumbers,
    duplicatedProtocols,
    parseDocumentList,
    dedupeDocuments,
    lookupDocument,
    lookupDocuments,
    consultationRow,
    chooseOccurrence,
  });
});
