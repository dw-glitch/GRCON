/* Worker isolado: lê o CSV PW fora da thread de interface. A identidade final
   é recalculada no módulo principal com TriagemCore/GrconUtils antes de persistir. */
importScripts("../sigem_pw_dashboard_core.js");

self.addEventListener("message", (event) => {
  try {
    const payload = event.data || {};
    if (payload.type === "quality-ld") {
      importScripts("../xlsx.full.min.js");
      const book = self.XLSX.read(payload.buffer, { type: "array", cellDates: false, dense: false });
      const sheets = [];
      for (const sheetName of book.SheetNames) {
        const sheet = book.Sheets[sheetName];
        if (!sheet || !sheet["!ref"]) continue;
        const range = self.XLSX.utils.decode_range(sheet["!ref"]);
        const matrix = [];
        for (let row = range.s.r; row <= range.e.r; row += 1) {
          const values = [];
          for (let column = range.s.c; column <= Math.min(range.e.c, 39); column += 1) {
            const cell = sheet[self.XLSX.utils.encode_cell({ r: row, c: column })];
            values[column - range.s.c] = cell ? self.GrconSigemPwDashboard.text(cell.w !== undefined ? cell.w : cell.v) : "";
          }
          matrix.push(values);
        }
        sheets.push({ name: sheetName, matrix });
      }
      const parsed = self.GrconSigemPwDashboard.parseReferenceSheets(sheets, payload.meta);
      self.postMessage({ ok: true, type: "quality-ld", parsed });
      return;
    }
    if (payload.type === "model") {
      const Dashboard = self.GrconSigemPwDashboard;
      // Chamadas antigas sem metadados de validade LD preservam semântica histórica.
      // A interface atual envia os quatro sinalizadores e exige validação N-1710.
      const settings = Object.prototype.hasOwnProperty.call(payload, "ldAvailable")
        ? { requireN1710Ld: true, requireDocumentReference: true, ldAvailable: Boolean(payload.ldAvailable),
            sigemAvailable: Boolean(payload.sigemAvailable), pwAvailable: Boolean(payload.pwAvailable) }
        : undefined;
      const startedAt = Date.now();
      const model = Dashboard.createModel(payload.sigemRecords || [], payload.pwRecords || [], payload.ldRecords || [], settings);
      // Cada agregado carrega todas as listas de comparação (dezenas de MB
      // clonados para a thread principal). A interface exibe um por vez; por isso
      // só os pedidos em `aggregateKeys` são calculados. Sem a lista (chamadores
      // antigos), mantém o conjunto completo.
      const requested = Array.isArray(payload.aggregateKeys) && payload.aggregateKeys.length ? new Set(payload.aggregateKeys) : null;
      const classes = [["all", {}], ["ET", { documentClass: "ET" }], ["N-1710", { documentClass: "N-1710" }], ["CV", { documentClass: "CV" }]];
      const aggregates = {};
      for (const scope of ["all", "revision0"]) {
        for (const [label, filters] of classes) {
          const key = `${scope}:${label}`;
          const aliased = scope === "all" && requested && requested.has(label);
          if (requested && !requested.has(key) && !aliased) continue;
          const value = Dashboard.aggregateModel(model, filters, { revisionScope: scope });
          aggregates[key] = value;
          if (scope === "all") aggregates[label] = value;
        }
      }
      self.postMessage({ ok: true, type: "model", generation: payload.generation, model, aggregates, computeMs: Date.now() - startedAt });
      return;
    }
    const source = new TextDecoder("utf-8").decode(new Uint8Array(payload.buffer || new ArrayBuffer(0)));
    const parsed = self.GrconSigemPwDashboard.parsePwCsv(source, payload.meta || {});
    self.postMessage({ ok: true, parsed });
  } catch (error) {
    self.postMessage({ ok: false, error: error && error.message ? error.message : "Falha ao processar a base ProjectWise." });
  }
});
