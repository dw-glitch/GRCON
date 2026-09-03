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

  // Estilo embutido linha a linha: o Outlook descarta folhas de estilo e
  // qualquer regra que não esteja no próprio elemento colado.
  const TABLE_STYLE = "border-collapse:collapse;table-layout:fixed;width:100%;border:1px solid #9FB3C3;font-family:Segoe UI,Calibri,Arial,sans-serif;font-size:10pt;color:#10222F";
  // O Outlook nem sempre herda o tamanho declarado no <table>; por isso o
  // cabeçalho e cada célula carregam o próprio tamanho no style. Cabeçalho e
  // corpo ficam ambos em 10 pt: a tabela agora ocupa a largura da mensagem,
  // então o espaço que antes obrigava a 8/9 pt deixou de ser escasso. O
  // padding reduzido (era 6px 10px) continua deixando cada linha baixa.
  //
  // O cabeçalho quebra em mais de uma linha em vez de cortar o nome da coluna
  // com reticências: com oito colunas, "DATA DA GERAÇÃO / POSTAGEM" não cabe
  // em uma linha, e um título cortado deixa quem recebe a resposta sem saber o
  // que a coluna traz. São duas ou três linhas uma única vez, no topo da
  // tabela, e a quebra acontece nos espaços. `word-wrap` sozinho (sem
  // `word-break`) é o que garante isso: ele parte a palavra só quando ela não
  // cabe sozinha na linha.
  const HEAD_STYLE = "border:1px solid #9FB3C3;background-color:#EAF1F6;padding:3px 6px;font-size:10pt;font-weight:bold;vertical-align:bottom;white-space:normal;word-wrap:break-word";
  const CELL_STYLE = "border:1px solid #9FB3C3;padding:3px 6px;vertical-align:top;font-size:10pt;word-wrap:break-word;word-break:break-word";

  function tableHtml(rows) {
    const head = COLUMNS.map((column) => `<th style="${HEAD_STYLE};text-align:${align(column)};width:${columnWidth(column)}" width="${columnWidth(column)}">${escapeHtml(column)}</th>`).join("");
    const body = (rows || []).map((row) => {
      const cells = COLUMNS.map((column) => `<td style="${CELL_STYLE};text-align:${align(column)};width:${columnWidth(column)}" width="${columnWidth(column)}">${escapeHtml(row[column])}</td>`).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    return `<table style="${TABLE_STYLE}" width="100%"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
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

  return { COLUMNS, COLUMN_WIDTHS, COLUMN_PERCENTS, COLUMN_ALIGN, TABLE_WIDTH, revision, rowsFromRecords, summarize, defaultMessage, defaultSubject, tableText, tableHtml, replyText, replyHtml, build, mailtoUrl };
});
