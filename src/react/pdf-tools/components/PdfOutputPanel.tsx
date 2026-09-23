import type { PdfMergeProgressState, PdfMergeResult } from "../types/domain";
import { PdfProgress } from "./PdfProgress";
import { PdfResult } from "./PdfResult";

interface PdfOutputPanelProps {
  busy: boolean;
  itemCount: number;
  outputName: string;
  progress: PdfMergeProgressState;
  result: PdfMergeResult | null;
  resultSize: string;
  onOutputName(value: string): void;
  onCombine(): void;
  onCancel(): void;
  onDownload(): void;
}

export function PdfOutputPanel(props: PdfOutputPanelProps) {
  const hasMinimum = props.itemCount >= 2;
  const hasName = Boolean(props.outputName.trim());
  const ready = hasMinimum && hasName;

  return (
    <aside className={`pdf-merge-panel pdf-merge-output${props.busy ? " is-busy" : ""}${props.result ? " has-result" : ""}`} aria-labelledby="pdf-merge-output-title">
      <header className="pdf-merge-panel-head">
        <div>
          <span>{props.busy ? "COMBINANDO PDFs" : "3 — GERAR"}</span>
          <h3 id="pdf-merge-output-title">{props.busy ? "Processando arquivo final" : "Arquivo final"}</h3>
        </div>
      </header>

      <label className="pdf-merge-name">
        <span>Nome do arquivo</span>
        <input
          autoComplete="off"
          id="pdf-merge-output-name"
          maxLength={124}
          type="text"
          value={props.outputName}
          disabled={props.busy}
          onChange={(event) => props.onOutputName(event.currentTarget.value)}
        />
      </label>

      <div className="pdf-merge-output-summary" aria-live="polite">
        <strong>{props.itemCount.toLocaleString("pt-BR")} PDF{props.itemCount === 1 ? "" : "s"}</strong>
        <span>será{props.itemCount === 1 ? "" : "ão"} transformado{props.itemCount === 1 ? "" : "s"} em <b>1 PDF</b></span>
      </div>

      <ul className="pdf-merge-checks" aria-label="Preparação do arquivo final">
        <li className={props.itemCount > 0 ? "is-complete" : ""}><i>{props.itemCount > 0 ? "✓" : "1"}</i>PDFs adicionados</li>
        <li className={hasMinimum ? "is-complete" : ""}><i>{hasMinimum ? "✓" : "2"}</i>Ordem pronta</li>
        <li className={ready ? "is-complete" : ""}><i>{ready ? "✓" : "3"}</i>Nome definido</li>
      </ul>

      {!hasMinimum && !props.busy ? (
        <small className="pdf-merge-minimum-note">Adicione pelo menos 2 PDFs para combinar.</small>
      ) : null}

      <div className="pdf-merge-actions">
        <button className="primary-button" id="pdf-merge-run" type="button" disabled={props.busy || !ready} hidden={props.busy} onClick={() => void props.onCombine()}>Combinar e baixar</button>
        <button className="secondary-button" id="pdf-merge-cancel" type="button" hidden={!props.busy} onClick={props.onCancel}>Cancelar processamento</button>
      </div>

      <PdfProgress busy={props.busy} progress={props.progress} />
      <PdfResult result={props.result} formattedSize={props.resultSize} onDownload={props.onDownload} />

      <small className="pdf-merge-output-note">PDFs protegidos por senha precisam ser desbloqueados antes da combinação. O resultado existe somente para download e não entra no histórico do GRCON.</small>
    </aside>
  );
}
