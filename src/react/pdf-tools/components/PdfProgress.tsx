import type { PdfMergeProgressState } from "../types/domain";

interface PdfProgressProps {
  busy: boolean;
  progress: PdfMergeProgressState;
}

export function PdfProgress({ busy, progress }: PdfProgressProps) {
  const value = Math.max(0, Math.min(100, Math.round(progress.percent)));
  return (
    <div className="pdf-merge-progress" hidden={!busy} id="pdf-merge-progress" aria-live="polite">
      <div
        className="pdf-merge-progress-track"
        role="progressbar"
        aria-label="Progresso da combinação"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <i id="pdf-merge-progress-fill" style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }} />
      </div>
      <span id="pdf-merge-progress-text">{progress.message}</span>
    </div>
  );
}
