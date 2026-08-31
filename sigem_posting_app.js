(function () {
  "use strict";

  const Posting = window.GrconSigemPosting;
  const History = window.GrconHistory;
  const Core = window.TriagemCore;
  const Emission = window.GrconEmission;
  const APP_VERSION = (window.GrconConfig && window.GrconConfig.APP_VERSION)
    || document.documentElement.dataset.version
    || "5.34.2";
  if (!Posting || !History) return;

  const $ = (selector, root) => (root || document).querySelector(selector);
  const norm = (value) => Posting.norm(value || "");
  const text = (value) => Posting.text(value || "");
  const escapeHtml = (value) => text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const state = {
    records: [],
    filtered: [],
    selectedId: "",
    query: "",
    busy: false,
    inspections: new Map(),
  };

  let els = {};

  function notify(message, kind) {
    if (typeof window.GrconNotify === "function") window.GrconNotify(message, kind || "info");
    else if (kind === "error") window.alert(message);
  }

  function formatDate(value, withTime) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", withTime
      ? { dateStyle: "short", timeStyle: "short" }
      : { dateStyle: "short" }).format(date);
  }

  function check(code, label, severity, message, detail) {
    return { code, label, severity, message, detail: detail || "" };
  }

  function extensionOf(value) {
    const match = text(value).match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : "";
  }

  function documentTypeFromCode(document, sheet) {
    const code = text(document);
    const sheetName = norm(sheet);
    if (sheetName === "ET" || code.includes("_RNEST_")) return "RL";
    if (sheetName === "CV" || /^5900(?:\.\d+){3}-[A-Z0-9]{3}-CV-/i.test(code)) return "CV";
    const groups = code.split("-");
    const languageOffset = /^[IAFLED]$/i.test(groups[0] || "") ? 1 : 0;
    return norm(groups[languageOffset] || "");
  }

  function groupByDocumentRevision(items) {
    const groups = new Map();
    (items || []).forEach((item) => {
      const document = text(item.document);
      const revision = text(item.revision);
      const key = `${norm(document)}|${norm(revision)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    return groups;
  }

  function expectedFileFor(record, document, revision) {
    return (record.files || []).find((file) =>
      norm(file.document) === norm(document) && norm(file.revision) === norm(revision)
    ) || null;
  }

  function compositionErrors(record, items) {
    if (!Emission) return [];
    const errors = [];
    groupByDocumentRevision(items).forEach((group) => {
      const first = group[0] || {};
      const expected = expectedFileFor(record, first.document, first.revision) || {};
      const discipline = text(expected.discipline || first.discipline);
      const row = {
        document: first.document,
        sheet: expected.sheet,
        discipline,
        record: { discipline },
        egrdt: { discipline },
      };
      const sources = group.map((item) => {
        const name = text(item.fileName || item.finalName);
        return { name, finalName: name, file: { size: 1 }, virtual: false };
      });
      const et = typeof Emission.validateEtPlanningPair === "function"
        ? Emission.validateEtPlanningPair(row, sources)
        : { applies: false, valid: true, errors: [] };
      if (et.applies && !et.valid) errors.push(...et.errors);
      const n1710 = typeof Emission.validateN1710Pair === "function"
        ? Emission.validateN1710Pair(row, sources)
        : { applies: false, valid: true, errors: [] };
      if (n1710.applies && !n1710.valid) errors.push(...n1710.errors);
    });
    return [...new Set(errors)];
  }

  function baselineAudit(record) {
    const checks = [];
    const files = record.files || [];
    const expectedFileName = `${record.egrdtNumber}.xls`;
    const numberValid = /^0130870-C1O-PGV-G-\d{4}-\d{4}\s-\seGRDT$/i.test(text(record.egrdtNumber));
    checks.push(check(
      "NUMBER",
      "Número da eGRDT",
      numberValid ? "ok" : "error",
      numberValid ? "Número no padrão oficial." : "O número não segue o padrão oficial da eGRDT.",
    ));
    checks.push(check(
      "EGRDT_FILE_NAME",
      "Nome esperado da eGRDT",
      norm(record.egrdtFileName) === norm(expectedFileName) ? "ok" : "error",
      norm(record.egrdtFileName) === norm(expectedFileName)
        ? expectedFileName
        : `O arquivo esperado é ${expectedFileName}.`,
    ));
    checks.push(check(
      "FILES",
      "Arquivos relacionados",
      files.length && files.length <= 48 ? "ok" : "error",
      !files.length
        ? "Nenhum arquivo foi relacionado a esta eGRDT."
        : files.length > 48
          ? `${files.length} linhas relacionadas; o limite operacional é 48.`
          : `${files.length} arquivo(s) devem aparecer como linha(s) na eGRDT.`,
    ));

    const missingNames = files.filter((file) => !text(file.finalName));
    const names = files.map((file) => norm(file.finalName)).filter(Boolean);
    const duplicateNames = names.filter((name, index) => names.indexOf(name) !== index);
    checks.push(check(
      "FILE_NAMES",
      "Nomes dos arquivos",
      missingNames.length || duplicateNames.length ? "error" : "ok",
      missingNames.length
        ? `${missingNames.length} arquivo(s) sem nome final.`
        : duplicateNames.length
          ? `${new Set(duplicateNames).size} nome(s) final(is) duplicado(s).`
          : "Todos os arquivos possuem nome final único e extensão definida.",
    ));

    const missingRevision = files.filter((file) => !text(file.revision));
    checks.push(check(
      "REVISIONS",
      "Revisões",
      missingRevision.length ? "error" : "ok",
      missingRevision.length ? `${missingRevision.length} arquivo(s) sem revisão.` : "Todas as revisões estão preenchidas.",
    ));

    const missingDatabook = files.filter((file) => !text(file.databook));
    checks.push(check(
      "DATABOOK",
      "Caminho Databook",
      missingDatabook.length ? "error" : "ok",
      missingDatabook.length
        ? `${missingDatabook.length} arquivo(s) sem Caminho Databook controlado no histórico/LD.`
        : "Todos os arquivos possuem Caminho Databook para comparação com a eGRDT.",
    ));

    const virtual = files.filter((file) => file.virtual);
    checks.push(check(
      "PHYSICAL",
      "Arquivo físico",
      virtual.length ? "error" : "ok",
      virtual.length
        ? `${virtual.length} item(ns) vieram somente de relação, sem arquivo físico.`
        : "Todos os itens foram gerados a partir de arquivos físicos.",
    ));

    const notAllocated = files.filter((file) => /NAO ALOCADO|ALOCACAO RECUSADA/.test(norm(file.allocationStatus)));
    checks.push(check(
      "ALLOCATION",
      "Alocação",
      notAllocated.length ? "warning" : "ok",
      notAllocated.length
        ? `${notAllocated.length} arquivo(s) constam como não alocados; confira se a inclusão manual foi intencional.`
        : "Nenhum arquivo está marcado como não alocado.",
    ));

    const pairErrors = compositionErrors(record, files);
    checks.push(check(
      "COMPOSITION",
      "Composição de arquivos",
      pairErrors.length ? "error" : "ok",
      pairErrors.length
        ? pairErrors.join(" ")
        : "As regras especiais de composição dos arquivos estão atendidas (N-1710, LI/MC/98V e ET de Planejamento quando aplicável).",
    ));

    const errors = checks.filter((item) => item.severity === "error");
    const warnings = checks.filter((item) => item.severity === "warning");
    return { ready: errors.length === 0, checks, errors, warnings };
  }

  function deepAudit(record, inspection, selectedFileName) {
    const checks = [];
    const rows = Array.isArray(inspection && inspection.rows) ? inspection.rows : [];
    const expected = record.files || [];

    checks.push(check(
      "OFFICIAL_MODEL",
      "Modelo oficial da eGRDT",
      inspection && inspection.valid && inspection.officialTemplate ? "ok" : "error",
      inspection && inspection.valid && inspection.officialTemplate
        ? "Arquivo XLS BIFF8 reconhecido, aba GRDT e cabeçalhos oficiais conferidos, sem linhas vazias antes do FIM."
        : "O arquivo não foi reconhecido como eGRDT oficial.",
    ));

    const expectedEgrdtName = `${record.egrdtNumber}.xls`;
    checks.push(check(
      "SELECTED_NAME",
      "Nome do arquivo .xls",
      norm(selectedFileName) === norm(expectedEgrdtName) ? "ok" : "error",
      norm(selectedFileName) === norm(expectedEgrdtName)
        ? expectedEgrdtName
        : `Selecionado: ${selectedFileName}. Esperado: ${expectedEgrdtName}.`,
    ));

    checks.push(check(
      "ROW_COUNT",
      "Quantidade de linhas",
      rows.length === expected.length ? "ok" : "error",
      rows.length === expected.length
        ? `${rows.length} linha(s), exatamente como o lote gerado.`
        : `A eGRDT possui ${rows.length} linha(s), mas o histórico espera ${expected.length}.`,
    ));

    const rowErrors = [];
    const rowWarnings = [];
    const actualNames = rows.map((row) => norm(row.fileName)).filter(Boolean);
    const duplicateActual = actualNames.filter((name, index) => actualNames.indexOf(name) !== index);
    if (duplicateActual.length) rowErrors.push(`${new Set(duplicateActual).size} nome(s) de arquivo duplicado(s) dentro da eGRDT.`);

    const expectedByName = new Map();
    expected.forEach((file) => {
      const key = norm(file.finalName);
      if (key && !expectedByName.has(key)) expectedByName.set(key, file);
    });
    const foundExpected = new Set();

    rows.forEach((row, index) => {
      const line = index + 2;
      const fields = [
        ["document", "DOCUMENTO"], ["revision", "REVISÃO"], ["title", "TÍTULO"],
        ["fileName", "ARQUIVO"], ["format", "FORMATO"], ["discipline", "DISCIPLINA"],
        ["documentType", "TIPO DE DOCUMENTO"], ["purpose", "PROPÓSITO"], ["databook", "CAMINHO DATABOOK"],
      ];
      fields.forEach(([property, label]) => {
        if (!text(row[property])) rowErrors.push(`Linha ${line}: ${label} está vazio.`);
      });
      if (text(row.fileName) && !extensionOf(row.fileName)) rowErrors.push(`Linha ${line}: ARQUIVO está sem extensão.`);

      if (Core && typeof Core.validateEgrdtData === "function") {
        const officialErrors = Core.validateEgrdtData({ ...row });
        officialErrors.forEach((message) => rowErrors.push(`Linha ${line}: ${message}.`));
      }
      if (norm(row.documentType) === "DE" && norm(row.format) !== "A3") {
        rowErrors.push(`Linha ${line}: documento DE deve usar FORMATO A3.`);
      }

      const expectedType = documentTypeFromCode(row.document, expectedFileFor(record, row.document, row.revision)?.sheet);
      if (expectedType && norm(row.documentType) !== expectedType) {
        rowErrors.push(`Linha ${line}: TIPO DE DOCUMENTO “${row.documentType}” diverge do tipo esperado “${expectedType}”.`);
      }

      const expectedFile = expectedByName.get(norm(row.fileName));
      if (!expectedFile) {
        rowErrors.push(`Linha ${line}: ARQUIVO “${row.fileName}” não corresponde a nenhum arquivo do lote gerado.`);
        return;
      }
      foundExpected.add(norm(expectedFile.finalName));
      if (norm(row.document) !== norm(expectedFile.document)) {
        rowErrors.push(`Linha ${line}: DOCUMENTO “${row.document}” diverge de “${expectedFile.document}”.`);
      }
      if (norm(row.revision) !== norm(expectedFile.revision)) {
        rowErrors.push(`Linha ${line}: REVISÃO “${row.revision}” diverge da revisão “${expectedFile.revision}” do lote.`);
      }
      if (text(expectedFile.title) && norm(row.title) !== norm(expectedFile.title)) {
        rowErrors.push(`Linha ${line}: TÍTULO diverge do título controlado no histórico/LD.`);
      }
      if (text(expectedFile.discipline) && norm(row.discipline) !== norm(expectedFile.discipline)) {
        rowErrors.push(`Linha ${line}: DISCIPLINA “${row.discipline}” diverge de “${expectedFile.discipline}”.`);
      }
      if (!text(expectedFile.databook)) {
        rowErrors.push(`Linha ${line}: não há Caminho Databook controlado no histórico/LD para validar este documento.`);
      } else if (norm(row.databook) !== norm(expectedFile.databook)) {
        rowErrors.push(`Linha ${line}: CAMINHO DATABOOK diverge da LD. eGRDT: “${row.databook}” · LD/histórico: “${expectedFile.databook}”.`);
      }
    });

    expected.forEach((file) => {
      if (text(file.finalName) && !foundExpected.has(norm(file.finalName))) {
        rowErrors.push(`Arquivo esperado ausente na eGRDT: ${file.finalName}.`);
      }
    });

    const expectedOrder = expected.map((file) => norm(file.finalName)).filter(Boolean);
    if (expectedOrder.length === actualNames.length && expectedOrder.some((name, index) => name !== actualNames[index])) {
      rowWarnings.push("A ordem das linhas difere da ordem em que o lote foi gerado. O conteúdo foi comparado pelo nome final de cada arquivo.");
    }

    const pairErrors = compositionErrors(record, rows);
    rowErrors.push(...pairErrors);

    const disciplines = [...new Set(rows.map((row) => norm(row.discipline)).filter(Boolean))];
    if (disciplines.length > 1) {
      rowErrors.push(`A eGRDT mistura ${disciplines.length} disciplinas; o GRCON gera os lotes separados por disciplina.`);
    }

    checks.push(check(
      "CONTENT",
      "Conteúdo das linhas",
      rowErrors.length ? "error" : "ok",
      rowErrors.length
        ? `${rowErrors.length} divergência(s) encontrada(s).`
        : "Documento, revisão, título, arquivo, formato, disciplina, tipo, propósito e Databook foram conferidos em todas as linhas.",
      rowErrors.join("\n"),
    ));
    if (rowWarnings.length) {
      checks.push(check("ORDER", "Ordem das linhas", "warning", rowWarnings.join(" ")));
    } else {
      checks.push(check("ORDER", "Ordem das linhas", "ok", "A ordem das linhas corresponde ao lote gerado."));
    }

    const errors = checks.filter((item) => item.severity === "error");
    const warnings = checks.filter((item) => item.severity === "warning");
    return { ready: errors.length === 0, checks, errors, warnings, rowErrors: [...new Set(rowErrors)] };
  }

  function buildModuleUi() {
    const module = $("#sigem-module");
    if (!module) return false;
    module.innerHTML = `
      <header class="sigem-heading">
        <div>
          <span>CONFERÊNCIA TÉCNICA</span>
          <h2 id="sigem-title">Verificar eGRDT antes da postagem</h2>
          <p>Esta área não controla a postagem. Ela existe somente para conferir se o arquivo eGRDT gerado está completo e coerente com os documentos do lote e com a LD.</p>
        </div>
      </header>
      <section aria-label="Busca das eGRDTs para conferência" class="sigem-toolbar">
        <label class="history-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"></circle><path d="M14.5 14.5L21 21"></path></svg><input id="sigem-search" placeholder="Buscar eGRDT, documento, arquivo ou Databook" type="search"/></label>
        <strong id="sigem-result-count">0 eGRDT(s)</strong>
      </section>
      <section aria-label="Resumo da conferência" class="sigem-summary" id="sigem-summary"></section>
      <div class="sigem-workspace">
        <section aria-label="eGRDTs disponíveis para conferência" class="sigem-list-card">
          <header><div><span>HISTÓRICO DE GERAÇÃO</span><strong>eGRDTs disponíveis</strong></div><small>Selecione uma eGRDT e confira o arquivo .xls real.</small></header>
          <div class="sigem-list" id="sigem-list"></div>
          <empty-state class="sigem-empty" hidden id="sigem-empty"><strong>Nenhuma eGRDT localizada</strong><span>Gere uma eGRDT ou ajuste a busca.</span></empty-state>
        </section>
        <section aria-live="polite" class="sigem-detail" id="sigem-detail"></section>
      </div>`;

    els = {
      module,
      search: $("#sigem-search", module),
      count: $("#sigem-result-count", module),
      summary: $("#sigem-summary", module),
      list: $("#sigem-list", module),
      empty: $("#sigem-empty", module),
      detail: $("#sigem-detail", module),
    };

    [$("#sigem-tab-count"), $("#ops-sigem-count")].filter(Boolean).forEach((badge) => {
      badge.hidden = true;
      badge.textContent = "0";
    });
    return true;
  }

  function refresh() {
    const history = History.read();
    state.records = history.map((record) => Posting.fromHistory(record, { appVersion: APP_VERSION }));
    const query = norm(state.query);
    state.filtered = state.records.filter((record) => {
      if (!query) return true;
      const haystack = norm([
        record.egrdtNumber,
        record.egrdtFileName,
        record.ldName,
        record.sourceName,
        ...(record.files || []).flatMap((file) => [file.document, file.finalName, file.revision, file.databook, file.discipline, file.allocation]),
      ].join(" "));
      return haystack.includes(query);
    });
    if (!state.filtered.some((record) => record.id === state.selectedId)) {
      state.selectedId = state.filtered[0] ? state.filtered[0].id : "";
    }
    if (els.count) els.count.textContent = `${state.filtered.length.toLocaleString("pt-BR")} eGRDT(s)`;
  }

  function currentInspection(record) {
    return record ? state.inspections.get(record.id) || null : null;
  }

  function renderSummary() {
    const ids = new Set(state.records.map((record) => record.id));
    const inspected = [...state.inspections.entries()].filter(([id]) => ids.has(id)).map(([, value]) => value);
    const approved = inspected.filter((item) => item.audit && item.audit.ready).length;
    const blocked = inspected.filter((item) => item.audit && !item.audit.ready).length;
    const documents = state.records.reduce((total, record) => total + (record.files || []).length, 0);
    els.summary.innerHTML = `
      <div><span>eGRDTs no histórico</span><strong>${state.records.length.toLocaleString("pt-BR")}</strong></div>
      <div><span>Arquivos esperados</span><strong>${documents.toLocaleString("pt-BR")}</strong></div>
      <div><span>Conferidas nesta sessão</span><strong>${inspected.length.toLocaleString("pt-BR")}</strong></div>
      <div><span>Aprovadas</span><strong>${approved.toLocaleString("pt-BR")}</strong></div>
      <div><span>Com divergência</span><strong>${blocked.toLocaleString("pt-BR")}</strong></div>`;
  }

  function statusForRecord(record) {
    const inspection = currentInspection(record);
    if (!inspection) return { label: "Aguardando arquivo .xls", tone: "neutral", detail: "Pré-checagem disponível" };
    if (inspection.busy) return { label: "Conferindo…", tone: "info", detail: "Lendo a eGRDT" };
    if (inspection.error) return { label: "Arquivo inválido", tone: "danger", detail: inspection.error };
    if (inspection.audit && inspection.audit.ready) return { label: "Aprovada", tone: "success", detail: "Conferência completa" };
    return { label: "Com divergências", tone: "danger", detail: `${inspection.audit?.errors?.length || 0} bloqueio(s)` };
  }

  function renderList() {
    els.list.innerHTML = state.filtered.map((record) => {
      const status = statusForRecord(record);
      return `<button class="sigem-record ${record.id === state.selectedId ? "active" : ""}" data-sigem-id="${escapeHtml(record.id)}" type="button">
        <div class="sigem-record-heading"><strong>${escapeHtml(record.egrdtNumber)}</strong><span class="sigem-status ${status.tone}">${escapeHtml(status.label)}</span></div>
        <span>${formatDate(record.generatedAt, true)} · ${(record.files || []).length} arquivo(s)</span>
        <small>${escapeHtml(status.detail)}</small>
      </button>`;
    }).join("");
    els.empty.hidden = state.filtered.length > 0;
  }

  function iconFor(severity) {
    return severity === "ok" ? "✓" : severity === "warning" ? "!" : "×";
  }

  function renderChecks(title, audit, eyebrow) {
    return `<section class="sigem-audit-card">
      <header><div><span>${escapeHtml(eyebrow || "VERIFICAÇÃO")}</span><strong>${escapeHtml(title)}</strong></div><span class="sigem-audit-result ${audit.ready ? "success" : "danger"}">${audit.errors.length} erro(s) · ${audit.warnings.length} aviso(s)</span></header>
      <div class="sigem-checklist">${audit.checks.map((item) => `<div class="sigem-check ${item.severity}"><b>${iconFor(item.severity)}</b><div><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.message)}</span>${item.detail ? `<small style="white-space:pre-line">${escapeHtml(item.detail)}</small>` : ""}</div></div>`).join("")}</div>
    </section>`;
  }

  function renderFiles(record) {
    return `<details class="sigem-files-card" open><summary><span>Arquivos que devem estar na eGRDT</span><strong>${record.files.length} arquivo(s)</strong></summary><div class="sigem-files-table"><table><thead><tr><th>Documento</th><th>Rev.</th><th>Arquivo final</th><th>Databook</th><th>Disciplina</th><th>Alocação</th></tr></thead><tbody>${record.files.map((file) => `<tr><td>${escapeHtml(file.document || "—")}</td><td>${escapeHtml(file.revision || "—")}</td><td>${escapeHtml(file.finalName || "—")}</td><td>${escapeHtml(file.databook || "—")}</td><td>${escapeHtml(file.discipline || "—")}</td><td>${escapeHtml(file.allocation || file.allocationStatus || "—")}</td></tr>`).join("")}</tbody></table></div></details>`;
  }

  function renderInspectionCard(record, inspection) {
    const busy = Boolean(inspection && inspection.busy) || state.busy;
    const last = inspection && !inspection.busy ? inspection : null;
    return `<section class="sigem-correction-card">
      <header><div><span>CONFERÊNCIA DO ARQUIVO REAL</span><strong>Reabrir e validar a eGRDT .xls</strong></div><small>Esta é a verificação definitiva do arquivo que será usado na postagem.</small></header>
      <div class="sigem-correction-file">
        <input accept=".xls" hidden id="sigem-verification-file" type="file"/>
        <button class="primary-button" data-sigem-action="choose-egrdt" ${busy ? "disabled" : ""} type="button">${busy ? "Conferindo…" : last ? "Conferir novamente" : "Selecionar eGRDT .xls"}</button>
        <span>${last ? `${escapeHtml(last.fileName)} · conferido em ${escapeHtml(formatDate(last.at, true))}` : "Selecione o arquivo .xls gerado pelo GRCON."}</span>
      </div>
      ${last && last.error ? `<div class="sigem-correction-warning"><strong>Arquivo não aprovado</strong><br>${escapeHtml(last.error)}</div>` : ""}
    </section>`;
  }

  function renderDetail() {
    const record = state.records.find((item) => item.id === state.selectedId);
    if (!record) {
      els.detail.innerHTML = '<div class="sigem-detail-empty"><strong>Selecione uma eGRDT</strong><span>A conferência técnica aparecerá aqui.</span></div>';
      return;
    }
    const baseline = baselineAudit(record);
    const inspection = currentInspection(record);
    const status = statusForRecord(record);
    els.detail.innerHTML = `
      <header class="sigem-detail-header"><div><span>CONFERÊNCIA TÉCNICA</span><h3>${escapeHtml(record.egrdtNumber)}</h3><p>${formatDate(record.generatedAt, true)} · ${(record.files || []).length} arquivo(s)</p></div><span class="sigem-status large ${status.tone}">${escapeHtml(status.label)}</span></header>
      ${renderInspectionCard(record, inspection)}
      ${inspection && inspection.audit ? renderChecks(inspection.audit.ready ? "eGRDT aprovada para postagem" : "eGRDT com divergências", inspection.audit, "RESULTADO DO ARQUIVO .XLS") : ""}
      ${renderChecks(baseline.ready ? "Pré-checagem do lote aprovada" : "Pré-checagem com pendências", baseline, "PRÉ-CHECAGEM PELO HISTÓRICO")}
      ${renderFiles(record)}`;
  }

  function render() {
    refresh();
    renderSummary();
    renderList();
    renderDetail();
  }

  function select(id) {
    state.selectedId = id;
    renderList();
    renderDetail();
  }

  async function verifySelectedFile(file) {
    const record = state.records.find((item) => item.id === state.selectedId);
    if (!record || !file) return;
    if (!/\.xls$/i.test(file.name)) {
      notify("Selecione a eGRDT no formato .xls.", "error");
      return;
    }
    if (!window.GrdtWorkbook || typeof window.GrdtWorkbook.inspect !== "function") {
      notify("O leitor da eGRDT não foi carregado. Reabra a área de Postagem SIGEM e tente novamente.", "error");
      return;
    }

    state.busy = true;
    state.inspections.set(record.id, { busy: true, fileName: file.name, at: new Date().toISOString() });
    renderSummary();
    renderList();
    renderDetail();
    try {
      const inspection = await window.GrdtWorkbook.inspect(await file.arrayBuffer());
      const audit = deepAudit(record, inspection, file.name);
      state.inspections.set(record.id, {
        busy: false,
        fileName: file.name,
        at: new Date().toISOString(),
        inspection,
        audit,
        error: "",
      });
      notify(
        audit.ready
          ? "eGRDT conferida e aprovada: estrutura, arquivos e Databook estão consistentes."
          : `eGRDT conferida com ${audit.errors.length} bloqueio(s). Abra os detalhes antes de postar.`,
        audit.ready ? "success" : "error",
      );
    } catch (error) {
      console.error("GRCON: falha na conferência da eGRDT", error);
      state.inspections.set(record.id, {
        busy: false,
        fileName: file.name,
        at: new Date().toISOString(),
        audit: null,
        error: error && error.message || "Não foi possível ler a eGRDT.",
      });
      notify(error && error.message || "Não foi possível conferir a eGRDT.", "error");
    } finally {
      state.busy = false;
      render();
    }
  }

  function bindEvents() {
    els.search.addEventListener("input", () => {
      state.query = els.search.value;
      render();
    });
    els.list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-sigem-id]");
      if (button) select(button.dataset.sigemId);
    });
    els.detail.addEventListener("click", (event) => {
      const action = event.target.closest("[data-sigem-action]")?.dataset.sigemAction;
      if (action === "choose-egrdt") $("#sigem-verification-file", els.detail)?.click();
    });
    els.detail.addEventListener("change", (event) => {
      if (event.target.id !== "sigem-verification-file") return;
      const file = event.target.files && event.target.files[0];
      if (file) void verifySelectedFile(file);
    });

    ["grcon:history-updated", "grcon:cloud-ready"].forEach((eventName) => {
      window.addEventListener(eventName, render);
    });
    window.addEventListener("storage", (event) => {
      if (event.key === History.STORAGE_KEY) render();
    });
  }

  function init() {
    if (!buildModuleUi()) return;
    bindEvents();
    render();
  }

  init();
  window.GrconSigemUi = { state, render, select, verifySelectedFile };
})();
