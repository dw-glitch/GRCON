import type { SigemPwListKey, SigemPwState } from "../types/domain";

function fmt(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR");
}

function Card({ label, value, css, note, available, listKey, active, onSelect }: {
  label: string;
  value: number;
  css: string;
  note: string;
  available: boolean;
  listKey: SigemPwListKey;
  active: boolean;
  onSelect(list: SigemPwListKey): void;
}) {
  return (
    <button
      type="button"
      className={`spw-kpi ${css} ${active ? "active" : ""}`.trim()}
      data-summary-list={listKey}
      aria-pressed={active}
      disabled={!available}
      onClick={() => onSelect(listKey)}
    >
      <span>{label}</span>
      <strong>{available ? fmt(value) : "—"}</strong>
      <small>{note}</small>
      <em>{available ? "Ver relação detalhada →" : "Aguardando bases"}</em>
    </button>
  );
}

export function SigemPwSituationCards({ state, activeList, onSelect }: {
  state: SigemPwState;
  activeList: SigemPwListKey;
  onSelect(list: SigemPwListKey): void;
}) {
  const s = state.result?.summary;
  const both = Boolean(state.sigem.meta && state.pw.meta);

  return (
    <>
      <section className="spw-actions-grid" id="spw-actions-grid" aria-label="Situações exclusivas entre as bases">
        <Card label="SIGEM: falta cadastrar no PW" value={s?.sigemOnly || 0} css="" note="Postado no SIGEM; código + revisão ainda não cadastrados no PW." available={both} listKey="sigemOnly" active={activeList === "sigemOnly"} onSelect={onSelect} />
        <Card label="SIGEM + PW: ainda não emitido" value={s?.bothNotEmitted || 0} css="warn" note="Postado no SIGEM e cadastrado no PW. Falta evidência de emissão no PW." available={both} listKey="bothNotEmitted" active={activeList === "bothNotEmitted"} onSelect={onSelect} />
        <Card label="SIGEM + PW: emitido" value={s?.bothEmitted || 0} css="ok" note="Postado no SIGEM e emitido no PW; a revisão é usada quando informada." available={both} listKey="bothEmitted" active={activeList === "bothEmitted"} onSelect={onSelect} />
        <Card label="Só PW: ainda não emitido" value={s?.pwOnlyNotEmitted || 0} css="pw warn" note="Cadastrado no PW, sem emissão e não localizado no SIGEM." available={both} listKey="pwOnlyNotEmitted" active={activeList === "pwOnlyNotEmitted"} onSelect={onSelect} />
        <Card label="Só PW: emitido" value={s?.pwOnlyEmitted || 0} css="pw" note="Emitido no PW, mas o código + revisão não foi localizado no SIGEM." available={both} listKey="pwOnlyEmitted" active={activeList === "pwOnlyEmitted"} onSelect={onSelect} />
      </section>
      <p className="spw-classification-note" id="spw-classification-note">
        {both
          ? <><strong>Contagem conciliada:</strong> {fmt(s?.classifiedTotal || 0)} registro(s) distribuídos uma única vez entre as cinco situações. Revisão ausente no PW é conciliada pelo código do documento.</>
          : "Carregue as bases SIGEM e PW para obter a classificação completa."}
      </p>
    </>
  );
}
