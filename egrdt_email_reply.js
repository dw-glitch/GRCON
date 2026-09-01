/**
 * GRCON — Resposta de e-mail da eGRDT
 *
 * Depois de gerar a eGRDT (ou ao abrir uma eGRDT já registrada no histórico),
 * o operador precisa responder ao e-mail de quem pediu a emissão dizendo que
 * os documentos foram postados. Até aqui essa relação era montada à mão, ou
 * copiada da tabela do Histórico — e a cópia da tabela chegava ao Outlook
 * desmontada, uma célula por linha, porque cada `<td>` virava um bloco.
 *
 * Este módulo monta a mesma relação nas sete colunas que a resposta precisa
 * ter (data, eGRDT, família, documento, título, disciplina e arquivo postado)
 * e devolve as duas formas que a área de transferência entende: uma tabela
 * HTML com estilo embutido, que o cliente de e-mail cola como tabela de
 * verdade, e um texto separado por tabulação, que serve para e-mail em texto
 * puro e cola em colunas no Excel.
 *
 * O módulo é puro: não toca no DOM, não escreve em storage e não decide
 * quando aparecer. Isso fica em egrdt_email_reply_ui.js.
 */
(function (root, factory) {
  const History = root.GrconHistory || (typeof module === "object" && module.exports ? require("./history_core.js") : null);
  const api = factory(History, root.GrconUtils || null);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconEgrdtEmailReply = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (History, Utils) {
  "use strict";

  const _U = Utils || {};
  const EMPTY = "—";

  // As sete colunas são as mesmas do relatório do Histórico, na ordem em que a
  // resposta do e-mail é lida. Mudar a ordem aqui muda a tabela colada.
  const COLUMNS = [
    "DATA DA GERAÇÃO / POSTAGEM",
    "EGRDT",
    "FAMÍLIA DOCUMENTAL",
    "DOCUMENTO",
    "TÍTULO",
    "DISCIPLINA",
    "ARQUIVO POSTADO",
  ];

  function text(value) {
    if (_U.text) return _U.text(value);
    if (History && History.text) return History.text(value);
    return String(value === null || value === undefined ? "" : value).trim();
  }

  function cell(value) {
    return text(value) || EMPTY;
  }

  function escapeHtml(value) {
    if (_U.escapeHtml) return _U.escapeHtml(value);
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(value) {
    if (_U.formatDate) return _U.formatDate(value, true);
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return EMPTY;
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  function family(file) {
    const value = History && History.documentFamily ? History.documentFamily(file) : "";
    return text(value) || "Não identificado";
  }

  /**
   * Uma linha por arquivo físico, na ordem em que o arquivo entrou na eGRDT.
   * O DOCX e o PDF do mesmo documento são duas linhas, como na planilha
   * gerada e como a pessoa que recebe a resposta espera conferir.
   */
  function rowsFromRecords(records) {
    return (Array.isArray(records) ? records : [records]).filter(Boolean).flatMap((record) => (record.files || []).map((file) => ({
      "DATA DA GERAÇÃO / POSTAGEM": formatDate(record.generatedAt),
      "EGRDT": cell(record.egrdtNumber),
      "FAMÍLIA DOCUMENTAL": family(file),
      "DOCUMENTO": cell(file.document),
      "TÍTULO": cell(file.title),
      "DISCIPLINA": cell(file.discipline),
      "ARQUIVO POSTADO": cell(file.finalName || file.originalName),
    })));
  }

  function summarize(records) {
    const list = (Array.isArray(records) ? records : [records]).filter(Boolean);
    const numbers = [...new Set(list.map((record) => text(record.egrdtNumber)).filter(Boolean))];
    const documents = new Set();
    let files = 0;
    list.forEach((record) => (record.files || []).forEach((file) => {
      files += 1;
      const document = text(file.document);
      if (document) documents.add(document.toUpperCase());
    }));
    const dates = list.map((record) => record.generatedAt).filter(Boolean).sort();
    return {
      egrdtNumbers: numbers,
      egrdts: numbers.length,
      documents: documents.size,
      files,
      generatedAt: dates.length ? dates[dates.length - 1] : "",
    };
  }

  // "31/08/2026, 10:59" é o formato da coluna da tabela. Dentro de uma frase
  // ele fica truncado, então a mensagem usa a forma por extenso.
  function datePhrase(value) {
    const formatted = formatDate(value);
    const parts = formatted.split(",");
    return parts.length === 2 ? `${parts[0].trim()}, às ${parts[1].trim()}` : formatted;
  }

  function plural(count, singular, pluralWord) {
    return `${count.toLocaleString("pt-BR")} ${count === 1 ? singular : pluralWord}`;
  }

  function joinList(values) {
    const list = values.filter(Boolean);
    if (list.length <= 1) return list.join("");
    return `${list.slice(0, -1).join(", ")} e ${list[list.length - 1]}`;
  }

  function defaultSubject(summary) {
    const info = summary || { egrdtNumbers: [] };
    if (info.egrdtNumbers.length === 1) return `Documentos postados — ${info.egrdtNumbers[0]}`;
    if (info.egrdtNumbers.length > 1) return `Documentos postados — ${plural(info.egrdtNumbers.length, "eGRDT", "eGRDTs")}`;
    return "Documentos postados";
  }

  /**
   * A mensagem é um ponto de partida editável, não um texto fechado: o painel
   * abre com ela preenchida e o operador ajusta antes de copiar.
   */
  function defaultMessage(summary) {
    const info = summary || { egrdtNumbers: [], documents: 0, files: 0, generatedAt: "" };
    const numbers = info.egrdtNumbers || [];
    const via = numbers.length
      ? ` por meio d${numbers.length === 1 ? "a eGRDT" : "as eGRDTs"} ${joinList(numbers)}`
      : "";
    const quando = info.generatedAt ? ` em ${datePhrase(info.generatedAt)}` : "";
    return `Prezado(a),\n\nInformamos que os documentos abaixo foram postados${via}${quando}.\n\nAtenciosamente,`;
  }

  function tableText(rows) {
    const lines = [COLUMNS.join("\t")];
    (rows || []).forEach((row) => lines.push(COLUMNS.map((column) => text(row[column]).replace(/[\t\r\n]+/g, " ")).join("\t")));
    return lines.join("\n");
  }

  // Sem largura por coluna, um título ou nome de arquivo longo esticava a
  // tabela inteira na resposta — cada coluna ganha uma largura fixa (em px,
  // também como atributo width para o Outlook respeitar) e o texto que não
  // cabe quebra dentro da própria célula, em vez de alargar a tabela.
  const COLUMN_WIDTHS = {
    "DATA DA GERAÇÃO / POSTAGEM": 80,
    "EGRDT": 115,
    "FAMÍLIA DOCUMENTAL": 55,
    "DOCUMENTO": 105,
    "TÍTULO": 140,
    "DISCIPLINA": 70,
    "ARQUIVO POSTADO": 130,
  };

  // Estilo embutido linha a linha: o Outlook descarta folhas de estilo e
  // qualquer regra que não esteja no próprio elemento colado.
  const TABLE_STYLE = "border-collapse:collapse;table-layout:fixed;width:695px;max-width:100%;border:1px solid #9FB3C3;font-family:Segoe UI,Calibri,Arial,sans-serif;font-size:9pt;color:#10222F";
  // O Outlook nem sempre herda o tamanho declarado no <table>; por isso o
  // cabeçalho e cada célula também carregam 9 pt no próprio style. O padding
  // reduzido (era 6px 10px) deixa cada linha mais baixa.
  const HEAD_STYLE = "border:1px solid #9FB3C3;background-color:#EAF1F6;padding:3px 6px;text-align:left;font-size:9pt;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
  const CELL_STYLE = "border:1px solid #9FB3C3;padding:3px 6px;text-align:left;vertical-align:top;font-size:9pt;word-wrap:break-word;word-break:break-word";

  function tableHtml(rows) {
    const head = COLUMNS.map((column) => `<th style="${HEAD_STYLE};width:${COLUMN_WIDTHS[column]}px" width="${COLUMN_WIDTHS[column]}">${escapeHtml(column)}</th>`).join("");
    const body = (rows || []).map((row) => {
      const cells = COLUMNS.map((column) => `<td style="${CELL_STYLE};width:${COLUMN_WIDTHS[column]}px" width="${COLUMN_WIDTHS[column]}">${escapeHtml(row[column])}</td>`).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    return `<table style="${TABLE_STYLE}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function messageHtml(message) {
    return text(message)
      .split(/\n{2,}/)
      .map((paragraph) => `<p style="margin:0 0 12px;font-family:Segoe UI,Calibri,Arial,sans-serif;font-size:10.5pt;color:#10222F">${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`)
      .join("");
  }

  function replyHtml(rows, message) {
    const intro = text(message) ? messageHtml(message) : "";
    return `<div>${intro}${tableHtml(rows)}</div>`;
  }

  function replyText(rows, message) {
    const intro = text(message);
    return intro ? `${intro}\n\n${tableText(rows)}` : tableText(rows);
  }

  /**
   * Monta tudo de uma vez. `options.message` permite substituir a mensagem
   * padrão (inclusive por texto vazio, quando só a tabela deve ser colada).
   */
  function build(records, options) {
    const config = options || {};
    const rows = rowsFromRecords(records);
    const summary = summarize(records);
    const message = config.message === null || config.message === undefined ? defaultMessage(summary) : text(config.message);
    return {
      columns: [...COLUMNS],
      rows,
      summary,
      subject: text(config.subject) || defaultSubject(summary),
      message,
      html: replyHtml(rows, message),
      text: replyText(rows, message),
      tableHtml: tableHtml(rows),
      tableText: tableText(rows),
    };
  }

  /**
   * mailto: tem limite prático de tamanho (cerca de 2 000 caracteres na maior
   * parte dos clientes) e não aceita HTML. Com relação grande, o link leva só
   * a mensagem — a tabela vai pela área de transferência.
   */
  function mailtoUrl(reply, options) {
    const config = options || {};
    const limit = Number(config.maxLength) > 0 ? Number(config.maxLength) : 1800;
    const subject = encodeURIComponent(text(reply && reply.subject));
    const full = text(reply && reply.text);
    const body = encodeURIComponent(full);
    if (body.length <= limit) return { url: `mailto:?subject=${subject}&body=${body}`, truncated: false };
    const short = encodeURIComponent(`${text(reply && reply.message)}\n\n[A relação dos documentos está na área de transferência: use Ctrl+V aqui.]`);
    return { url: `mailto:?subject=${subject}&body=${short}`, truncated: true };
  }

  return { COLUMNS, rowsFromRecords, summarize, defaultMessage, defaultSubject, tableText, tableHtml, replyText, replyHtml, build, mailtoUrl };
});
