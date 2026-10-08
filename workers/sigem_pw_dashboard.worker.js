/* Worker isolado: lê o CSV PW fora da thread de interface. A identidade final
   é recalculada no módulo principal com TriagemCore/GrconUtils antes de persistir. */
importScripts("../sigem_pw_dashboard_core.js");

self.addEventListener("message", (event) => {
  try {
    const payload = event.data || {};
    if (payload.type === "quality-ld") {
      importScripts("../xlsx.full.min.js");
      const index = self.XLSX.read(payload.buffer, { type: "array", bookSheets: true });
      const sheetName = index.SheetNames.find(name => self.GrconSigemPwDashboard.normalizeHeader(name) === "N 1710");
      if (!sheetName) throw new Error("LD inválida: a aba N-1710 não foi localizada.");
      const book = self.XLSX.read(payload.buffer, { type: "array", cellDates: false, dense: false, sheets: [sheetName] });
      const sheet = book.Sheets[sheetName];
      const matrix = [];
      if (sheet && sheet["!ref"]) {
        const range = self.XLSX.utils.decode_range(sheet["!ref"]);
        for (let row = range.s.r; row <= range.e.r; row += 1) {
          const values = [];
          for (let column = range.s.c; column <= Math.min(range.e.c, 39); column += 1) {
            const cell = sheet[self.XLSX.utils.encode_cell({ r: row, c: column })];
            values[column - range.s.c] = cell ? self.GrconSigemPwDashboard.text(cell.w !== undefined ? cell.w : cell.v) : "";
          }
          matrix.push(values);
        }
      }
      const parsed = self.GrconSigemPwDashboard.parseLdMatrix(matrix, { ...payload.meta, sheetName });
      self.postMessage({ ok: true, type: "quality-ld", parsed });
      return;
    }
    if (payload.type === "model") {
      const Dashboard = self.GrconSigemPwDashboard;
      const model = Dashboard.createModel(payload.sigemRecords || [], payload.pwRecords || [], payload.ldRecords || []);
      const allScope = {
        all: Dashboard.aggregateModel(model, {}, { revisionScope: "all" }),
        ET: Dashboard.aggregateModel(model, { documentClass: "ET" }, { revisionScope: "all" }),
        "N-1710": Dashboard.aggregateModel(model, { documentClass: "N-1710" }, { revisionScope: "all" }),
      };
      const revision0Scope = {
        all: Dashboard.aggregateModel(model, {}, { revisionScope: "revision0" }),
        ET: Dashboard.aggregateModel(model, { documentClass: "ET" }, { revisionScope: "revision0" }),
        "N-1710": Dashboard.aggregateModel(model, { documentClass: "N-1710" }, { revisionScope: "revision0" }),
      };
      const aggregates = {
        ...allScope,
        "revision0:all": revision0Scope.all,
        "revision0:ET": revision0Scope.ET,
        "revision0:N-1710": revision0Scope["N-1710"],
        "all:all": allScope.all,
        "all:ET": allScope.ET,
        "all:N-1710": allScope["N-1710"],
      };
      self.postMessage({ ok: true, type: "model", generation: payload.generation, model, aggregates });
      return;
    }
    const source = new TextDecoder("utf-8").decode(new Uint8Array(payload.buffer || new ArrayBuffer(0)));
    const parsed = self.GrconSigemPwDashboard.parsePwCsv(source, payload.meta || {});
    self.postMessage({ ok: true, parsed });
  } catch (error) {
    self.postMessage({ ok: false, error: error && error.message ? error.message : "Falha ao processar a base ProjectWise." });
  }
});
