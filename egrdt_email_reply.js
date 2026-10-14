/**
 * GRCON — Resposta de e-mail da eGRDT
 *
 * Depois de gerar a eGRDT (ou ao abrir uma eGRDT já registrada no histórico),
 * o operador precisa responder ao e-mail de quem pediu a emissão dizendo que
 * os documentos foram postados. Até aqui essa relação era montada à mão, ou
 * copiada da tabela do Histórico — e a cópia da tabela chegava ao Outlook
 * desmontada, uma célula por linha, porque cada `<td>` virava um bloco.
 *
 * Este módulo monta a mesma relação nas oito colunas que a resposta precisa
 * ter (data, eGRDT, família, documento, revisão, título, disciplina e arquivo
 * postado) e devolve as duas formas que a área de transferência entende: uma
 * tabela HTML com estilo embutido, que o cliente de e-mail cola como tabela
 * de verdade, e um texto separado por tabulação, que serve para e-mail em
 * texto puro e cola em colunas no Excel.
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

  // As oito colunas são as mesmas do relatório do Histórico, na ordem em que a
  // resposta do e-mail é lida. REVISÃO vem logo depois de DOCUMENTO, como na
  // planilha da GRDT — quem recebe a resposta confere documento e revisão
  // lado a lado, do mesmo jeito nos dois lugares.
  // Mudar a ordem aqui muda a tabela colada.
  const COLUMNS = [
    "DATA DA GERAÇÃO / POSTAGEM",
    "EGRDT",
    "FAMÍLIA DOCUMENTAL",
    "DOCUMENTO",
    "REVISÃO",
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
   * A revisão enviada na GRDT, na mesma ordem de preferência do relatório do
   * Histórico: o valor gravado no registro vem primeiro, e só um histórico
   * antigo — anterior à gravação da revisão — cai na dedução pelo nome do
   * arquivo postado. A resposta nunca recalcula uma revisão que já foi
   * enviada.
   */
  function revision(file) {
    const registered = text(file && file.grdtRevision) || text(file && file.revision);
    if (registered) return registered;
    const derived = History && History.generatedRevision ? text(History.generatedRevision(file)) : "";
    return derived || EMPTY;
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
      "REVISÃO": revision(file),
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
  // ele ganha o "às". Registros antigos que só tinham data acabam normalizados
  // pelo Histórico para meia-noite; nesse caso a resposta não inventa "00:00".
  function datePhrase(value) {
    const formatted = formatDate(value);
    if (!formatted || formatted === EMPTY) return "";
    const parts = formatted.split(",");
    if (parts.length !== 2) return formatted;
    const date = parts[0].trim();
    const time = parts[1].trim();
    return time && time !== "00:00" ? `${date}, às ${time}` : date;
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

  const FOLLOW_UP_MESSAGE = "Solicitamos, por gentileza, que seja consultada a Consulta Geral, disponibilizada diariamente, para verificação da efetivação da postagem e demais atualizações relacionadas ao envio.";

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
    const date = info.generatedAt ? datePhrase(info.generatedAt) : "";
    const quando = date ? ` em ${date}` : "";
    return `Prezado(a),\n\nInformamos que os documentos abaixo foram postados${via}${quando}.\n\n${FOLLOW_UP_MESSAGE}`;
  }

  function tableText(rows) {
    const lines = [COLUMNS.join("\t")];
    (rows || []).forEach((row) => lines.push(COLUMNS.map((column) => text(row[column]).replace(/[\t\r\n]+/g, " ")).join("\t")));
    return lines.join("\n");
  }

  // A tabela acompanha a largura do corpo da mensagem: ela termina onde a
  // frase acima dela termina, em vez de parar antes num bloco de 695 px com
  // uma faixa vazia à direita. Quem define isso é `width:100%` no <table>; as
  // colunas, por consequência, precisam de largura proporcional (em %), e não
  // em px — com px o Outlook manteria a soma antiga e distribuiria a sobra por
  // conta própria.
  //
  // TABLE_WIDTH deixa de ser a largura impressa e passa a ser a referência de
  // proporção: é dela que sai a porcentagem de cada coluna. Mexer numa largura
  // continua sendo redistribuir, nunca somar — o total é fixo.
  //
  // O piso de cada largura é a maior palavra do próprio título, no tamanho do
  // cabeçalho, mais o preenchimento e a borda: numa coluna mais estreita que
  // isso o Outlook parte a palavra ao meio ("FAMÍL / IA DOCU / MENT / AL") e
  // quem recebe a resposta não lê mais o nome da coluna. Com o cabeçalho a
  // 10 pt (era 8 pt) esses pisos crescem um quarto: DATA 91 ("POSTAGEM"),
  // EGRDT 62, FAMÍLIA DOCUMENTAL 108 ("DOCUMENTAL"), DOCUMENTO 102,
  // REVISÃO 74, TÍTULO 63, DISCIPLINA 91 e ARQUIVO POSTADO 79 — 670 ao todo.
  // Os 110 restantes vão para as colunas de conteúdo longo: eGRDT, documento,
  // título e nome do arquivo.
  //
  // DISCIPLINA é a exceção que a fonte maior criou: seu piso vem do título
  // ("DISCIPLINA", 91), mas o conteúdo mais comum é "COMISSIONAMENTO", que a
  // 10 pt não cabe nesses 91 e quebrava ao meio ("COMISSIONAME / NTO"). Ela
  // recebe 107 — o bastante para a palavra inteira — tirados de DOCUMENTO e
  // TÍTULO, que quebram em hífen e em espaço sem prejudicar a leitura.
  const TABLE_WIDTH = 780;
  const COLUMN_WIDTHS = {
    "DATA DA GERAÇÃO / POSTAGEM": 91,
    "EGRDT": 87,
    "FAMÍLIA DOCUMENTAL": 108,
    "DOCUMENTO": 119,
    "REVISÃO": 74,
    "TÍTULO": 90,
    "DISCIPLINA": 107,
    "ARQUIVO POSTADO": 104,
  };

  // A revisão é um código de um ou dois caracteres numa coluna estreita:
  // centralizada ela fica sob o próprio título, em vez de encostada na borda
  // de uma célula quase vazia. As demais colunas continuam à esquerda.
  const COLUMN_ALIGN = { "REVISÃO": "center" };

  function align(column) {
    return COLUMN_ALIGN[column] || "left";
  }

  // A porcentagem de cada coluna vem da proporção declarada acima. A última
  // absorve o arredondamento das demais, para a soma fechar exatamente em
  // 100% — sobra ou falta de centésimo faz o Outlook recalcular a tabela toda.
  const COLUMN_PERCENTS = (() => {
    const total = Object.values(COLUMN_WIDTHS).reduce((sum, width) => sum + width, 0);
    const percents = {};
    let used = 0;
    COLUMNS.forEach((column, index) => {
      if (index === COLUMNS.length - 1) {
        percents[column] = Math.round((100 - used) * 100) / 100;
        return;
      }
      const value = Math.round((COLUMN_WIDTHS[column] / total) * 10000) / 100;
      percents[column] = value;
      used += value;
    });
    return percents;
  })();

  function columnWidth(column) {
    return `${COLUMN_PERCENTS[column]}%`;
  }

  function tableHtml(rows) {
    return configurableTableHtml(rows, { styles: { padding: 3, paddingHorizontal: 6 } });
  }

  function messageTypography(options) {
    const styles = options?.styles || {};
    const size = bounded(styles.messageFontSize, bounded(styles.fontSize, 10.5, 8, 24), 8, 24);
    const font = safeFont(styles.fontFamily);
    const color = safeColor(styles.bodyColor, "#10222F");
    const line = Math.round(size * bounded(styles.lineHeight, 1.3, 1, 2.5) * 100) / 100;
    const gap = bounded(styles.paragraphSpacing, 12, 0, 32);
    const typography = `font-family:${font};font-size:${size}pt;mso-bidi-font-size:${size}pt;line-height:${line}pt;color:${color}`;
    return { typography, paragraph: `margin:0 0 ${gap}px;mso-margin-top-alt:0;mso-margin-bottom-alt:${gap * 0.75}pt;mso-line-height-rule:at-least;${typography}` };
  }

  function messageParagraphs(paragraphs, options) {
    const style = messageTypography(options);
    return paragraphs.map(paragraph => `<p style="${style.paragraph}"><span style="${style.typography}">${paragraph}</span></p>`).join("");
  }

  function messageHtml(message, options) {
    return messageParagraphs(text(message).split(/\n{2,}/)
      .map(paragraph => escapeHtml(paragraph).replace(/\n/g, "<br/>")), options);
  }

  function defaultMessageHtml(summary, options) {
    const info = summary || { egrdtNumbers: [], generatedAt: "" };
    const numbers = info.egrdtNumbers || [];
    const label = numbers.length === 1 ? "eGRDT" : "eGRDTs";
    const via = numbers.length
      ? ` por meio d${numbers.length === 1 ? "a" : "as"} <strong>${escapeHtml(`${label} ${joinList(numbers)}`)}</strong>`
      : "";
    const date = info.generatedAt ? datePhrase(info.generatedAt) : "";
    const quando = date ? ` em <strong>${escapeHtml(date)}</strong>` : "";
    return messageParagraphs([
      "Prezado(a),",
      `Informamos que os documentos abaixo foram postados${via}${quando}.`,
      `<strong>${escapeHtml(FOLLOW_UP_MESSAGE)}</strong>`,
    ], options);
  }

  function templateMessage(template, summary) {
    const raw = text(template);
    if (!raw) return defaultMessage(summary);
    const numbers = summary && summary.egrdtNumbers || [];
    const values = {
      "{{egrdt}}": numbers[0] || "",
      "{{egrdts}}": joinList(numbers),
      "{{data}}": summary && summary.generatedAt ? datePhrase(summary.generatedAt) : "",
      "{{documentos}}": String(summary && summary.documents || 0),
      "{{arquivos}}": String(summary && summary.files || 0),
    };
    return Object.entries(values).reduce((value, pair) => value.split(pair[0]).join(pair[1]), raw);
  }

  function normalizeColumns(value) {
    const requested = Array.isArray(value) ? value.map(text).filter((column) => COLUMNS.includes(column)) : [];
    const unique = [...new Set(requested)];
    return unique.length ? unique : [...COLUMNS];
  }

  function safeColor(value, fallback) {
    const candidate = text(value);
    return /^#[0-9A-F]{6}$/i.test(candidate) ? candidate.toUpperCase() : fallback;
  }

  function safeFont(value) {
    const allowed = {
      "Segoe UI": "Segoe UI,Calibri,Arial,sans-serif",
      "Calibri": "Calibri,Segoe UI,Arial,sans-serif",
      "Arial": "Arial,Helvetica,sans-serif",
      "Verdana": "Verdana,Arial,sans-serif",
    };
    return allowed[text(value)] || "Segoe UI,Calibri,Arial,sans-serif";
  }

  function bounded(value, fallback, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function configurableTableText(rows, columns, config) {
    const selected = normalizeColumns(columns);
    const labels = config?.columnLabels || {};
    const lines = [(config?.showHeader === false ? [] : selected.map(column => text(labels[column]) || column)).join("\t")].filter(Boolean);
    (rows || []).forEach((row) => lines.push(selected.map((column) => text(row[column]).replace(/[\t\r\n]+/g, " ")).join("\t")));
    return lines.join("\n");
  }

  function configurableTableHtml(rows, options) {
    const config = options || {};
    const columns = normalizeColumns(config.columns);
    const styles = config.styles || {};
    const font = safeFont(styles.fontFamily);
    const size = bounded(styles.fontSize, 10, 8, 24);
    const border = safeColor(styles.borderColor, "#9FB3C3");
    const borderWidth = bounded(styles.borderWidth, 1, 0, 4);
    const padding = bounded(styles.padding, 3, 0, 24);
    const horizontal = bounded(styles.paddingHorizontal, padding, 0, 24);
    const cellPadding = padding === horizontal ? padding + "px" : padding + "px " + horizontal + "px";
    const headerBackground = safeColor(styles.headerBackground, "#EAF1F6");
    const headerColor = safeColor(styles.headerColor, "#10222F");
    const bodyColor = safeColor(styles.bodyColor, "#10222F");
    const bodyBackground = safeColor(styles.bodyBackground, "#FFFFFF");
    const baseWidths = columns.map(column => bounded(config.columnWidths?.[column], COLUMN_WIDTHS[column] || 100, 1, 1000));
    const total = baseWidths.reduce((sum, width) => sum + width, 0) || 1;
    // Distribuir o arredondamento na última coluna evita um total diferente de 100%.
    const widths = {};
    let allocated = 0;
    columns.forEach((column, index) => {
      const percentage = index === columns.length - 1
        ? Math.round((100 - allocated) * 100) / 100
        : Math.round(baseWidths[index] / total * 10000) / 100;
      widths[column] = percentage;
      allocated += percentage;
    });
    const width = bounded(styles.tableWidth, 100, 20, 100);
    const alignment = column => ["left", "center", "right"].includes(config.columnAlign?.[column]) ? config.columnAlign[column] : align(column);
    const tableStyle = "border-collapse:collapse;table-layout:fixed;width:" + width + "%;border:" + borderWidth + "px solid " + border + ";font-family:" + font + ";font-size:" + size + "pt;color:" + bodyColor;
    const line = Math.round(size * bounded(styles.lineHeight, 1.3, 1, 2.5) * 100) / 100;
    const typography = "font-family:" + font + ";font-size:" + size + "pt;mso-bidi-font-size:" + size + "pt;line-height:" + line + "pt";
    const officePadding = padding * .75 + "pt " + horizontal * .75 + "pt " + padding * .75 + "pt " + horizontal * .75 + "pt";
    const common = "border:" + borderWidth + "px solid " + border + ";padding:" + cellPadding + ";vertical-align:top;font-size:" + size + "pt;word-wrap:break-word;word-break:break-word";
    const headStyle = "border:" + borderWidth + "px solid " + border + ";padding:" + cellPadding + ";vertical-align:top;font-size:" + size + "pt;background-color:" + headerBackground + ";color:" + headerColor + ";font-weight:bold;white-space:normal;word-wrap:break-word;word-break:normal";
    const cellStyle = common + ";" + typography + ";mso-padding-alt:" + officePadding + ";background-color:" + bodyBackground + ";color:" + bodyColor;
    const content = (value, color, bold) => '<p style="margin:0;mso-margin-top-alt:0;mso-margin-bottom-alt:0;' + typography + ';color:' + color + ';font-weight:' + (bold ? 'bold' : 'normal') + '"><span style="' + typography + ';color:' + color + ';font-weight:' + (bold ? 'bold' : 'normal') + '">' + escapeHtml(value) + '</span></p>';
    const head = columns.map(column => '<th bgcolor="' + headerBackground + '" style="' + headStyle + ';' + typography + ';mso-padding-alt:' + officePadding + ';text-align:' + alignment(column) + ';width:' + widths[column] + '%" width="' + widths[column] + '%">' + content(config.columnLabels?.[column] || column, headerColor, true) + '</th>').join("");
    const body = (rows || []).map(row => "<tr>" + columns.map(column => '<td bgcolor="' + bodyBackground + '" style="' + cellStyle + ';text-align:' + alignment(column) + ';width:' + widths[column] + '%" width="' + widths[column] + '%">' + content(row[column], bodyColor, false) + '</td>').join("") + "</tr>").join("");
    return '<table cellspacing="0" cellpadding="' + padding + '" style="' + tableStyle + '" width="' + width + '%">' + (config.showHeader === false ? "" : '<thead><tr>' + head + '</tr></thead>') + '<tbody>' + body + '</tbody></table>';
  }

  function replyHtml(rows, message, defaultSummary, options) {
    const intro = defaultSummary ? defaultMessageHtml(defaultSummary, options) : (text(message) ? messageHtml(message, options) : "");
    return `<div>${intro}${options ? configurableTableHtml(rows, options) : tableHtml(rows)}</div>`;
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
    const standardMessage = defaultMessage(summary);
    const configuredDefault = config.messageTemplate ? templateMessage(config.messageTemplate, summary) : standardMessage;
    const message = config.message === null || config.message === undefined ? configuredDefault : text(config.message);
    const useStandardHtml = !config.messageTemplate && message === standardMessage;
    const columns = normalizeColumns(config.columns);
    const customTableHtml = configurableTableHtml(rows, config);
    const customTableText = configurableTableText(rows, columns, config);
    const customized = Boolean(config.columns || config.styles || config.columnLabels || config.columnWidths || config.columnAlign || config.showHeader === false);
    const outputTableHtml = customized ? customTableHtml : tableHtml(rows);
    const outputTableText = customized ? customTableText : tableText(rows);
    const outputMessageHtml = message ? (useStandardHtml ? defaultMessageHtml(summary, config) : messageHtml(message, config)) : "";
    return {
      columns,
      rows,
      summary,
      subject: text(config.subject) || defaultSubject(summary),
      message,
      // A prévia e o conteúdo copiado compartilham os mesmos fragmentos HTML.
      messageHtml: outputMessageHtml,
      html: '<div data-grcon-email-fragment><div data-grcon-email-message>' + outputMessageHtml + '</div>' + outputTableHtml + '</div>',
      text: message ? message + "\n\n" + outputTableText : outputTableText,
      tableHtml: outputTableHtml,
      tableText: outputTableText,
      template: { ...config, columns, styles: config.styles || {}, messageTemplate: text(config.messageTemplate) },
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

  return { COLUMNS, COLUMN_WIDTHS, COLUMN_PERCENTS, COLUMN_ALIGN, TABLE_WIDTH, revision, rowsFromRecords, summarize, defaultMessage, defaultSubject, templateMessage, normalizeColumns, configurableTableText, configurableTableHtml, tableText, tableHtml, replyText, replyHtml, build, mailtoUrl };
});
