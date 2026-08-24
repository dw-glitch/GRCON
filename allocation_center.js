/**
 * GRCON — Central de alocação do Controle de Solicitações
 *
 * Lê a aba "Central de alocação" da planilha de Controle de Solicitações e
 * responde, por documento, qual é a situação da alocação e o que a fiscal
 * escreveu — inclusive o motivo de não estar alocado.
 *
 * A aba é o registro de todas as ALOCs enviadas, não uma lista de documentos:
 * o mesmo documento reaparece a cada novo envio. Medido no arquivo real, são
 * 4.276 linhas para 3.473 documentos, e 724 documentos repetem.
 *
 * REGRA DA ESCOLHA
 * O que vale é o envio mais recente, porque é ele que descreve a situação de
 * hoje. Quando duas linhas têm a mesma data — acontece —, desempata o número
 * da ALOC, que é sequencial e cresce junto com a data. Medido sobre o arquivo
 * real: essa regra resolve os 724 repetidos sem sobrar nenhum caso ambíguo.
 *
 * As linhas anteriores não são descartadas: seguem em `all`, para quem
 * precisar ver o histórico do documento.
 *
 * Nada aqui inventa: documento fora da central responde "não consta", que é
 * diferente de "não alocado".
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconAllocationCenter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function text(value) {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return "";
    return String(value).trim();
  }

  function norm(value) {
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ").trim().toUpperCase();
  }

  /**
   * Chave de comparação do documento. Usa a mesma normalização do motor
   * documental quando ele está disponível, para a central casar exatamente com
   * o que a consulta considera o mesmo documento.
   */
  function documentKey(value, core) {
    if (core && typeof core.key === "function") {
      const chave = core.key(value);
      if (chave) return chave;
    }
    return norm(value).replace(/[^A-Z0-9]/g, "");
  }

  // Os rótulos vêm da planilha real. A busca é por texto normalizado, nunca
  // por posição fixa: a coluna pode mudar de lugar entre versões do arquivo.
  const CAMPOS = Object.freeze([
    { chave: "ldSheet", rotulos: ["ABA"] },
    { chave: "ldVersion", rotulos: ["VERSAO DA LD"] },
    { chave: "sentAt", rotulos: ["DATA DO ENVIO DA ALOC"] },
    { chave: "fiscal1ReturnedAt", rotulos: ["RETORNO DA FISCAL 01 (RENATA)", "RETORNO DA FISCAL 01"] },
    { chave: "fiscal1Answer", rotulos: ["RESPOSTA DA FISCAL 01 (RENATA)", "RESPOSTA DA FISCAL 01"] },
    { chave: "fiscal2ReturnedAt", rotulos: ["RETORNO DA FISCAL 02 (NANI)", "RETORNO DA FISCAL 02"] },
    { chave: "status", rotulos: ["STATUS DA ALOCACAO"] },
    { chave: "allocation", rotulos: ["ALOCACAO"] },
    { chave: "farol", rotulos: ["FAROL"] },
    { chave: "document", rotulos: ["NOMEDOCUMENTO", "DOCUMENTO"] },
  ]);

  function acharAba(workbook, xlsx) {
    const nomes = (workbook && workbook.SheetNames) || [];
    const alvo = nomes.find((nome) => norm(nome) === "CENTRAL DE ALOCACAO");
    if (alvo) return alvo;
    // Sem o nome esperado, procura pela assinatura do cabeçalho: a aba certa é
    // a que traz o documento e o status juntos.
    return nomes.find((nome) => {
      const linhas = linhasDaAba(workbook, nome, xlsx, 8);
      return linhas.some((linha) => {
        const cabecalhos = linha.map(norm);
        return cabecalhos.includes("STATUS DA ALOCACAO") && cabecalhos.some((c) => c === "NOMEDOCUMENTO");
      });
    }) || "";
  }

  /**
   * O leitor de planilha entra por parâmetro em vez de ser pescado do escopo
   * global: assim o motor roda igual no navegador e no Node, e o teste usa o
   * mesmo caminho que a tela.
   */
  function linhasDaAba(workbook, nome, xlsx, limite) {
    const sheet = workbook && workbook.Sheets && workbook.Sheets[nome];
    if (!sheet || !xlsx || !xlsx.utils) return [];
    const todas = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
    return limite ? todas.slice(0, limite) : todas;
  }

  /**
   * Acha a linha do cabeçalho. No arquivo real ela é a segunda, não a primeira
   * — a primeira traz só um total. Procurar pelo conteúdo evita depender disso.
   */
  function acharCabecalho(linhas) {
    for (let indice = 0; indice < Math.min(linhas.length, 20); indice += 1) {
      const cabecalhos = (linhas[indice] || []).map(norm);
      if (cabecalhos.includes("STATUS DA ALOCACAO") && cabecalhos.some((c) => c === "NOMEDOCUMENTO" || c === "DOCUMENTO")) {
        return indice;
      }
    }
    return -1;
  }

  function mapearColunas(cabecalho) {
    const colunas = {};
    const normalizados = cabecalho.map(norm);
    CAMPOS.forEach((campo) => {
      const indice = normalizados.findIndex((valor) => campo.rotulos.includes(valor));
      if (indice >= 0) colunas[campo.chave] = indice;
    });
    return colunas;
  }

  function data(valor) {
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor;
    return null;
  }

  function dataBr(valor) {
    const d = data(valor);
    return d ? d.toLocaleDateString("pt-BR") : "";
  }

  /**
   * Número sequencial da ALOC, para desempatar envios da mesma data.
   * "C1O-ALOC-CM-0230-2026" vira 2026 * 10000 + 230, de modo que o ano pesa
   * mais que o sequencial e a ordem continua certa na virada do ano.
   */
  function allocationSequence(valor) {
    const encontrado = text(valor).match(/(\d{3,5})-(\d{4})\s*$/);
    if (!encontrado) return 0;
    return Number(encontrado[2]) * 100000 + Number(encontrado[1]);
  }

  function entradaDe(linha, colunas, numeroDaLinha) {
    const pegar = (chave) => (colunas[chave] === undefined ? "" : linha[colunas[chave]]);
    return {
      document: text(pegar("document")),
      ldSheet: text(pegar("ldSheet")),
      ldVersion: text(pegar("ldVersion")),
      sentAt: dataBr(pegar("sentAt")),
      sentAtTime: data(pegar("sentAt")) ? data(pegar("sentAt")).getTime() : 0,
      fiscal1ReturnedAt: dataBr(pegar("fiscal1ReturnedAt")),
      // A resposta da fiscal sai como está na planilha: sem reescrever, sem
      // cortar e sem forçar maiúsculas. É texto dela.
      fiscal1Answer: text(pegar("fiscal1Answer")),
      fiscal2ReturnedAt: dataBr(pegar("fiscal2ReturnedAt")),
      status: text(pegar("status")),
      allocation: text(pegar("allocation")),
      allocationSequence: allocationSequence(pegar("allocation")),
      farol: text(pegar("farol")),
      row: numeroDaLinha,
    };
  }

  /**
   * Lê a planilha inteira e devolve o índice por documento.
   * Falhar aqui nunca derruba a consulta: sem central, a consulta responde o
   * que sempre respondeu.
   */
  function parseAllocationCenter(workbook, options) {
    const opcoes = options || {};
    const xlsx = opcoes.xlsx || (typeof globalThis !== "undefined" ? globalThis.XLSX : null);
    const core = opcoes.core || (typeof globalThis !== "undefined" ? globalThis.TriagemCore : null);
    if (!xlsx || !xlsx.utils) {
      return { ok: false, error: "O leitor de planilhas não está disponível.", entries: [], byDocument: new Map(), sheetName: "", count: 0 };
    }
    const nome = acharAba(workbook, xlsx);
    if (!nome) return { ok: false, error: "Nenhuma aba de central de alocação foi encontrada nesta planilha.", entries: [], byDocument: new Map(), sheetName: "", count: 0 };
    const linhas = linhasDaAba(workbook, nome, xlsx);
    const cabecalhoIndice = acharCabecalho(linhas);
    if (cabecalhoIndice < 0) {
      return { ok: false, error: `A aba “${nome}” não traz as colunas de documento e status da alocação.`, entries: [], byDocument: new Map(), sheetName: nome, count: 0 };
    }
    const colunas = mapearColunas(linhas[cabecalhoIndice] || []);
    if (colunas.document === undefined || colunas.status === undefined) {
      return { ok: false, error: `A aba “${nome}” não traz as colunas de documento e status da alocação.`, entries: [], byDocument: new Map(), sheetName: nome, count: 0 };
    }

    const entries = [];
    const byDocument = new Map();
    for (let indice = cabecalhoIndice + 1; indice < linhas.length; indice += 1) {
      const entrada = entradaDe(linhas[indice] || [], colunas, indice + 1);
      if (!entrada.document) continue;
      entries.push(entrada);
      const chave = documentKey(entrada.document, core);
      if (!chave) continue;
      if (!byDocument.has(chave)) byDocument.set(chave, []);
      byDocument.get(chave).push(entrada);
    }
    return {
      ok: true,
      error: "",
      entries,
      byDocument,
      sheetName: nome,
      headerRow: cabecalhoIndice + 1,
      count: entries.length,
      documents: byDocument.size,
    };
  }

  /**
   * Responde pelo documento. Devolve a linha que vale hoje, a regra aplicada e
   * o histórico completo — nunca combina campos de envios diferentes.
   */
  function allocationCenterLookup(document, index, core) {
    const vazio = { found: false, chosen: null, all: [], rule: "" };
    if (!index || !index.byDocument) return vazio;
    const chave = documentKey(document, core);
    const encontradas = chave ? index.byDocument.get(chave) : null;
    if (!encontradas || !encontradas.length) return vazio;

    // Mais recente primeiro; empate de data decide pelo número da ALOC.
    const ordenadas = [...encontradas].sort((a, b) =>
      (b.sentAtTime - a.sentAtTime) || (b.allocationSequence - a.allocationSequence));
    const escolhida = ordenadas[0];
    const rule = ordenadas.length === 1
      ? "Único envio registrado na central."
      : `${ordenadas.length} envios na central; vale o mais recente${escolhida.sentAt ? ` (${escolhida.sentAt})` : ""}${escolhida.allocation ? `, ALOC ${escolhida.allocation}` : ""}.`;
    return { found: true, chosen: escolhida, all: ordenadas, rule };
  }

  /** Campos que a consulta acrescenta à linha do documento. */
  function centerFields(resultado) {
    if (!resultado || !resultado.found || !resultado.chosen) {
      return {
        centerStatus: "",
        centerFiscalAnswer: "",
        centerAllocation: "",
        centerAllocationCell: "",
        centerSentAt: "",
        centerLdSheet: "",
        centerLdVersion: "",
        centerRule: "",
        centerFound: false,
        centerSubmissions: 0,
      };
    }
    const escolhida = resultado.chosen;
    // A ALOC e a data do envio ficam na mesma célula, uma por linha, do mesmo
    // jeito que a coluna da eGRDT: são a evidência de qual envio foi eleito.
    const partes = [escolhida.allocation, escolhida.sentAt].filter(Boolean);
    return {
      centerStatus: escolhida.status,
      centerFiscalAnswer: escolhida.fiscal1Answer,
      centerAllocation: escolhida.allocation,
      centerAllocationCell: partes.join("\n"),
      centerSentAt: escolhida.sentAt,
      centerLdSheet: escolhida.ldSheet,
      centerLdVersion: escolhida.ldVersion,
      centerRule: resultado.rule,
      centerFound: true,
      centerSubmissions: resultado.all.length,
    };
  }

  return Object.freeze({
    parseAllocationCenter,
    allocationCenterLookup,
    centerFields,
    documentKey,
    allocationSequence,
    _internos: { acharAba, acharCabecalho, mapearColunas, entradaDe, norm },
  });
});
