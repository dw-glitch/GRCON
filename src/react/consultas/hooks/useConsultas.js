/**
 * GRCON — Estado da ilha React de Consultas.
 *
 * Hook único que orquestra o fluxo (LDs, central, documentos, consulta,
 * filtros, exportação). Toda regra de negócio vive no adaptador
 * (GrconConsultasAdapter); aqui só há estado de tela e a orquestração de
 * quando chamar o quê — inclusive o processamento em blocos de 100 (com um
 * `await` de um tick entre blocos) que evita travar a aba em listas grandes,
 * preservado do requests_app.js original.
 *
 * @typedef {import('../services/consultasAdapter.js').LdEntry} LdEntry
 * @typedef {import('../services/consultasAdapter.js').AllocationCenterIndex} AllocationCenterIndex
 * @typedef {import('../services/consultasAdapter.js').ConsultationRow} ConsultationRow
 * @typedef {import('../services/consultasAdapter.js').ExportTemplate} ExportTemplate
 * @typedef {import('../services/consultasAdapter.js').ExportRow} ExportRow
 *
 * @typedef {Object} DocumentEntry
 * @property {string} id
 * @property {string} document
 * @property {string} [requestedTitle]
 * @property {boolean} selected
 */
(function (root) {
  "use strict";

  const React = root.React;
  const Adapter = root.GrconConsultasAdapter;

  let proximoLdId = 1;
  let proximoDocId = 1;

  function useConsultas() {
    const [lds, setLds] = React.useState(/** @type {LdEntry[]} */([]));
    const [central, setCentral] = React.useState(/** @type {AllocationCenterIndex | null} */(null));
    const [documents, setDocuments] = React.useState(/** @type {DocumentEntry[]} */([]));
    const [results, setResults] = React.useState(/** @type {Map<string, ConsultationRow>} */(new Map()));
    const [running, setRunning] = React.useState(false);
    const [progress, setProgress] = React.useState({ done: 0, total: 0 });
    const [search, setSearch] = React.useState("");
    const [situation, setSituation] = React.useState("");
    const [allocation, setAllocation] = React.useState("");
    const [sort, setSort] = React.useState("entrada");
    const [templates, setTemplates] = React.useState(/** @type {ExportTemplate[]} */([]));
    const [selectedTemplateId, setSelectedTemplateId] = React.useState("");
    const [lastExport, setLastExport] = React.useState(Adapter.getLastExport());
    const [banner, setBanner] = React.useState(/** @type {{ kind: 'error'|'info'; message: string } | null} */(null));

    const indexRef = React.useRef(/** @type {unknown} */(null));
    const undoRef = React.useRef(/** @type {{ label: string; documents: DocumentEntry[] }[]} */([]));

    const notify = React.useCallback((message, kind) => Adapter.notify(message, kind), []);

    const reindex = React.useCallback((nextLds) => {
      indexRef.current = Adapter.buildIndex(nextLds);
    }, []);

    const addLds = React.useCallback(async (fileList) => {
      const arquivos = [...(fileList || [])];
      if (!arquivos.length) return;
      const novos = arquivos
        .filter((file) => !lds.some((item) => item.name === file.name && item.size === file.size))
        .map((file) => ({ id: `ld-${proximoLdId++}-${Date.now()}`, file, name: file.name, size: file.size, records: [], history: [], error: "" }));
      if (!novos.length) return;
      setLds((prev) => [...prev, ...novos]);
      for (const entrada of novos) {
        try {
          const parsed = await Adapter.parseLd(entrada.file);
          entrada.records = parsed.records;
          entrada.history = parsed.history;
          if (!entrada.records.length) entrada.error = "Nenhuma linha de documento foi reconhecida nesta planilha.";
        } catch (error) {
          entrada.error = (error && error.message) || "Não foi possível ler este arquivo.";
        }
        setLds((prev) => {
          const atualizado = prev.map((item) => (item.id === entrada.id ? { ...entrada } : item));
          reindex(atualizado);
          return atualizado;
        });
      }
      if (arquivos[0]) Adapter.rememberLastLd(arquivos[0]);
    }, [lds, reindex]);

    const removeLd = React.useCallback((id) => {
      setLds((prev) => {
        const atualizado = prev.filter((item) => item.id !== id);
        reindex(atualizado);
        return atualizado;
      });
      setResults(new Map());
    }, [reindex]);

    const clearLds = React.useCallback(() => {
      setLds([]);
      indexRef.current = null;
      setResults(new Map());
    }, []);

    const attachCentral = React.useCallback(async (file) => {
      if (!file) return;
      try {
        const indice = await Adapter.parseAllocationCenterFile(file);
        setCentral(indice);
        if (!indice.ok) { notify(indice.error, "warn"); return; }
        notify(`Central lida: ${indice.count} envio(s) para ${indice.documents} documento(s).`, "success");
      } catch (error) {
        const falha = { ok: false, error: (error && error.message) || "Não foi possível ler esta planilha.", nomeArquivo: file.name };
        setCentral(falha);
        notify(falha.error, "error");
      }
    }, [notify]);

    const removeCentral = React.useCallback(() => {
      setCentral(null);
      notify("Central de alocação removida.", "info");
    }, [notify]);

    const guardarParaDesfazer = React.useCallback((label, snapshot) => {
      undoRef.current = [...undoRef.current, { label, documents: snapshot }].slice(-20);
    }, []);

    const addDocuments = React.useCallback((texto) => {
      const novos = Adapter.parseDocumentList(texto);
      if (!novos.length) { notify("Nenhum código foi reconhecido no texto colado.", "warn"); return; }
      guardarParaDesfazer(`adicionar ${novos.length} documento(s)`, documents);
      const combinados = [
        ...documents,
        ...novos.map((item) => ({ id: `doc-${proximoDocId++}`, document: item.document, requestedTitle: item.requestedTitle, selected: true })),
      ];
      const { items, removed } = Adapter.dedupeDocuments(combinados);
      setDocuments(items);
      notify(removed.length
        ? `${novos.length} documento(s) adicionados. ${removed.length} repetido(s) foram descartados.`
        : `${novos.length} documento(s) adicionados.`, removed.length ? "info" : "success");
    }, [documents, guardarParaDesfazer, notify]);

    const removeDuplicates = React.useCallback(() => {
      const { items, removed } = Adapter.dedupeDocuments(documents);
      if (!removed.length) { notify("Não há documentos repetidos na lista.", "info"); return; }
      guardarParaDesfazer(`remover ${removed.length} duplicado(s)`, documents);
      setDocuments(items);
      notify(`${removed.length} documento(s) repetido(s) removido(s).`, "success");
    }, [documents, guardarParaDesfazer, notify]);

    const clearConsulta = React.useCallback(() => {
      if (!documents.length && !results.size) return;
      guardarParaDesfazer("limpar a consulta", documents);
      setDocuments([]);
      setResults(new Map());
      notify("Consulta limpa. Use Desfazer se foi sem querer.", "info");
    }, [documents, results, guardarParaDesfazer, notify]);

    const undo = React.useCallback(() => {
      const pilha = undoRef.current;
      const anterior = pilha[pilha.length - 1];
      if (!anterior) return;
      undoRef.current = pilha.slice(0, -1);
      setDocuments(anterior.documents);
      notify(`Desfeito: ${anterior.label}.`, "info");
    }, [notify]);

    const toggleSelect = React.useCallback((id, selected) => {
      setDocuments((prev) => prev.map((item) => (item.id === id ? { ...item, selected } : item)));
    }, []);

    const toggleSelectAll = React.useCallback((selected) => {
      setDocuments((prev) => prev.map((item) => ({ ...item, selected })));
    }, []);

    const runQuery = React.useCallback(async (onlySelected) => {
      if (running) return;
      if (!indexRef.current) { notify("Anexe pelo menos uma LD válida antes de consultar.", "warn"); return; }
      const alvos = onlySelected ? documents.filter((item) => item.selected) : documents;
      if (!alvos.length) { notify(onlySelected ? "Nenhum documento selecionado." : "Informe pelo menos um documento.", "warn"); return; }

      Adapter.refreshHistoryIndicator();
      setRunning(true);
      const total = alvos.length;
      setProgress({ done: 0, total });
      const novosResultados = new Map(results);
      for (let inicio = 0; inicio < total; inicio += 100) {
        const fim = Math.min(total, inicio + 100);
        for (let i = inicio; i < fim; i += 1) {
          const item = alvos[i];
          novosResultados.set(item.id, Adapter.lookupDocument(item.document, item.requestedTitle, indexRef.current, central));
        }
        setProgress({ done: fim, total });
        if (fim < total) await new Promise((resolve) => root.setTimeout(resolve, 0));
      }
      setResults(novosResultados);
      setRunning(false);

      const linhas = [...novosResultados.values()];
      const validar = linhas.filter((linha) => linha.needsManualValidation).length;
      notify(validar
        ? `${total} documento(s) consultados. ${validar} precisam de conferência.`
        : `${total} documento(s) consultados.`, validar ? "warn" : "success");
    }, [running, documents, results, central, notify]);

    const exportRows = React.useMemo(() => documents
      .filter((item) => results.has(item.id))
      .map((item) => Adapter.buildExportRow(item.document, results.get(item.id))), [documents, results]);

    React.useEffect(() => { Adapter.setExportRowsProvider(() => exportRows); }, [exportRows]);

    const copyResults = React.useCallback(async () => {
      if (!exportRows.length) return;
      try {
        await Adapter.copyRowsToClipboard(exportRows);
        notify(`${exportRows.length} linha(s) copiadas. Cole direto na planilha.`, "success");
      } catch (error) {
        notify("O navegador bloqueou a cópia automática. Use a exportação para Excel.", "warn");
      }
    }, [exportRows, notify]);

    const refreshTemplates = React.useCallback(async () => {
      const lista = await Adapter.loadExportTemplates();
      setTemplates(lista);
      setSelectedTemplateId((atual) => (lista.some((item) => item.id === atual) ? atual : (lista[0] && lista[0].id) || ""));
    }, []);

    React.useEffect(() => {
      refreshTemplates();
      return Adapter.onExportTemplatesChanged(refreshTemplates);
    }, [refreshTemplates]);

    const exportExcel = React.useCallback(async (templateId) => {
      if (!exportRows.length) { notify("Consulte os documentos antes de exportar.", "warn"); return; }
      const escolhido = templates.find((item) => item.id === (templateId || selectedTemplateId)) || templates[0];
      const modelo = Adapter.normalizeExportTemplate(escolhido);
      try {
        const nomesLds = lds.filter((item) => !item.error).map((item) => item.name).join(" · ");
        await Adapter.exportRowsToExcel(exportRows, modelo, nomesLds);
        setLastExport({ id: modelo.id, name: modelo.name });
        notify(`Planilha gerada com ${exportRows.length} linha(s) no modelo "${modelo.name}".`, "success");
      } catch (error) {
        notify((error && error.message) || "Não foi possível gerar a planilha.", "error");
      }
    }, [exportRows, templates, selectedTemplateId, lds, notify]);

    const repeatLastExport = React.useCallback(async () => {
      const ultima = Adapter.getLastExport();
      if (!ultima) return;
      if (!templates.some((item) => item.id === ultima.id)) {
        notify(`O modelo "${ultima.name}" não existe mais. Escolha outro para exportar.`, "warn");
        return;
      }
      setSelectedTemplateId(ultima.id);
      await exportExcel(ultima.id);
    }, [templates, exportExcel, notify]);

    const visibleRows = React.useMemo(() => {
      const busca = search.trim().toLowerCase();
      let linhas = documents.map((item) => ({ item, linha: results.get(item.id) || null }));
      if (situation) linhas = linhas.filter(({ linha }) => linha && linha.situation === situation);
      if (allocation) {
        linhas = linhas.filter(({ linha }) => {
          const valor = String((linha && linha.allocated) || "").toUpperCase();
          if (allocation === "sim") return valor.startsWith("SIM");
          if (allocation === "nao") return valor.startsWith("NÃO");
          return valor.startsWith("REVISAR");
        });
      }
      if (busca) {
        linhas = linhas.filter(({ item, linha }) => [item.document, linha && linha.title, linha && linha.ld, linha && linha.allLds]
          .filter(Boolean).some((valor) => String(valor).toLowerCase().includes(busca)));
      }
      const ordem = {
        documento: (a, b) => a.item.document.localeCompare(b.item.document, "pt-BR"),
        situacao: (a, b) => String((a.linha && a.linha.situation) || "").localeCompare(String((b.linha && b.linha.situation) || ""), "pt-BR"),
        ld: (a, b) => String((a.linha && a.linha.ld) || "").localeCompare(String((b.linha && b.linha.ld) || ""), "pt-BR"),
      };
      return sort === "entrada" ? linhas : [...linhas].sort(ordem[sort] || (() => 0));
    }, [documents, results, search, situation, allocation, sort]);

    const selectedCount = React.useMemo(() => documents.filter((item) => item.selected).length, [documents]);
    const ldsReady = React.useMemo(() => lds.filter((item) => !item.error && item.records.length).length, [lds]);
    const summary = React.useMemo(() => {
      if (!results.size) return null;
      const linhas = [...results.values()];
      const localizados = linhas.filter((l) => l.situation === "Localizado").length;
      const validar = linhas.filter((l) => l.situation === "Requer validação manual").length;
      return { total: linhas.length, localizados, validar, ausentes: linhas.length - localizados - validar };
    }, [results]);

    return {
      lds, central, documents, results, running, progress, search, situation, allocation, sort,
      templates, selectedTemplateId, lastExport, banner, visibleRows, exportRows, selectedCount, ldsReady, summary,
      lastLd: Adapter.getLastLd(),
      canUndo: undoRef.current.length > 0,
      indexReady: Boolean(indexRef.current),
      setSearch, setSituation, setAllocation, setSort, setSelectedTemplateId, setBanner,
      addLds, removeLd, clearLds, attachCentral, removeCentral,
      addDocuments, removeDuplicates, clearConsulta, undo,
      toggleSelect, toggleSelectAll, runQuery, copyResults, exportExcel, repeatLastExport,
    };
  }

  root.GrconConsultasHooks = root.GrconConsultasHooks || {};
  root.GrconConsultasHooks.useConsultas = useConsultas;
})(window);
