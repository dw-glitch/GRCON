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
   * Revisões que o próprio arquivo da LD traz na aba Colar SIGEM para o
   * documento consultado. A maior revisão controlada fica em destaque, mas
   * todas permanecem disponíveis para a interface/auditoria.
   *
   * Isto é deliberadamente separado do histórico do GRCON: a Colar SIGEM é
   * uma fonte da LD anexada; a eGRDT emitida pelo GRCON é outra fonte.
   */
  function sigemRevisionSummary(group) {
    const entries = (group && group.history || [])
      .map((item) => {
        const revision = core() && core().normalizeRevision ? core().normalizeRevision(item && item.revision) : norm(item && item.revision);
        const info = core() && core().revisionInfo ? core().revisionInfo(revision) : { valid: Boolean(revision), rank: 0 };
        return {
          revision,
          valid: Boolean(info && info.valid),
          rank: Number(info && info.rank) || 0,
          status: text(item && (item.sigemStatus || item.status)),
          source: text(item && item.source),
          sheet: text(item && item.sheet),
          row: Number(item && item.row) || 0,
          sourceTimestamp: Number(item && item.sourceTimestamp) || 0,
        };
      })
      .filter((item) => item.revision && item.valid);

    const unique = new Map();
    entries.forEach((item) => {
      const previous = unique.get(item.revision);
      if (!previous || item.sourceTimestamp > previous.sourceTimestamp || (item.sourceTimestamp === previous.sourceTimestamp && item.row > previous.row)) {
        unique.set(item.revision, item);
      }
    });
    const revisions = [...unique.values()].sort((left, right) => right.rank - left.rank || right.sourceTimestamp - left.sourceTimestamp || right.row - left.row);
    const latest = revisions[0] || null;
    return {
      found: Boolean(latest),
      revision: latest ? latest.revision : "",
      status: latest ? latest.status : "",
      count: revisions.length,
      all: revisions,
      cell: latest ? latest.revision : "Não encontrado no Colar SIGEM",
      label: latest
        ? `Rev. ${latest.revision}${latest.status ? ` · ${latest.status}` : ""}${revisions.length > 1 ? ` · +${revisions.length - 1} anterior(es)` : ""}`
        : "Não encontrado no Colar SIGEM",
    };
  }

  /**
   * As duas formas do mesmo código ET — com e sem nt- — e a situação de cada
   * uma na LD.
   *
   * A consulta responde pela forma que casou com o código informado. Quando a
   * LD traz as duas como linhas próprias, a outra ficava invisível: quem
   * consultava não tinha como saber que ela existe, nem em que revisão,
   * alocação ou status ela está. Isto é evidência, não decisão: a escolha da
   * consulta não muda por causa desta leitura, e forma que não consta na LD é
   * dita como ausente em vez de ficar em branco.
   */
  function ntFormsInLd(informado, ldDocument, index) {
    const motor = core();
    if (!motor || !index || !index.byDocument || !motor.documentSearchKeys || !motor.key) return [];
    const referencia = text(ldDocument) || text(informado);
    const chaveReferencia = motor.key(referencia);
    if (!chaveReferencia || !motor.isEtDocument || !motor.isEtDocument(chaveReferencia)) return [];
    const formas = (motor.documentSearchKeys(referencia) || []).map((forma) => motor.key(forma));
    // Uma forma só significa código sem as duas grafias possíveis: não há o que
    // comparar, e a coluna "forma localizada na LD" já responde sozinha.
    if (formas.length < 2) return [];
    return [...new Set(formas)].map((chave) => {
      const grupo = index.byDocument.get(chave) || null;
      const registros = (grupo && grupo.records) || [];
      const ocorrencias = registros.map(occurrenceFrom);
      const escolhida = chooseOccurrence(ocorrencias).chosen;
      const revisaoSigem = sigemRevisionSummary(grupo);
      const codigoNaLd = escolhida ? text(escolhida.document) : text(ocorrencias[0] && ocorrencias[0].document);
      return {
        form: motor.ntPrefixForm ? motor.ntPrefixForm(codigoNaLd || chave) : "",
        key: chave,
        document: codigoNaLd,
        found: ocorrencias.length > 0,
        // A forma que a consulta usou para responder as demais colunas.
        isSearchedResult: chave === chaveReferencia,
        title: escolhida ? escolhida.title : "",
        revision: escolhida ? escolhida.revision : "",
        allocated: escolhida ? allocationAnswer(escolhida) : "",
        lastGrdt: escolhida ? escolhida.lastGrdt : "",
        sigemStatus: escolhida ? escolhida.sigemStatus : "",
        sigemRevisionLabel: revisaoSigem.label,
        ld: escolhida ? escolhida.ld : "",
        allLds: [...new Set(ocorrencias.map((item) => item.ld).filter(Boolean))].join(" | "),
        occurrenceCount: ocorrencias.length,
        // Sem ocorrência eleita havendo linhas é divergência dentro da própria
        // forma; a consulta diz isso em vez de escolher uma linha qualquer.
        conflicting: ocorrencias.length > 0 && !escolhida,
      };
    });
  }

  /**
   * As formas com/sem nt- em uma célula só, uma por linha — é assim que a
   * planilha e a cópia levam a situação de cada uma.
   */
  function ntFormsDetailText(forms) {
    const lista = forms || [];
    if (!lista.length) return "";
    return lista.map((item) => {
      if (!item.found) return `${item.form}: não consta na LD`;
      const partes = [
        text(item.document) || item.key,
        item.isSearchedResult ? "forma usada nesta consulta" : "também consta na LD",
        item.conflicting
          ? "linhas divergentes na LD — conferir"
          : item.revision ? `Rev. ${item.revision} na LD` : "revisão não informada na LD",
        text(item.sigemRevisionLabel) && text(item.sigemRevisionLabel) !== "Não encontrado no Colar SIGEM"
          ? `Colar SIGEM: ${item.sigemRevisionLabel}`
          : "sem revisão na Colar SIGEM",
        text(item.allocated) || "alocação não apurada",
        text(item.lastGrdt) ? `Última GRDT: ${item.lastGrdt}` : "",
        text(item.ld) ? `LD: ${item.ld}` : "",
      ].filter(Boolean);
      return `${item.form}: ${partes.join(" · ")}`;
    }).join("\n");
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
      sigemRevision: "",
      sigemRevisionCell: "Não encontrado no Colar SIGEM",
      sigemRevisionCount: 0,
      sigemRevisionAll: [],
      sigemRevisionLabel: "Não encontrado no Colar SIGEM",
      message: "Não localizado nas LDs anexadas.",
    };
    if (!informado || !index || !core()) return base;

    const matches = core().matchDocuments(informado, index, settings.hintedSheet) || [];

    // Mais de um documento candidato: a mesma trava da triagem (README "Busca
    // pelo TAG dos documentos ET" — havendo mais de uma linha do mesmo tipo
    // com o mesmo TAG, o GRCON pede conferência). Nenhum dos candidatos é
    // escolhido a dedo pela consulta.
    if (matches.length > 1) {
      const lookupAmbiguo = core().documentLookup ? core().documentLookup(informado, null, matches) : null;
      const codigos = matches.slice(0, 5).map((candidate) => candidate.document).join("; ");
      const mensagem = lookupAmbiguo && lookupAmbiguo.message
        ? lookupAmbiguo.message
        : `Mais de um código controlado corresponde a “${informado}” (${codigos}). Nenhuma associação automática foi feita.`;
      return {
        ...base,
        found: true,
        confidence: "baixa",
        needsManualValidation: true,
        ambiguous: true,
        lookup: lookupAmbiguo,
        ldDocument: "",
        ntForms: ntFormsInLd(informado, "", index),
        matchKind: "ambiguous",
        message: mensagem,
        rule: mensagem,
      };
    }

    const primeiro = matches[0] || null;
    const lookup = core().documentLookup ? core().documentLookup(informado, matches.length === 1 ? primeiro : null, matches) : null;
    const sigemRevision = sigemRevisionSummary(primeiro && primeiro.group);

    if (!primeiro) {
      return {
        ...base,
        lookup,
        ntForms: ntFormsInLd(informado, "", index),
        message: lookup && lookup.message ? lookup.message : base.message,
      };
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

    // Mesma correção de código que a triagem aplica: com/sem nt- (ntRename) e,
    // quando o código completo não bate mas a combinação tipo + TAG identifica
    // uma única linha, a correção pela codificação oficial da LD (ldRename).
    // O TAG em si nunca é alterado ou adivinhado — só tolera a mesma confusão
    // alfanumérica única que a triagem já tolerava, e só quando a LD é
    // inequívoca. Sem arquivo físico aqui, finalName fica vazio e a frase
    // "vai entrar na eGRDT como…" some sozinha da nota.
    const renamed = core().applyOfficialCodeRename
      ? core().applyOfficialCodeRename(
        { document: text(primeiro.document), finalName: "", reason: "" },
        { document: informado, documentLookup: lookup },
      )
      : {};

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
      ntForms: ntFormsInLd(informado, text(primeiro.document), index),
      ntRename: renamed.ntRename || null,
      ldRename: renamed.ldRename || null,
      lookup,
      sigemRevision: sigemRevision.revision,
      sigemRevisionCell: sigemRevision.cell,
      sigemRevisionCount: sigemRevision.count,
      sigemRevisionAll: sigemRevision.all,
      sigemRevisionLabel: sigemRevision.label,
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

  /**
   * Explica o ajuste de código da mesma forma que a triagem: com/sem nt- ou
   * pela combinação tipo + TAG. Sem ajuste (código informado já é o da LD),
   * devolve string vazia.
   */
  function codeAdjustmentNote(resultado) {
    const info = resultado && (resultado.ntRename || resultado.ldRename);
    return info ? text(info.nota) : "";
  }

  function consultationRow(resultado) {
    const escolhida = resultado && resultado.chosen;
    const todas = (resultado && resultado.occurrences) || [];
    const lookup = resultado && resultado.lookup;
    const formas = (resultado && resultado.ntForms) || [];
    const formasLocalizadas = formas.filter((item) => item && item.found);
    return {
      document: text(resultado && resultado.document),
      title: escolhida ? escolhida.title : "",
      // O que a consulta encontrou na LD, pesquisando com e sem nt- e, quando
      // o código completo não bate, pela combinação tipo + TAG — a mesma
      // regra que a triagem já aplica (README "Regra com/sem nt-" e "Busca
      // pelo TAG dos documentos ET"). O TAG em si nunca é alterado: só tolera
      // a mesma confusão alfanumérica única que a triagem já tolerava, e
      // somente quando a LD é inequívoca.
      ldDocument: text(resultado && resultado.ldDocument),
      ldForm: text(lookup && lookup.ldForm) || (resultado && resultado.found ? "" : "Não localizado"),
      matchKind: text(resultado && resultado.matchKind),
      appliesToNtRule: Boolean(lookup && lookup.appliesToNtRule),
      searchedWithoutNt: text(lookup && lookup.searchedWithoutNt),
      searchedWithNt: text(lookup && lookup.searchedWithNt),
      ntSearchMessage: text(lookup && lookup.message),
      ntSearchResultLabel: text(lookup && lookup.resultLabel),
      // As duas grafias possíveis do mesmo código ET, com a situação de cada
      // uma na LD. Quando as duas constam, nenhuma some da resposta.
      ntForms: formas,
      ntFormsDetail: ntFormsDetailText(formas),
      ntFormsFound: formasLocalizadas.length,
      bothNtFormsInLd: formasLocalizadas.length > 1,
      codeAdjusted: Boolean(resultado && (resultado.ntRename || resultado.ldRename)),
      codeAdjustmentNote: codeAdjustmentNote(resultado),
      sigemLdRevision: text(resultado && resultado.sigemRevision),
      sigemLdRevisionCell: text(resultado && resultado.sigemRevisionCell) || "Não encontrado no Colar SIGEM",
      sigemLdRevisionCount: Number(resultado && resultado.sigemRevisionCount) || 0,
      sigemLdRevisionAll: (resultado && resultado.sigemRevisionAll) || [],
      sigemLdRevisionLabel: text(resultado && resultado.sigemRevisionLabel) || "Não encontrado no Colar SIGEM",
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
   * `entries` são os registros do histórico local
   * ({ egrdtNumber, generatedAt, revision }), da emissão mais recente para a
   * mais antiga. A revisão é a que ficou gravada junto do documento naquela
   * eGRDT; a revisão atual da LD nunca substitui este valor histórico.
   */
  function issuedHistory(entries) {
    const lista = (entries || [])
      .map((item) => ({
        egrdt: text(item && item.egrdtNumber),
        generatedAt: text(item && item.generatedAt),
        date: formatDateBR(item && item.generatedAt),
        revision: text(item && (item.grdtRevision || item.revision)),
        revisionSource: text(item && item.revisionSource),
      }))
      .filter((item) => item.egrdt)
      .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
    if (!lista.length) {
      return {
        issued: false,
        count: 0,
        egrdt: "",
        date: "",
        revision: "",
        revisionCell: "Não emitido",
        all: [],
        label: "Não emitido pelo GRCON",
        cell: "Não emitido",
      };
    }
    const [maisRecente] = lista;
    return {
      issued: true,
      count: lista.length,
      egrdt: maisRecente.egrdt,
      date: maisRecente.date,
      revision: maisRecente.revision,
      revisionCell: maisRecente.revision || "Não registrada no histórico",
      all: lista,
      label: `${maisRecente.egrdt}${maisRecente.revision ? ` · Rev. ${maisRecente.revision}` : " · revisão não registrada"}${maisRecente.date ? ` · ${maisRecente.date}` : ""}${lista.length > 1 ? ` · +${lista.length - 1} anterior(es)` : ""}`,
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
      issuedRevision: historico.revision,
      issuedRevisionCell: historico.revisionCell,
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
    sigemRevisionSummary,
    allocationConflict,
    formatDateBR,
    issuedHistory,
    issuedColumns,
    allocationAnswer,
    chooseOccurrence,
    ntFormsInLd,
    ntFormsDetailText,
  });
});
