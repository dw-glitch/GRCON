/**
 * GRCON — Motor de Consultas
 *
 * Camada sem interface: consulta de documentos nas LDs e a classificação da
 * triagem. Fica separada da tela porque é a parte que precisa ser testada
 * sozinha.
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
    // A situação da alocação é lida da linha inteira — status, número de ALOC e
    // a existência da coluna na aba —, a mesma leitura da Triagem. Ler só a
    // célula de confirmação devolvia "não informado" para linha que traz o
    // número da ALOC e para aba que nem rastreia alocação.
    const estado = core() && core().allocationEvidenceState
      ? core().allocationEvidenceState(record)
      : core() && core().allocationState
        ? core().allocationState(record.allocationStatus)
        : { kind: "empty", label: "Não informado" };
    return {
      document: text(record.document),
      // O título sai exatamente como está na LD: sem maiúsculas forçadas, sem
      // mexer em acento, símbolo ou pontuação.
      title: text(record.title),
      allocationStatus: text(record.allocationStatus),
      allocationKind: estado.kind,
      allocationLabel: estado.label,
      allocationEvidence: text(estado.evidence),
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
  /** Ocorrências que se contradizem quanto à alocação do mesmo documento. */
  function allocationConflict(occurrences) {
    const tipos = new Set((occurrences || []).map((item) => text(item && item.allocationKind)));
    return tipos.has("allocated") && tipos.has("not_allocated");
  }

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
      // Sem critério para desempatar, quem decide é a pessoa. Quando as linhas
      // vêm do mesmo arquivo, dizer "as LDs divergem" mandava procurar uma
      // segunda LD que não existe: a divergência está dentro da mesma planilha.
      const arquivos = [...new Set(empatadas.map((item) => text(item.ld)).filter(Boolean))];
      const onde = arquivos.length > 1
        ? `As LDs divergem e têm a mesma data de envio (${arquivos.join(", ")}).`
        : `A LD ${arquivos[0] || "informada"} traz linhas divergentes para o mesmo documento (${empatadas.map((item) => `${item.sheet || "aba"} · linha ${item.row || "?"}`).join(", ")}).`;
      return { chosen: null, rule: `${onde} Escolha qual vale.`, conflicting: true };
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
  /**
   * Como a alocação é dita em todas as saídas deste módulo. Cada situação tem a
   * sua frase: alocado por status, alocado pelo número da ALOC, não alocado,
   * aba sem coluna de alocação e coluna vazia são fatos diferentes.
   */
  function allocationAnswer(occurrence) {
    const item = occurrence || null;
    if (!item) return "";
    if (item.allocationKind === "conflict") return "CONFLITO — a LD registra ALOCADO e NÃO ALOCADO";
    if (item.allocationKind === "allocated") {
      return item.allocationEvidence === "number" && item.allocation
        ? `SIM — alocação evidenciada pelo número ${item.allocation}`
        : "SIM — Alocado";
    }
    if (item.allocationKind === "not_allocated") return "NÃO — Não alocado";
    if (item.allocationKind === "not_tracked") return "NÃO APURADO — a LD não rastreia alocação nesta aba";
    if (item.allocationKind === "blank" || item.allocationKind === "empty") return "NÃO INFORMADO — campo de confirmação vazio na LD";
    return `REVISAR — ${item.allocationLabel}`;
  }

  function consultationRow(resultado) {
    const escolhida = resultado && resultado.chosen;
    const todas = (resultado && resultado.occurrences) || [];
    return {
      document: text(resultado && resultado.document),
      title: escolhida ? escolhida.title : "",
      // Sem ocorrência eleita por divergência de alocação, a resposta é o
      // conflito — deixar em branco fazia a consulta parecer que não apurou.
      allocated: escolhida
        ? allocationAnswer(escolhida)
        : allocationConflict(todas)
          ? "CONFLITO — a LD registra ALOCADO e NÃO ALOCADO"
          : "",
      allocationKind: escolhida ? text(escolhida.allocationKind) : (allocationConflict(todas) ? "conflict" : ""),
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
  // Histórico do próprio GRCON
  //
  // A consulta responde o que a LD diz sobre o documento. Falta a outra metade
  // da pergunta que se faz o dia inteiro: este documento já foi emitido por
  // nós? Em que eGRDT e quando? O histórico de eGRDTs geradas fica no
  // navegador; aqui só se dá forma ao que ele devolve.
  //
  // A regra de sempre continua: sem registro, a resposta é "não emitido", e não
  // um silêncio que se confunde com "não consultei".
  // ---------------------------------------------------------------------------

  /** Data ISO do histórico no formato de leitura (dd/mm/aaaa). */
  function formatDateBR(value) {
    const raw = text(value);
    if (!raw) return "";
    const data = new Date(raw);
    if (Number.isNaN(data.getTime())) {
      const simples = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return simples ? `${simples[3]}/${simples[2]}/${simples[1]}` : raw;
    }
    return data.toLocaleDateString("pt-BR");
  }

  /**
   * Resposta do histórico para um documento, pronta para a tela e para o Excel.
   *
   * `entries` são os registros do histórico local ({ egrdtNumber, generatedAt }),
   * da emissão mais recente para a mais antiga.
   */
  function issuedHistory(entries) {
    const lista = (entries || [])
      .map((item) => ({ egrdt: text(item && item.egrdtNumber), date: formatDateBR(item && item.generatedAt) }))
      .filter((item) => item.egrdt);
    if (!lista.length) {
      return { issued: false, count: 0, egrdt: "", date: "", all: [], label: "Não emitido pelo GRCON", cell: "Não emitido" };
    }
    const [maisRecente] = lista;
    return {
      issued: true,
      count: lista.length,
      egrdt: maisRecente.egrdt,
      date: maisRecente.date,
      all: lista,
      label: `${maisRecente.egrdt}${maisRecente.date ? ` · ${maisRecente.date}` : ""}${lista.length > 1 ? ` · +${lista.length - 1} anterior(es)` : ""}`,
      // No Excel a data fica na linha de baixo, dentro da mesma célula: é assim
      // que se lê o número sem perder de vista quando ele saiu.
      cell: lista.map((item) => (item.date ? `${item.egrdt}\n${item.date}` : item.egrdt)).join("\n"),
    };
  }

  /** Os campos que a linha da consulta ganha com o histórico. */
  function issuedColumns(entries) {
    const historico = issuedHistory(entries);
    return {
      issued: historico.issued ? "SIM" : "NÃO",
      issuedEgrdt: historico.egrdt,
      issuedAt: historico.date,
      issuedCount: historico.count,
      issuedCell: historico.cell,
      issuedLabel: historico.label,
      issuedAll: historico.all,
    };
  }

  return Object.freeze({
    parseDocumentList,
    dedupeDocuments,
    lookupDocument,
    lookupDocuments,
    consultationRow,
    allocationConflict,
    formatDateBR,
    issuedHistory,
    issuedColumns,
    allocationAnswer,
    chooseOccurrence,
  });
});
