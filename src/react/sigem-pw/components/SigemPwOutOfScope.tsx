import { useMemo, useState } from "react";
import { UiPanel } from "../../core/ui/UiPrimitives";
import type { SigemPwRecord, SigemPwState } from "../types/domain";

const PAGE_SIZE = 75;
type Origin = "sigem" | "pw";

function str(value: unknown): string { return value == null ? "" : String(value).trim(); }
function fmt(value: number): string { return value.toLocaleString("pt-BR"); }
function scopeRows(records: SigemPwRecord[]): SigemPwRecord[] {
  const inScope = window.GrconSigemPwDashboard?.isC1OCode;
  return records.filter((record) => !(inScope ? inScope(record.document) : /C1O/i.test(str(record.document))));
}
function rev(row: SigemPwRecord): string { return str(row.revisionComplete || row.revision); }
function status(row: SigemPwRecord): string { return str(row.state || row.status); }
function discipline(row: SigemPwRecord): string { return str(row.disciplineDesc || row.discipline); }
function uniqueCount(records: SigemPwRecord[]): number {
  return new Set(records.map((row) => window.GrconSigemPwDashboard?.norm(row.document) || str(row.document).toUpperCase()).filter(Boolean)).size;
}

export function SigemPwOutOfScope({ state }: { state: SigemPwState }) {
  const [expanded, setExpanded] = useState(false);
  const [origin, setOrigin] = useState<Origin>("sigem");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState("");
  const [disciplineValue, setDiscipline] = useState("");
  const [page, setPage] = useState(1);
  const [exportBusy, setExportBusy] = useState(false);
  // sourceRecords existe em PW porque a base saneada mantém o arquivo importado
  // integralmente. Nunca usar os mapas do modelo comparativo para esta lista.
  const separated = useMemo(() => ({
    sigem: scopeRows(state.sigem.records || []),
    pw: scopeRows(state.pw.sourceRecords || state.pw.records || []),
  }), [state.sigem.records, state.pw.sourceRecords, state.pw.records]);
  const originals = separated[origin];
  const disciplines = useMemo(() => [...new Set(originals.map(discipline).filter(Boolean))].sort(), [originals]);
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleUpperCase("pt-BR");
    return originals.filter((row) => {
      if (revision && rev(row) !== revision) return false;
      if (disciplineValue && discipline(row) !== disciplineValue) return false;
      if (!search) return true;
      return [row.document, row.title, row.documentTypeDesc].some((value) => str(value).toLocaleUpperCase("pt-BR").includes(search));
    });
  }, [originals, query, revision, disciplineValue]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  function changeOrigin(value: Origin) { setOrigin(value); setPage(1); setRevision(""); setDiscipline(""); }
  async function exportRows() {
    if (!filtered.length || exportBusy) return;
    setExportBusy(true);
    try {
      await window.GRCONModuleLoader?.ensure("xlsx");
      const xlsx = window.XLSX as unknown as {
        utils: {
          book_new(): unknown;
          json_to_sheet(rows: Array<Record<string, unknown>>): Record<string, unknown>;
          book_append_sheet(book: unknown, sheet: Record<string, unknown>, name: string): void;
        };
        writeFile(book: unknown, filename: string): void;
      } | undefined;
      if (!xlsx?.utils?.json_to_sheet || !xlsx.writeFile) throw new Error("Exportador XLSX indisponível.");
      const rows = filtered.map((row) => ({
        Origem: origin.toUpperCase(),
        "Código documental": str(row.document),
        "Título": str(row.title),
        "Revisão": rev(row),
        Disciplina: discipline(row),
        "Tipo documental": str(row.documentTypeDesc || row.documentType),
        "Situação original": status(row),
        "Última emissão": str(row.lastEmission),
        "Linha na origem": Number(row.sourceRow) || "",
        "Motivo": str(row.document) ? "Código fora do escopo C1O" : "Código não informado",
      }));
      const book = xlsx.utils.book_new();
      const sheet = xlsx.utils.json_to_sheet(rows);
      sheet["!cols"] = [{ wch: 11 }, { wch: 56 }, { wch: 48 }, { wch: 11 }, { wch: 25 }, { wch: 25 }, { wch: 26 }, { wch: 20 }, { wch: 19 }, { wch: 31 }];
      xlsx.utils.book_append_sheet(book, sheet, "Fora do escopo C1O");
      xlsx.writeFile(book, `GRCON_Fora_do_escopo_C1O_${origin.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível exportar a lista.";
      if (window.GrconNotify) window.GrconNotify(message, "error");
      else window.alert(message);
    } finally { setExportBusy(false); }
  }

  const outsideCount = separated.sigem.length + separated.pw.length;
  return (
    <UiPanel className="spw-section-panel spw-out-of-scope-panel" labelledBy="spw-out-of-scope-title">
      <div className="spw-section-heading">
        <div>
          <span className="spw-kicker">REGISTROS PRESERVADOS · SEM IMPACTO NOS INDICADORES</span>
          <h3 id="spw-out-of-scope-title">Fora do escopo C1O</h3>
          <p>Somente códigos contendo C1O participam do comparativo. Os demais permanecem disponíveis para auditoria, sem serem classificados como pendências.</p>
        </div>
        <button className="secondary-button" type="button" aria-controls="spw-out-of-scope-content" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {fmt(outsideCount)} registro(s) · {expanded ? "Ocultar lista" : "Consultar lista"}
        </button>
      </div>
      <div id="spw-out-of-scope-content" hidden={!expanded}>
        <div className="spw-list-tabs" role="tablist" aria-label="Origem dos documentos fora do escopo">
          {(["sigem", "pw"] as const).map((value) => (
            <button type="button" role="tab" key={value} aria-selected={origin === value} className={origin === value ? "active" : ""}
              onClick={() => changeOrigin(value)}>
              <span>{value.toUpperCase()}</span><strong>{fmt(separated[value].length)}</strong>
            </button>
          ))}
        </div>
        <div className="spw-list-head">
          <span>{fmt(uniqueCount(originals))} códigos únicos nesta origem · {fmt(filtered.length)} registro(s) após filtros</span>
          <button className="secondary-button" type="button" disabled={!filtered.length || exportBusy} onClick={() => { void exportRows(); }}>
            {exportBusy ? "Exportando…" : "Exportar Excel"}
          </button>
        </div>
        <div className="spw-list-filters" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <input aria-label="Buscar código ou título fora do escopo" placeholder="Buscar código ou título" value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
          <input aria-label="Filtrar revisão fora do escopo" placeholder="Revisão" value={revision}
            onChange={(event) => { setRevision(event.target.value); setPage(1); }} />
          <select aria-label="Filtrar disciplina fora do escopo" value={disciplineValue} onChange={(event) => { setDiscipline(event.target.value); setPage(1); }}>
            <option value="">Todas as disciplinas</option>
            {disciplines.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button type="button" className="secondary-button" onClick={() => { setQuery(""); setRevision(""); setDiscipline(""); setPage(1); }}>Limpar filtros</button>
        </div>
        <div className="ui-v3-table-shell">
          <div className="spw-table-wrap" tabIndex={0} aria-label={`Registros ${origin.toUpperCase()} fora do escopo C1O`}>
            <table className="spw-comparison-table">
              <caption>Documentos fora do escopo C1O — {origin.toUpperCase()}</caption>
              <thead><tr><th>Código documental</th><th>Título</th><th>Revisão</th><th>Disciplina</th><th>Situação original</th><th>Última emissão</th><th>Linha</th></tr></thead>
              <tbody>{visible.map((row, index) => (
                <tr key={`${origin}-${row.sourceRow || index}-${row.document || ""}-${rev(row)}`}>
                  <td className="spw-code">{str(row.document) || "—"}</td>
                  <td>{str(row.title) || "—"}</td>
                  <td>{rev(row) || "—"}</td>
                  <td>{discipline(row) || "—"}</td>
                  <td>{status(row) || "—"}</td>
                  <td>{str(row.lastEmission) || "—"}</td>
                  <td>{Number(row.sourceRow) || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
            {!visible.length ? <div className="spw-empty">Nenhum registro nesta seleção.</div> : null}
          </div>
        </div>
        <div className="spw-list-head" style={{ justifyContent: "flex-end", gap: 12 }}>
          <span>Página {fmt(currentPage)} de {fmt(pages)}</span>
          <button className="secondary-button" type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
          <button className="secondary-button" type="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Próxima</button>
        </div>
      </div>
    </UiPanel>
  );
}
