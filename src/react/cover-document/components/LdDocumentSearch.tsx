import type { ChangeEvent } from "react";
import type { CoverDocumentCandidate } from "../types/domain";

export function LdDocumentSearch({
  ldNames,
  ldSource,
  query,
  candidates,
  selectedId,
  busy,
  onLdFiles,
  onQuery,
  onSelect,
}: {
  ldNames: string[];
  ldSource: "grcon" | "manual" | "";
  query: string;
  candidates: CoverDocumentCandidate[];
  selectedId: string;
  busy: boolean;
  onLdFiles: (files: FileList) => void;
  onQuery: (value: string) => void;
  onSelect: (candidate: CoverDocumentCandidate) => void;
}) {
  const activeLabel = ldNames.length
    ? `LD em uso: ${ldNames.join(" · ")}`
    : "Selecionar LD";

  return (
    <section className="cover-card cover-search-card" aria-labelledby="cover-search-heading">
      <div className="cover-card-heading">
        <div><span>1 — LD</span><h3 id="cover-search-heading">Localizar pelo título oficial</h3></div>
        <small>A LD continua sendo a fonte da verdade.</small>
      </div>
      <label className="cover-file-input">
        <span>Base documental</span>
        <input
          type="file"
          accept=".xlsx,.xls,.xlsm"
          disabled={busy}
          onChange={(event: ChangeEvent<HTMLInputElement>) => event.currentTarget.files && onLdFiles(event.currentTarget.files)}
        />
        <strong>{activeLabel}</strong>
        <small>
          {ldNames.length
            ? (ldSource === "grcon" ? "Reutilizada automaticamente da LD já carregada no GRCON. Selecione outra apenas para substituí-la." : "LD escolhida especificamente para esta ferramenta.")
            : "Nenhuma LD ativa disponível. Selecione XLSX, XLS ou XLSM."}
        </small>
      </label>
      <label className="cover-search-field">
        <span>Título como aparece na LD</span>
        <input
          id="cover-title-search"
          type="search"
          value={query}
          disabled={!ldNames.length || busy}
          placeholder="Ex.: POP 01 - CONTROLE DE POTABILIDADE DA ÁGUA"
          autoComplete="off"
          onChange={(event: ChangeEvent<HTMLInputElement>) => onQuery(event.currentTarget.value)}
        />
      </label>
      {query.trim().length >= 2 ? (
        <div className="cover-results" aria-label="Resultados encontrados">
          {candidates.length ? candidates.map((candidate) => (
            <button key={candidate.id} className={`cover-result${candidate.id === selectedId ? " is-selected" : ""}`} type="button" onClick={() => onSelect(candidate)}>
              <strong>{candidate.title}</strong>
              <span>{candidate.documentNumber || "Código não informado"} · Rev. {candidate.revision || "—"}</span>
              <small>
                {candidate.ldName || "LD"}{candidate.sheet ? ` / ${candidate.sheet}` : ""}{candidate.row ? ` · linha ${candidate.row}` : ""}{candidate.eap ? ` · EAP ${candidate.eap}` : ""}{candidate.tag ? ` · TAG ${candidate.tag}` : ""}
              </small>
            </button>
          )) : <div className="cover-empty-result">Nenhum título compatível foi localizado na LD em uso.</div>}
        </div>
      ) : null}
    </section>
  );
}
