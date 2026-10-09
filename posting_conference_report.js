(function (root, factory) {
  const api = factory(root, root.GrconPostingConference);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconPostingConferenceReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, Conference) {
  "use strict";

  const BLUE = "155C8A";
  const DARK = "16324A";
  const LIGHT = "EAF2F7";
  const BORDER = "D5DEE5";
  const WHITE = "FFFFFF";
  const TEXT = "253746";
  const MUTED = "5B6770";
  const SIGEM_FILL = "F3F6F8";

  function text(value) { return Conference?.text ? Conference.text(value) : String(value ?? "").trim(); }
  function fmtDate(value, withTime) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return text(value);
    return new Intl.DateTimeFormat("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(date);
  }

  function safeName(value) {
    return text(value).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "Conferencia_Postagem";
  }

  function downloadName(options) {
    const now = new Date();
    const stamp = `${String(now.getFullYear())}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const suffix = text(options && options.scopeLabel);
    return `${safeName(`Relatorio_Conferencia_Postagem${suffix ? `_${suffix}` : ""}_${stamp}`)}.xlsx`;
  }

  function borderStyle() {
    return {
      top: { style: "thin", color: { argb: BORDER } },
      left: { style: "thin", color: { argb: BORDER } },
      bottom: { style: "thin", color: { argb: BORDER } },
      right: { style: "thin", color: { argb: BORDER } },
    };
  }

  function applyConferenceStyle(cell, status) {
    const styles = {
      CONFIRMADO: { fill: "E4F3EA", font: "216E43" },
      AGUARDANDO: { fill: "FFF6D8", font: "775D00" },
      REVISAO_DIVERGENTE: { fill: "FFE9D5", font: "8A4B08" },
      NAO_ENCONTRADO: { fill: "FCE8E8", font: "8F2D2D" },
      REQUER_ANALISE: { fill: "EFE9FA", font: "5A3B84" },
      NAO_VERIFICADO: { fill: "EEF1F4", font: "53606A" },
    };
    const style = styles[status] || styles.NAO_VERIFICADO;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.fill } };
    cell.font = { name: "Arial", bold: true, color: { argb: style.font }, size: 9 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }

  function applySigemStyle(cell) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SIGEM_FILL } };
    cell.font = { name: "Arial", size: 9, color: { argb: TEXT } };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  }

  function sigemValue(value) {
    if (value === null || value === undefined) return "—";
    const raw = String(value);
    return raw.trim() ? raw : "—";
  }

  async function addLogo(workbook, sheet) {
    try {
      const brand = root.GRCONBrandAssets || {};
      let imageConfig = null;
      if (brand.reportLogoBase64) imageConfig = { base64: brand.reportLogoBase64, extension: "png" };
      else if (typeof fetch === "function") {
        const response = await fetch(root.document ? (brand.reportLogoFile || "grcon-logo-report.png") : new URL("../" + (brand.reportLogoFile || "grcon-logo-report.png"), root.location.href), { cache: "no-store" });
        if (response.ok) imageConfig = { buffer: await response.arrayBuffer(), extension: "png" };
      }
      if (!imageConfig) return false;
      const imageId = workbook.addImage(imageConfig);
      sheet.addImage(imageId, { tl: { col: 0.18, row: 0.28 }, ext: { width: 132, height: 42 } });
      return true;
    } catch (error) {
      console.debug("[PostingConferenceReport] logo:", error);
      return false;
    }
  }

  function statusText(row) {
    return row.conferenceLabel || row.statusLabel || Conference?.statusLabel?.(row.status) || row.status || "";
  }

  function eventList(row) {
    const sends = Array.isArray(row.sends) ? row.sends : [];
    return sends.map((send) => [
      send.egrdtNumber || "eGRDT não informada",
      fmtDate(send.generatedAt, false) || "data não informada",
      `Rev. ${send.revisionSent || "—"}`,
      statusText(send) || "Não verificado",
    ].join(" — ")).join("\n");
  }

  function emissionPurpose(value) {
    return text(value) || "Não identificado";
  }

  function documentPurpose(row) {
    const sends = Array.isArray(row.sends) ? row.sends : [];
    if (!sends.length) return emissionPurpose(row.purpose);
    // Cada propósito permanece associado à própria eGRDT e revisão, mesmo em repostagens.
    return sends.map((send) => [
      text(send.egrdtNumber) || "eGRDT não identificada",
      `Rev. ${text(send.revisionSent) || "—"}`,
      emissionPurpose(send.purpose),
    ].join(" — ")).join("\n");
  }

  function dataRowHeight(row, mode) {
    const noteLength = String(row?.note || "").length;
    const sends = mode === "documents" ? Math.min(6, Number(row?.sendCount || 1)) : 1;
    const base = Math.max(28, 18 + sends * 12);
    if (noteLength > 220) return Math.max(base, 58);
    if (noteLength > 120) return Math.max(base, 48);
    if (noteLength > 60) return Math.max(base, 38);
    return base;
  }

  function documentHeaders() {
    return [
      "Código", "Tipo", "Disciplina", "eGRDTs emitidas / histórico de envios", "Qtd. envios", "Repostagens",
      "Último envio", "eGRDT mais recente", "PROPÓSITO DE EMISSÃO", "Revisão atual", "Revisões históricas", "Revisão encontrada",
      "Conferência", "Status SIGEM", "Data da confirmação", "Última conferência", "Observação",
    ];
  }

  function eventHeaders() {
    return [
      "Código", "Tipo", "Disciplina", "eGRDT", "Data eGRDT", "Revisão enviada",
      "PROPÓSITO DE EMISSÃO", "Revisão encontrada", "Conferência", "Status SIGEM", "Data da confirmação", "Última conferência", "Observação",
    ];
  }

  function documentValues(row) {
    return [
      row.document,
      row.documentFamily || row.sheet,
      row.discipline,
      eventList(row),
      Number(row.sendCount || 0),
      Number(row.repostCount || 0),
      fmtDate(row.latestSendAt || row.generatedAt, false),
      Conference.pertinentGrdt(row) || "GRDT não identificada",
      documentPurpose(row),
      row.currentRevision || row.revisionSent,
      (row.revisions || []).join(" · "),
      row.revisionFound,
      statusText(row),
      sigemValue(row.sigemStatus),
      fmtDate(row.firstConfirmedAt, true),
      fmtDate(row.lastCheckedAt, true),
      row.note,
    ];
  }

  function eventValues(row) {
    return [
      row.document,
      row.documentFamily || row.sheet,
      row.discipline,
      row.egrdtNumber,
      fmtDate(row.generatedAt, false),
      row.revisionSent,
      emissionPurpose(row.purpose),
      row.revisionFound,
      statusText(row),
      sigemValue(row.sigemStatus),
      fmtDate(row.firstConfirmedAt, true),
      fmtDate(row.lastCheckedAt, true),
      row.note,
    ];
  }

  // A planilha de pendências é UMA linha por código documental, mesmo que
  // tenha múltiplas revisões ou repostagens. Eventos permanecem intactos em
  // pendingEvents, e a lista completa de envios permanece em sends.
  function consolidatePendingDocuments(rows) {
    const groups = new Map();
    (rows || []).forEach((row) => {
      if (!row) return;
      const identity = text(row.documentIdentity) || Conference.documentIdentity(row.document);
      if (!identity) return;
      let group = groups.get(identity);
      if (!group) {
        group = { identity, aggregate: null, events: new Map() };
        groups.set(identity, group);
      }
      if (Array.isArray(row.sends) && row.sends.length) group.aggregate = row;
      const pending = Array.isArray(row.pendingEvents) ? row.pendingEvents
        : (Array.isArray(row.sends) ? row.sends : [row]);
      pending.filter(event => event && event.status !== Conference.STATUSES.CONFIRMED)
        .forEach((event) => {
          const key = text(event.key) || [
            Conference.norm(event.egrdtNumber), Conference.normalizeRevision(event.revisionSent),
            text(event.generatedAt),
          ].join("|");
          if (!group.events.has(key)) group.events.set(key, event);
        });
    });
    const time = (event) => Date.parse(event?.generatedAt || "") || 0;
    return [...groups.values()].filter(group => group.events.size).map((group) => {
      const pendingEvents = [...group.events.values()].sort((a, b) =>
        time(b) - time(a) || text(b.egrdtNumber).localeCompare(text(a.egrdtNumber), "pt-BR", { numeric: true }));
      const aggregate = group.aggregate || pendingEvents[0];
      const sends = Array.isArray(aggregate.sends) && aggregate.sends.length
        ? aggregate.sends : pendingEvents;
      const latest = aggregate.latestSend || sends.reduce((best, event) =>
        !best || time(event) > time(best) ? event : best, null);
      return {
        ...pendingEvents[0], ...aggregate,
        documentIdentity: group.identity,
        pendingEvents,
        sends,
        latestSend: latest,
        latestEgrdtNumber: aggregate.latestEgrdtNumber || latest?.egrdtNumber || "",
      };
    }).sort((a, b) => time(b.pendingEvents[0]) - time(a.pendingEvents[0]));
  }

  function pendingDetails(row, groupsById) {
    const scopes = new Map();
    const events = row.pendingEvents || [];
    events.forEach(event => {
      const id = event.historyId || event.egrdtNumber;
      const key = Conference.norm(event.egrdtNumber) || text(id) || "GRDT não identificada";
      const sourceGroup = groupsById.get(id) || groupsById.get(event.egrdtNumber);
      const scope = event.pendingScope || Conference.pendingScope?.(sourceGroup)
        || { label: "GRDT a verificar", detail: "Não foi possível conferir a emissão completa." };
      if (!scopes.has(key)) scopes.set(key, { number: text(event.egrdtNumber) || "GRDT não identificada", scope });
    });
    const items = [...scopes.values()];
    if (!items.length) return ["GRDT a verificar", "Não foi possível conferir a emissão."];
    if (items.length === 1) return [items[0].scope.label, items[0].scope.detail];
    return [
      "Múltiplas GRDTs com pendências",
      items.map(({ number, scope }) => `${number} — ${scope.label}: ${scope.detail}`).join("\n"),
    ];
  }

  function pendingValues(row, groupsById) {
    // Os 13 campos históricos descrevem a ocorrência pendente mais recente.
    // A última eGRDT real (que pode ser outra) aparece em campo explícito.
    const pending = row.pendingEvents || [];
    const representative = pending[0] || row;
    const [label, detail] = pendingDetails(row, groupsById);
    const history = row.sends || pending;
    const historyText = history.map(event => [
      text(event.egrdtNumber) || "eGRDT não informada",
      fmtDate(event.generatedAt, false) || "sem data",
      `Rev. ${text(event.revisionSent) || "—"}`,
      emissionPurpose(event.purpose),
      statusText(event),
    ].join(" — ")).join("\n");
    const pendingRevisions = [...new Set(pending.map(event =>
      Conference.normalizeRevision(event.revisionSent)).filter(Boolean))].join(" · ");
    return [
      ...eventValues(representative),
      label, detail,
      row.latestEgrdtNumber || representative.egrdtNumber || "",
      historyText,
      pendingRevisions,
    ];
  }

  // Todos os relatórios utilizam o padrão visual GRCON. A visão Pendências
  // mantém TODAS as colunas originais de auditoria e acrescenta o alcance
  // da pendência; sua diferença é conter uma única aba com as pendências.
  async function buildWorkbook(rows, options) {
    if (root.document && typeof Worker === "function") {
      try {
        await root.GRCONModuleLoader?.ensure("performance");
        if (root.GrconPerformance?.supported) return await root.GrconPerformance.buildSpreadsheet("conference", { rows, options });
      } catch (error) { console.warn("[GRCON] Exportação da Conferência em modo compatível", error); }
    }
    if (!root.ExcelJS) throw new Error("ExcelJS não está disponível para gerar o relatório.");
    const source = options?.pending ? consolidatePendingDocuments(rows) : (rows || []);
    const mode = options?.pending || options?.mode === "events" ? "events" : "documents";
    // O grupo completo é necessário para distinguir um documento pendente
    // de uma GRDT integralmente pendente, mesmo com filtros aplicados.
    const pendingGroups = new Map((options?.groups || []).map(group =>
      [group.historyId || group.egrdtNumber, group]));
    const summaryRows = options?.pending ? source.map(row => row.pendingEvents[0]) : source;
    const summary = Conference?.summarize ? Conference.summarize(summaryRows) : {};
    const workbook = new root.ExcelJS.Workbook();
    workbook.creator = "GRCON";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.subject = "Relatório de Conferência — Consulta Geral × Histórico";
    workbook.title = "Relatório de Conferência — Consulta Geral × Histórico";

    const headers = options?.pending
      ? [...eventHeaders(), "Pendência da GRDT", "Detalhamento da pendência", "Última eGRDT enviada", "Histórico de eGRDTs", "Revisões pendentes"]
      : (mode === "documents" ? documentHeaders() : eventHeaders());
    const columnCount = headers.length;
    const lastColumn = String.fromCharCode(64 + Math.min(columnCount, 26));
    const sheet = workbook.addWorksheet(options?.pending ? "Detalhamento" : "RESUMO", { views: [{ state: "frozen", ySplit: 10, xSplit: 2 }] });
    sheet.properties.defaultRowHeight = 18;

    sheet.mergeCells("A1:C3");
    sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
    sheet.mergeCells(`D1:${lastColumn}2`);
    const title = sheet.getCell("D1");
    title.value = options?.pending
      ? "RELATÓRIO DE CONFERÊNCIA — DOCUMENTOS PENDENTES"
      : mode === "documents" ? "RELATÓRIO DE CONFERÊNCIA — DOCUMENTOS ÚNICOS"
        : "RELATÓRIO DE CONFERÊNCIA — AUDITORIA POR eGRDT";
    title.font = { name: "Arial", size: 15, bold: true, color: { argb: DARK } };
    title.alignment = { vertical: "middle", horizontal: "left", wrapText: true };

    sheet.mergeCells(`D3:${lastColumn}3`);
    const subtitle = sheet.getCell("D3");
    subtitle.value = `Histórico de eGRDTs × Consulta Geral SIGEM${options?.baseFileName ? ` · Base: ${options.baseFileName}` : ""}`;
    subtitle.font = { name: "Arial", size: 9, color: { argb: MUTED } };
    subtitle.alignment = { vertical: "middle", horizontal: "left" };
    sheet.getRow(1).height = 24;
    sheet.getRow(2).height = 22;
    sheet.getRow(3).height = 18;

    for (let col = 1; col <= columnCount; col += 1) {
      sheet.getCell(4, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
    }
    sheet.getRow(4).height = 5;
    await addLogo(workbook, sheet);

    const kpis = options?.pending ? [
      ["Documentos pendentes", source.length],
      ["Envios pendentes", source.reduce((sum, row) => sum + row.pendingEvents.length, 0)],
      ["eGRDTs pendentes", new Set(source.flatMap(row => row.pendingEvents.map(event => Conference.norm(event.egrdtNumber)).filter(Boolean))).size],
      ["Não postado ainda", summary.awaiting || 0],
      ["Rev. divergente", summary.divergent || 0],
      ["Não encontrado", summary.notFound || 0],
      ["Requer análise", summary.review || 0],
    ] : mode === "documents" ? [
      ["Documentos únicos", summary.total || 0],
      ["Envios", summary.sendCount || 0],
      ["eGRDTs", summary.egrdtCount || 0],
      ["Repostagens", summary.repostCount || 0],
      ["Postado", summary.confirmed || 0],
      ["Pendentes", summary.pending || 0],
      ["% postado", `${Number(summary.percentConfirmed || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`],
    ] : [
      ["Ocorrências", summary.total || source.length],
      ["Postado", summary.confirmed || 0],
      ["Não postado ainda", summary.awaiting || 0],
      ["Rev. divergente", summary.divergent || 0],
      ["Não encontrado", summary.notFound || 0],
      ["Requer análise", summary.review || 0],
      ["% postado", `${Number(summary.percentConfirmed || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`],
    ];
    kpis.forEach(([label, value], index) => {
      const startCol = index + 1;
      const labelCell = sheet.getCell(5, startCol);
      const valueCell = sheet.getCell(6, startCol);
      labelCell.value = label;
      valueCell.value = value;
      labelCell.font = { name: "Arial", size: 8, bold: true, color: { argb: MUTED } };
      valueCell.font = { name: "Arial", size: 13, bold: true, color: { argb: DARK } };
      labelCell.fill = valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
      labelCell.border = valueCell.border = borderStyle();
      labelCell.alignment = valueCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
    sheet.getRow(5).height = 20;
    sheet.getRow(6).height = 24;

    sheet.mergeCells(`A8:${lastColumn}8`);
    const scope = sheet.getCell("A8");
    scope.value = `${text(options?.scopeLabel) || (mode === "documents" ? "Todos os documentos únicos" : "Auditoria por eGRDT")} · Base atualizada em ${fmtDate(options?.baseImportedAt, true) || "—"} · Relatório gerado em ${fmtDate(new Date().toISOString(), true)}`;
    scope.font = { name: "Arial", size: 8, color: { argb: MUTED } };
    scope.alignment = { vertical: "middle", horizontal: "left" };

    const headerRow = sheet.getRow(10);
    headerRow.values = headers;
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.font = { name: "Arial", size: 9, bold: true, color: { argb: WHITE } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = borderStyle();
    });

    source.forEach((row, index) => {
      const excelRow = sheet.getRow(11 + index);
      if (options?.pending) {
        excelRow.values = pendingValues(row, pendingGroups);
      } else {
        excelRow.values = mode === "documents" ? documentValues(row) : eventValues(row);
      }
      excelRow.height = dataRowHeight(row, mode);
      excelRow.font = { name: "Arial", size: 9, color: { argb: TEXT } };
      excelRow.alignment = { vertical: "top", wrapText: true };
      excelRow.eachCell((cell) => { cell.border = borderStyle(); });
      const conferenceColumn = mode === "documents" ? 13 : 9;
      const sigemColumn = conferenceColumn + 1;
      if (index % 2 === 1) {
        excelRow.eachCell((cell, colNumber) => {
          if (colNumber !== conferenceColumn && colNumber !== sigemColumn) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F8FAFB" } };
        });
      }
      applyConferenceStyle(excelRow.getCell(conferenceColumn),
        options?.pending ? row.pendingEvents[0].status : row.status);
      applySigemStyle(excelRow.getCell(sigemColumn));
      if (options?.pending) {
        excelRow.getCell(14).font = { name: "Arial", size: 9, bold: true, color: { argb: DARK } };
        excelRow.getCell(15).alignment = { vertical: "middle", wrapText: true };
        excelRow.height = Math.min(240, Math.max(excelRow.height || 0, 42, Math.min(row.sends?.length || 1, 8) * 21));
        excelRow.getCell(16).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        excelRow.getCell(17).alignment = { vertical: "top", wrapText: true };
        excelRow.getCell(18).alignment = { vertical: "middle", wrapText: true };
      }
      excelRow.getCell(1).font = { name: "Arial", size: 9, bold: true, color: { argb: DARK } };
      if (mode === "documents") {
        [5, 6, 7, 10, 12, 15, 16].forEach((col) => { excelRow.getCell(col).alignment = { vertical: "middle", horizontal: "center", wrapText: true }; });
      } else {
        [5, 6, 8, 11, 12].forEach((col) => { excelRow.getCell(col).alignment = { vertical: "middle", horizontal: "center", wrapText: true }; });
      }
    });

    const lastRow = Math.max(10, 10 + source.length);
    sheet.autoFilter = { from: { row: 10, column: 1 }, to: { row: lastRow, column: columnCount } };
    sheet.columns = mode === "documents" ? [
      { width: 34 }, { width: 13 }, { width: 18 }, { width: 56 }, { width: 12 }, { width: 13 }, { width: 14 }, { width: 31 }, { width: 50 },
      { width: 13 }, { width: 20 }, { width: 19 }, { width: 20 }, { width: 24 }, { width: 20 }, { width: 20 }, { width: 48 },
    ] : [
      { width: 34 }, { width: 13 }, { width: 18 }, { width: 31 }, { width: 13 }, { width: 15 }, { width: 38 },
      { width: 19 }, { width: 20 }, { width: 24 }, { width: 20 }, { width: 20 }, { width: 48 },
    ];
    if (options?.pending) {
      sheet.getColumn(14).width = 32;
      sheet.getColumn(15).width = 56;
      sheet.getColumn(16).width = 31;
      sheet.getColumn(17).width = 76;
      sheet.getColumn(18).width = 24;
    }
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    sheet.pageMargins = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
    sheet.headerFooter.oddFooter = "&LGRCON&CRelatório de Conferência — Consulta Geral × Histórico&R&P / &N";

    // Relatórios por GRDT partem dos eventos da emissão, e não do documento
    // consolidado associado à última GRDT. Nenhum documento confirmado é ocultado.
    const groups = Array.isArray(options?.groups) ? options.groups : [];
    if (groups.length && !options?.pending) {
      const safe = (value) => {
        if (value == null) return "";
        if (typeof value === "number" || typeof value === "boolean") return value;
        const str = String(value);
        return /^[=+@]/.test(str) ? "'" + str : str;
      };
      const addSheet = (name, headers, rows) => {
        const ws = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
        ws.columns = headers.map((header, index) => ({ header, width: index === 0 ? 28 : index === headers.length - 1 ? 64 : 22 }));
        rows.forEach((row) => ws.addRow(row.map(safe)));
        const top = ws.getRow(1);
        top.font = { name: "Arial", bold: true, color: { argb: WHITE } };
        top.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
        top.alignment = { wrapText: true, vertical: "middle" };
        top.height = 27;
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, ws.rowCount), column: headers.length } };
        return ws;
      };
      const groupRows = groups.flatMap((g) => g.rows.map((row) => ({ group: g, row, d: row.diagnosis || {} })));
      const detailValues = ({ group: g, row, d }) => [
        g.egrdtNumber, row.document, row.revisionSent, row.revisionFound,
        row.purpose || "", row.sigemStatus || "", row.sigemStatusRevision || "",
        row.statusLabel || row.status || "",
        row.allocation?.label || "Alocação a confirmar",
        (d.allocations || []).join(" | "),
        (d.allocationReferences || []).map((ref) =>
          [ref.allocation, ref.allocationStatus, ref.workflow, ref.ldSheet, ref.sourceRow ? "Linha " + ref.sourceRow : ""].filter(Boolean).join(" · ")
        ).join(" | "),
        d.evidenceLevel || "", d.action || "", d.reason || row.note || "",
        row.confirmationSource || "", row.sigemSourceRow || "",
        d.baseReferenceDate || "", d.baseFileName || "",
      ];
      const detailHeaders = [
        "GRDT", "Documento", "Revisão enviada", "Revisão SIGEM", "PROPÓSITO DE EMISSÃO",
        "Status SIGEM", "Revisão do status SIGEM", "Conferência",
        "Documentos Previstos", "Número(s) alocação", "Central de Alocação / origem",
        "Nível da evidência", "Orientação", "Motivo / hipótese", "Fonte da confirmação",
        "Linha SIGEM", "Data Consulta Geral", "Arquivo Consulta Geral",
      ];
      addSheet("RESUMO GRDT", [
        "GRDT", "Data", "Documentos únicos", "Documentos/revisões", "Localizados",
        "Aguardando", "Não encontrados", "Revisões divergentes", "Em tramitação",
        "Alocação pendente", "Requer análise", "Não verificados", "Histórico preservado sem presença atual", "Risco de duplicidade", "Classificação",
      ], groups.map((g) => [
        g.egrdtNumber, g.generatedAt, g.distinctDocuments, g.total, g.confirmed,
        g.awaiting, g.notFound, g.divergent, g.inTransit, g.allocationPending,
        g.review, g.notVerified, g.preservedOnly, g.riskOfDuplicateResend ? "SIM" : "NÃO", g.classification,
      ]));
      addSheet("DOCUMENTOS POR GRDT", detailHeaders, groupRows.map(detailValues));
      addSheet("PENDENCIAS CONFIRMACAO", detailHeaders, groupRows.filter(({ row }) =>
        row.status !== Conference.STATUSES.CONFIRMED && !row.historicalPreserved).map(detailValues));
      addSheet("ALOCACOES A VERIFICAR", detailHeaders, groupRows.filter(({ row, d }) =>
        row.allocation?.kind !== "allocated" || (d.allocations || []).length > 1).map(detailValues));
      addSheet("DOCUMENTOS TRAMITACAO", detailHeaders, groupRows.filter(({ row }) =>
        row.currentEvidence && Conference.normalizeRevision(row.sigemStatusRevision) === Conference.normalizeRevision(row.revisionSent)
          && /^(EM ANALISE|EM WORKFLOW)$/.test(Conference.norm(row.sigemStatus))).map(detailValues));
      addSheet("AVALIAR REENVIO", detailHeaders, groupRows.filter(({ d }) =>
        d.action === "AVALIAR REENVIO").map(detailValues));
    }

    return workbook.xlsx.writeBuffer();
  }

  return Object.freeze({ buildWorkbook, downloadName, eventList, consolidatePendingDocuments, pendingDetails });
});
