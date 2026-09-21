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
  return (
    <aside className="pdf-merge-panel pdf-merge-output" aria-labelledby="pdf-merge-output-title">
      <header className="pdf-merge-panel-head">
        <div><span>ARQUIVO FINAL</span><h3 id="pdf-merge-output-title">Gerar PDF combinado</h3></div>
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
      <ul className="pdf-merge-checks">
        <li><i>1</i>Confira a ordem dos arquivos.</li>
        <li><i>2</i>Defina o nome do arquivo final.</li>
        <li><i>3</i>Combine e baixe o PDF resultante.</li>
      </ul>
      <div className="pdf-merge-actions">
        <button className="primary-button" id="pdf-merge-run" type="button" disabled={props.busy || props.itemCount < 2} hidden={props.busy} onClick={() => void props.onCombine()}>Combinar e baixar</button>
        <button className="secondary-button" id="pdf-merge-cancel" type="button" hidden={!props.busy} onClick={props.onCancel}>Cancelar</button>
      </div>
      <PdfProgress busy={props.busy} progress={props.progress} />
      <PdfResult result={props.result} formattedSize={props.resultSize} onDownload={props.onDownload} />
      <small className="pdf-merge-output-note">PDFs protegidos por senha precisam ser desbloqueados antes da combinação. O resultado existe somente para download e não entra no histórico do GRCON.</small>
    </aside>
  );
}
