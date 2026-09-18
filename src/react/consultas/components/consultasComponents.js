/**
 * GRCON — Componentes de apresentação da ilha React de Consultas.
 *
 * Reaproveitam literalmente as classes de requests.css (nenhum CSS novo) para
 * preservar o visual atual. Nenhum componente acessa `window`/módulos legados
 * diretamente — todo dado chega via props vindas do hook `useConsultas`
 * (que por sua vez só fala com o legado através do adaptador).
 */
(function (root) {
  "use strict";

  const React = root.React;
  const h = React.createElement;

  function formatBr(n) { return Number(n || 0).toLocaleString("pt-BR"); }

  function StepsIndicator({ ldsReady, documentsCount, resultsCount }) {
    const step3Current = ldsReady > 0 && documentsCount > 0 && !resultsCount;
    return h("ol", { className: "requests-steps", "aria-label": "Etapas da consulta" },
      h("li", { className: `requests-step${ldsReady ? " is-done" : " is-current"}` },
        h("b", null, "1"),
        h("span", null, h("strong", null, "Anexar as LDs"), h("small", null, ldsReady ? `${ldsReady} LD(s) carregada(s)` : "Nenhuma LD carregada"))),
      h("li", { className: `requests-step${documentsCount ? " is-done" : ldsReady ? " is-current" : ""}` },
        h("b", null, "2"),
        h("span", null, h("strong", null, "Informar os documentos"), h("small", null, documentsCount ? `${formatBr(documentsCount)} documento(s) na lista` : "Nenhum documento na lista"))),
      h("li", { className: `requests-step${resultsCount ? " is-done" : step3Current ? " is-current" : ""}` },
        h("b", null, "3"),
        h("span", null, h("strong", null, "Consultar e exportar"), h("small", null, resultsCount ? `${formatBr(resultsCount)} consultado(s)` : "Aguardando consulta"))));
  }

  function LdPanel({ lds, lastLd, onAddFiles, onRemove, onClear, onReuseHint }) {
    const inputRef = React.useRef(null);
    const [dragOver, setDragOver] = React.useState(false);
    const openPicker = () => inputRef.current && inputRef.current.click();
    return h("section", { className: "requests-panel", "aria-labelledby": "requests-ld-title" },
      h("div", { className: "requests-panel-head" },
        h("h3", { id: "requests-ld-title" }, "Listas de documentos (LD)"),
        h("small", null, "Pode anexar várias. O mesmo documento é procurado em todas.")),
      h("div", {
        className: `requests-drop${dragOver ? " is-over" : ""}`,
        tabIndex: 0,
        role: "button",
        "aria-describedby": "requests-drop-hint",
        onClick: openPicker,
        onKeyDown: (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openPicker(); } },
        onDragEnter: (event) => { event.preventDefault(); setDragOver(true); },
        onDragOver: (event) => { event.preventDefault(); setDragOver(true); },
        onDragLeave: (event) => { event.preventDefault(); setDragOver(false); },
        onDrop: (event) => { event.preventDefault(); setDragOver(false); onAddFiles(event.dataTransfer && event.dataTransfer.files); },
      },
        h("svg", { "aria-hidden": "true", viewBox: "0 0 24 24" }, h("path", { d: "M12 16V4M8 8l4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" })),
        h("strong", null, "Arraste as LDs aqui"),
        h("span", { id: "requests-drop-hint" }, "ou clique para escolher os arquivos (.xlsx, .xls, .xlsm)"),
        h("input", {
          ref: inputRef, accept: ".xlsx,.xls,.xlsm", multiple: true, type: "file", hidden: true,
          onChange: (event) => { onAddFiles(event.target.files); event.target.value = ""; },
        })),
      h("div", { className: "requests-ld-list" }, lds.map((item) => h("div", { className: `requests-ld-item${item.error ? " has-error" : ""}`, key: item.id },
        h("svg", { "aria-hidden": "true", viewBox: "0 0 24 24" }, h("path", { d: "M6 2h8l4 4v16H6z" }), h("path", { d: "M14 2v4h4" })),
        h("span", { className: "requests-ld-name" }, item.name),
        item.error
          ? h("span", { className: "requests-ld-error" }, item.error)
          : item.records.length
            ? h("span", { className: "requests-ld-ok" }, `${formatBr(item.records.length)} linha(s) de documento`)
            : h("span", { className: "requests-ld-loading" }, "Lendo…"),
        h("button", { className: "requests-ld-remove", title: "Remover esta LD", type: "button", "aria-label": `Remover ${item.name}`, onClick: () => onRemove(item.id) }, "\u00d7")))),
      h("div", { className: "requests-inline-actions" },
        h("button", { className: "secondary-button compact", type: "button", onClick: openPicker }, "Adicionar LDs"),
        lastLd && !lds.length && h("button", { className: "text-button", type: "button", onClick: onReuseHint }, `Reutilizar "${lastLd.name}"`),
        Boolean(lds.length) && h("button", { className: "text-button danger", type: "button", onClick: onClear }, "Remover todas")));
  }

  function CentralPanel({ central, onAttach, onClear }) {
    const inputRef = React.useRef(null);
    let statusText = "Nenhuma central anexada. A consulta responde sem as colunas da fiscal.";
    let hasError = false;
    if (central) {
      if (!central.ok) { statusText = central.error; hasError = true; }
      else statusText = `${central.nomeArquivo} · aba "${central.sheetName}" · ${formatBr(central.count)} envio(s) de ALOC para ${formatBr(central.documents)} documento(s).`;
    }
    return h("section", { className: "requests-panel", "aria-labelledby": "requests-central-title" },
      h("div", { className: "requests-panel-head" },
        h("h3", { id: "requests-central-title" }, "Central de alocação (opcional)"),
        h("small", null, "A planilha de Controle de Solicitações. Traz o status da alocação e o comentário da fiscal para cada documento consultado.")),
      h("div", { className: "requests-inline-actions" },
        h("button", { className: "secondary-button compact", type: "button", onClick: () => inputRef.current && inputRef.current.click() }, "Anexar o Controle de Solicitações"),
        h("input", {
          ref: inputRef, accept: ".xlsx,.xls,.xlsm", hidden: true, type: "file",
          onChange: (event) => { onAttach(event.target.files && event.target.files[0]); event.target.value = ""; },
        }),
        Boolean(central) && h("button", { className: "text-button danger", type: "button", onClick: onClear }, "Remover")),
      h("p", { "aria-live": "polite", className: `requests-central-status${hasError ? " tem-erro" : ""}` }, statusText));
  }

  function DocumentsPanel({ count, onAdd, onPasteClipboard }) {
    const [value, setValue] = React.useState("");
    const submit = () => { onAdd(value); setValue(""); };
    return h("section", { className: "requests-panel", "aria-labelledby": "requests-docs-title" },
      h("div", { className: "requests-panel-head" },
        h("h3", { id: "requests-docs-title" }, "Documentos a consultar"),
        h("small", null, "Cole um por linha. Código e título podem vir separados por tabulação, direto da planilha.")),
      h("label", { className: "requests-paste-label", htmlFor: "requests-paste" }, "Lista de documentos"),
      h("textarea", {
        id: "requests-paste", rows: 5, spellCheck: false,
        placeholder: "C1O_RNEST_U32_3.1.1.1_INS_RIR_SPE-AST-320019\nC1O_RNEST_U32_10.2.1.2_TUB_RIR_nt-NF-1288-CONEXOES",
        value,
        onChange: (event) => setValue(event.target.value),
        onKeyDown: (event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); submit(); } },
      }),
      h("div", { className: "requests-inline-actions" },
        h("button", { className: "secondary-button compact", type: "button", onClick: submit }, "Adicionar à lista"),
        h("button", { className: "text-button", type: "button", onClick: () => onPasteClipboard(setValue) }, "Colar da área de transferência"),
        h("span", { className: "requests-count" }, `${formatBr(count)} documento(s) na lista`)));
  }

  function ActionsBar(props) {
    const {
      canQuery, hasSelection, hasDocuments, hasResults, canUndo,
      onRun, onRunSelected, onSelectAll, onSelectNone, onDedupe, onCopy, onExport,
      onUndo, onClear, selectionNote, templates, selectedTemplateId, onTemplateChange, lastExport, onRepeat,
    } = props;
    return h("section", { className: "requests-actions", "aria-label": "Ações da consulta" },
      h("button", { className: "primary-button", disabled: !canQuery, type: "button", onClick: () => onRun(false) }, "Consultar todos"),
      h("button", { className: "secondary-button compact", disabled: !canQuery || !hasSelection, type: "button", onClick: () => onRun(true) }, "Consultar selecionados"),
      h("span", { className: "requests-actions-divider", "aria-hidden": "true" }),
      h("button", { className: "secondary-button compact", disabled: !hasDocuments, type: "button", onClick: onSelectAll }, "Selecionar todos"),
      h("button", { className: "secondary-button compact", disabled: !hasSelection, type: "button", onClick: onSelectNone }, "Limpar seleção"),
      h("button", { className: "secondary-button compact", disabled: !hasDocuments, type: "button", onClick: onDedupe }, "Remover duplicados"),
      h("span", { className: "requests-actions-divider", "aria-hidden": "true" }),
      h("button", { className: "secondary-button compact", disabled: !hasResults, type: "button", onClick: onCopy }, "Copiar resultados"),
      h("label", { className: "requests-modelo-escolha" }, h("span", null, "Modelo"),
        h("select", { value: selectedTemplateId, onChange: (event) => onTemplateChange(event.target.value) },
          templates.map((template) => h("option", { key: template.id, value: template.id }, template.name)))),
      h("button", { className: "secondary-button compact", disabled: !hasResults, type: "button", onClick: onExport }, "Exportar para Excel"),
      lastExport && h("button", { className: "text-button", type: "button", onClick: onRepeat }, `Repetir "${lastExport.name}"`),
      h("span", { className: "requests-actions-divider", "aria-hidden": "true" }),
      h("span", { className: "requests-actions-divider", "aria-hidden": "true" }),
      h("button", { className: "text-button", disabled: !canUndo, type: "button", onClick: onUndo }, "Desfazer"),
      h("button", { className: "text-button danger", disabled: !hasDocuments && !hasResults, type: "button", onClick: onClear }, "Limpar consulta"),
      h("span", { className: "requests-selection-note", "aria-live": "polite" }, selectionNote));
  }

  function FiltersBar({ search, situation, allocation, sort, onSearch, onSituation, onAllocation, onSort }) {
    return h("div", { className: "requests-results-tools" },
      h("label", { className: "requests-search" },
        h("svg", { "aria-hidden": "true", viewBox: "0 0 24 24" }, h("circle", { cx: 10, cy: 10, r: 6 }), h("path", { d: "M14.5 14.5L21 21" })),
        h("input", { value: search, placeholder: "Buscar código, título ou LD", type: "search", onChange: (event) => onSearch(event.target.value) })),
      h("label", null, h("span", null, "Situação"),
        h("select", { value: situation, onChange: (event) => onSituation(event.target.value) },
          h("option", { value: "" }, "Todas"), h("option", { value: "Localizado" }, "Localizado"),
          h("option", { value: "Requer validação manual" }, "Requer validação manual"), h("option", { value: "Não localizado" }, "Não localizado"))),
      h("label", null, h("span", null, "Alocação"),
        h("select", { value: allocation, onChange: (event) => onAllocation(event.target.value) },
          h("option", { value: "" }, "Todas"), h("option", { value: "sim" }, "Alocado"),
          h("option", { value: "nao" }, "Não alocado"), h("option", { value: "revisar" }, "A revisar"))),
      h("label", null, h("span", null, "Ordem"),
        h("select", { value: sort, onChange: (event) => onSort(event.target.value) },
          h("option", { value: "entrada" }, "Ordem informada"), h("option", { value: "documento" }, "Código"),
          h("option", { value: "situacao" }, "Situação"), h("option", { value: "ld" }, "LD"))));
  }

  function ProgressBar({ running, progress }) {
    const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return h("div", { "aria-live": "polite", className: "requests-progress", hidden: !running },
      h("div", { className: "requests-progress-bar" }, h("i", { style: { width: `${percent}%` } })),
      h("span", null, `Consultando ${formatBr(progress.done)} de ${formatBr(progress.total)}…`));
  }

  function celulaVazio(texto) { return h("span", { className: "requests-vazio" }, texto || "\u2014"); }

  function celulaEmitido(linha) {
    if (!linha) return celulaVazio();
    if (!linha.issuedEgrdt) return h("span", { className: "requests-nao-emitido" }, "Não emitido");
    const anteriores = Number(linha.issuedCount) > 1 ? h("small", { className: "requests-multi" }, `+${Number(linha.issuedCount) - 1} anterior(es)`) : null;
    const titulo = (linha.issuedAll || []).map((item) => `${item.egrdt}${item.revision ? ` — Rev. ${item.revision}` : " — revisão não registrada"}${item.date ? ` — ${item.date}` : ""}`).join("\n");
    return h("span", { className: "requests-emitido", title: titulo }, h("strong", null, linha.issuedEgrdt), linha.issuedAt && h("small", null, linha.issuedAt), anteriores);
  }

  function celulaRevisaoEmitida(linha) {
    if (!linha) return celulaVazio();
    if (!linha.issuedEgrdt) return h("span", { className: "requests-nao-emitido" }, "Não emitido");
    if (!linha.issuedRevision) return h("span", { className: "requests-revisao-ausente" }, "Não registrada no histórico");
    return h("span", { className: "requests-revisao-emitida", title: `Revisão registrada pelo GRCON na ${linha.issuedEgrdt}` }, h("strong", null, `Rev. ${linha.issuedRevision}`), h("small", null, linha.issuedEgrdt));
  }

  function celulaRevisaoColarSigem(linha) {
    if (!linha) return celulaVazio();
    if (!linha.sigemLdRevision) return h("span", { className: "requests-nao-emitido" }, "Não encontrado");
    const anteriores = Number(linha.sigemLdRevisionCount) > 1 ? h("small", { className: "requests-multi" }, `+${Number(linha.sigemLdRevisionCount) - 1} anterior(es)`) : null;
    const titulo = (linha.sigemLdRevisionAll || []).map((item) => `Rev. ${item.revision}${item.status ? ` — ${item.status}` : ""}`).join("\n") || linha.sigemLdRevisionLabel || "Revisão encontrada na Colar SIGEM";
    return h("span", { className: "requests-revisao-emitida", title: titulo }, h("strong", null, `Rev. ${linha.sigemLdRevision}`), h("small", null, "Colar SIGEM"), anteriores);
  }

  function celulaCodigoLocalizado(linha) {
    if (!linha || !linha.ldDocument) return h("span", { className: "requests-vazio", title: (linha && linha.ntSearchMessage) || "" }, "Não localizado");
    const badge = linha.codeAdjusted ? h("span", { className: "requests-badge ajuste", title: linha.codeAdjustmentNote }, "Código ajustado") : null;
    const duasFormas = linha.bothNtFormsInLd ? h("span", { className: "requests-badge alerta", title: linha.ntFormsDetail || "" }, "Consta com e sem nt-") : null;
    return h(React.Fragment, null, h("code", { title: linha.ntSearchMessage || "" }, linha.ldDocument), badge, duasFormas);
  }

  function celulaCentralStatus(central, linha) {
    if (!central || !central.ok) return celulaVazio("sem central");
    if (!linha || !linha.centerFound) return celulaVazio("não consta na central");
    const extra = linha.centerAllocation ? h("small", { className: "requests-multi" }, `${linha.centerAllocation}${linha.centerSentAt ? ` · ${linha.centerSentAt}` : ""}`) : null;
    const envios = Number(linha.centerSubmissions) > 1 ? h("small", { className: "requests-rule" }, `${linha.centerSubmissions} envios; vale o mais recente.`) : null;
    return h(React.Fragment, null, linha.centerStatus || celulaVazio(), extra, envios);
  }

  function selo(linha) {
    if (!linha) return h("span", { className: "requests-badge pendente" }, "Não consultado");
    if (linha.situation === "Localizado") return h("span", { className: "requests-badge ok" }, "\u2713 Localizado");
    if (linha.situation === "Requer validação manual") return h("span", { className: "requests-badge alerta" }, "! Validar");
    return h("span", { className: "requests-badge erro" }, "\u2715 Não localizado");
  }

  function ResultsRow({ item, linha, central, onToggle }) {
    return h("tr", { "data-doc": item.id, className: linha && linha.needsManualValidation ? "precisa-validar" : undefined },
      h("td", { className: "requests-col-check" }, h("input", { "aria-label": `Selecionar ${item.document}`, type: "checkbox", checked: item.selected, onChange: (event) => onToggle(item.id, event.target.checked) })),
      h("td", null, selo(linha)),
      h("td", { className: "requests-col-doc" }, h("code", null, item.document), linha && linha.rule && linha.needsManualValidation ? h("div", { className: "requests-rule" }, linha.rule) : null),
      h("td", { className: "requests-col-ld-doc" }, celulaCodigoLocalizado(linha)),
      h("td", null, (linha && linha.title) || celulaVazio()),
      h("td", null, (linha && linha.allocated) || celulaVazio()),
      h("td", null, (linha && linha.lastGrdt) || celulaVazio()),
      h("td", { className: "requests-col-emitido" }, celulaEmitido(linha)),
      h("td", { className: "requests-col-revisao-emitida" }, celulaRevisaoEmitida(linha)),
      h("td", { className: "requests-col-revisao-colar-sigem" }, celulaRevisaoColarSigem(linha)),
      h("td", null, (linha && linha.sigemStatus) || celulaVazio()),
      h("td", { className: "requests-col-central" }, celulaCentralStatus(central, linha)),
      h("td", { className: "requests-col-fiscal" }, (linha && linha.centerFiscalAnswer) || celulaVazio()),
      h("td", null, (linha && linha.ld) || celulaVazio(), linha && linha.occurrenceCount > 1 ? h("small", { className: "requests-multi" }, `${linha.occurrenceCount} LDs`) : null));
  }

  const COLUMN_HEADERS = ["Situação", "Documento", "Código localizado na LD", "Título na LD", "Alocado?", "Última GRDT", "Emitido pelo GRCON", "Revisão emitida no SIGEM", "Revisão na Colar SIGEM", "Status SIGEM", "Status da alocação (central)", "Resposta da fiscal 01", "LD"];

  function CheckAll({ allSelected, someSelected, onToggleAll }) {
    const ref = React.useRef(null);
    React.useEffect(() => { if (ref.current) ref.current.indeterminate = someSelected && !allSelected; }, [someSelected, allSelected]);
    return h("input", {
      ref, "aria-label": "Selecionar todos os resultados", type: "checkbox",
      checked: allSelected, onChange: (event) => onToggleAll(event.target.checked),
    });
  }

  function ResultsTable({ visibleRows, hasDocuments, onToggle, onToggleAll, allSelected, someSelected, central }) {
    return h(React.Fragment, null,
      h("div", { className: "requests-table-wrap", hidden: !hasDocuments },
        h("table", { className: "requests-table" },
          h("thead", null, h("tr", null,
            h("th", { className: "requests-col-check" }, h(CheckAll, { allSelected, someSelected, onToggleAll })),
            COLUMN_HEADERS.map((header, index) => h("th", { key: index }, header)))),
          h("tbody", null, visibleRows.map(({ item, linha }) => h(ResultsRow, {
            key: item.id, item, linha, central, onToggle,
          }))))),
      h("empty-state", { className: "requests-empty", hidden: hasDocuments },
        h("strong", null, "Nenhuma consulta ainda"),
        h("span", null, "Anexe uma LD, informe os documentos e clique em \u201cConsultar todos\u201d.")));
  }

  function SummaryBar({ summary }) {
    if (!summary) return h("div", { className: "requests-summary", hidden: true });
    return h("div", { className: "requests-summary" },
      h("div", null, h("span", null, "Consultados"), h("strong", null, formatBr(summary.total))),
      h("div", { className: "ok" }, h("span", null, "Localizados"), h("strong", null, formatBr(summary.localizados))),
      h("div", { className: "alerta" }, h("span", null, "A validar"), h("strong", null, formatBr(summary.validar))),
      h("div", { className: "erro" }, h("span", null, "Não localizados"), h("strong", null, formatBr(summary.ausentes))));
  }

  root.GrconConsultasComponents = {
    StepsIndicator, LdPanel, CentralPanel, DocumentsPanel, ActionsBar, FiltersBar, ProgressBar, ResultsTable, SummaryBar,
  };
})(window);
