import type { SigemPwBase, SigemPwState } from "../types/domain";
import { listedSources } from "../services/sigemPwReferenceSources";

function fmt(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR");
}

function fmtDate(value: unknown): string {
  const source = value == null ? "" : String(value);
  const date = new Date(source);
  return source && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)
    : "—";
}

interface Item { id: string; label: string; base: SigemPwBase; count: number | null; unit: string; detail?: string }

/**
 * Faixa fixa e compacta com as bases em uso: o usuário vê, sem abrir nenhum
 * painel, qual arquivo e qual data sustentam os números exibidos abaixo.
 */
export function SigemPwActiveBases({ state, onManage }: { state: SigemPwState; onManage(): void }) {
  const quality = state.result?.quality;
  const ldSources = listedSources(state.ld);
  const items: Item[] = [
    { id: "sigem", label: "SIGEM · Consulta Geral", base: state.sigem, count: quality?.sigemEntries ?? null, unit: "revisões de documentos" },
    { id: "pw", label: "ProjectWise · PW", base: state.pw, count: quality?.pwEntries ?? null, unit: "revisões de documentos (CSG/QTM)" },
    {
      id: "ld", label: "Referências · LDs", base: state.ld, count: quality?.ldDocumentCount ?? null, unit: "documentos únicos",
      detail: ldSources.length ? `${ldSources.filter(source => source.active).length} de ${ldSources.length} fonte(s) ativa(s)` : undefined,
    },
  ];
  const loaded = items.filter(item => item.base.meta).length;
  return (
    <section className="spw-active-bases" aria-label="Bases em uso na análise" id="spw-active-bases">
      <ul>
        {items.map(item => {
          const meta = item.base.meta;
          const date = meta ? (item.id === "sigem" && meta.referenceDate ? String(meta.referenceDate).split("-").reverse().join("/") : fmtDate(meta.importedAt)) : "";
          return (
            <li key={item.id} data-loaded={Boolean(meta)} data-base={item.id}>
              <span className="spw-active-bases-label">{item.label}</span>
              {meta ? (
                <>
                  <strong title={String(meta.fileName || "")}>{String(meta.fileName || item.label)}</strong>
                  <small>
                    Data da base: {date}
                    {item.count !== null ? ` · ${fmt(Number(item.count))} ${item.unit}` : ""}
                    {item.detail ? ` · ${item.detail}` : ""}
                  </small>
                </>
              ) : (
                <>
                  <strong>Não carregada</strong>
                  <small>{item.id === "ld" ? "Necessária para saber quais documentos são controlados." : "Importe esta base para comparar."}</small>
                </>
              )}
              <b className={meta ? "spw-base-status loaded" : "spw-base-status pending"}>{meta ? "✓ Em uso" : "! Pendente"}</b>
            </li>
          );
        })}
      </ul>
      <button type="button" className="secondary-button" onClick={onManage} aria-label={`Gerenciar fontes de comparação (${loaded} de 3 bases carregadas)`}>
        Importar ou trocar bases
      </button>
    </section>
  );
}
