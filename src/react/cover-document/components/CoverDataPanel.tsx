import type { ChangeEvent } from "react";
import type { CoverDocumentCandidate, CoverDocumentData } from "../types/domain";

const EDITABLE_FIELDS: Array<{ key: keyof CoverDocumentData; label: string; readOnly?: boolean; restoreable?: boolean }> = [
  { key: "title", label: "Título · vindo da LD", readOnly: true },
  { key: "documentNumber", label: "Código do documento · vindo da LD", readOnly: true },
  { key: "taxonomy", label: "Taxonomia Interna · vinda da LD", readOnly: true },
  { key: "revision", label: "Revisão · informada manualmente", restoreable: false },
  { key: "revisionDate", label: "Data · preenchida automaticamente hoje", readOnly: true },
  { key: "revisionDescription", label: "Descrição da revisão" },
  { key: "executor", label: "Execução" },
  { key: "checker", label: "Verificação" },
  { key: "approver", label: "Aprovação" },
];

export function CoverDataPanel({
  selected,
  data,
  overrides,
  open,
  onToggle,
  onUpdate,
  onRestore,
}: {
  selected: CoverDocumentCandidate | null;
  data: CoverDocumentData;
  overrides: Set<keyof CoverDocumentData>;
  open: boolean;
  onToggle: () => void;
  onUpdate: <K extends keyof CoverDocumentData>(key: K, value: CoverDocumentData[K]) => void;
  onRestore: (key: keyof CoverDocumentData) => void;
}) {
  if (!selected) return null;
  return (
    <section className="cover-card cover-data-card" aria-labelledby="cover-data-heading">
      <div className="cover-card-heading">
        <div><span>DADOS DA LINHA</span><h3 id="cover-data-heading">{data.documentNumber}</h3></div>
        <button className="secondary-button compact" type="button" onClick={onToggle}>{open ? "Ocultar dados" : "Revisar dados da capa"}</button>
      </div>
      <dl className="cover-data-summary">
        <div><dt>Título</dt><dd>{data.title}</dd></div>
        <div><dt>Taxonomia</dt><dd>{data.taxonomy || "Não informado na LD"}</dd></div>
        <div><dt>EAP</dt><dd>{data.eap || "Não informado na LD"}</dd></div>
        <div><dt>Disciplina</dt><dd>{data.discipline || "Não informado na LD"}</dd></div>
        <div><dt>Categoria</dt><dd>{data.categoryLabel || data.category || "Não informado na LD"}</dd></div>
        <div><dt>Origem</dt><dd>{selected.ldName}{selected.sheet ? ` · ${selected.sheet}` : ""}{selected.row ? ` · linha ${selected.row}` : ""}</dd></div>
      </dl>
      {open ? (
        <div className="cover-edit-grid">
          {EDITABLE_FIELDS.map(({ key, label, readOnly, restoreable = true }) => (
            <label key={key} className={overrides.has(key) ? "is-overridden" : ""}>
              <span>{label}{overrides.has(key) ? <em>Alterado manualmente</em> : null}</span>
              <input
                value={String(data[key] ?? "")}
                readOnly={readOnly}
                onChange={readOnly ? undefined : (event: ChangeEvent<HTMLInputElement>) => onUpdate(key, event.currentTarget.value)}
              />
              {overrides.has(key) && !readOnly && restoreable ? (
                <button type="button" className="text-button" onClick={() => onRestore(key)}>
                  Restaurar valor da LD
                </button>
              ) : null}
            </label>
          ))}
        </div>
      ) : null}
    </section>
  );
}
