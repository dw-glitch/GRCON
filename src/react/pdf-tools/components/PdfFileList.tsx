import { useEffect, type DragEvent } from "react";
import type { PdfMergeFocusRequest } from "../hooks/usePdfMerge";
import type { PdfMergeItem } from "../types/domain";

interface PdfFileListProps {
  items: PdfMergeItem[];
  busy: boolean;
  count: number;
  totalSize: string;
  draggedId: string;
  dropTargetId: string;
  focusRequest: PdfMergeFocusRequest | null;
  formatBytes(value: number): string;
  onAdd(): void;
  onClear(): void;
  onMove(id: string, delta: number): void;
  onRemove(id: string): void;
  onDragStart(id: string): void;
  onDragOver(id: string): void;
  onDrop(id: string): void;
  onDragEnd(): void;
}

export function PdfFileList(props: PdfFileListProps) {
  useEffect(() => {
    if (!props.focusRequest) return;
    const request = props.focusRequest;
    window.requestAnimationFrame(() => {
      const row = Array.from(document.querySelectorAll<HTMLElement>("[data-pdf-id]"))
        .find((candidate) => candidate.dataset.pdfId === request.id);
      row?.querySelector<HTMLButtonElement>(`[data-pdf-action="${request.action}"]`)?.focus();
    });
  }, [props.focusRequest]);

  const dragStart = (event: DragEvent<HTMLLIElement>, item: PdfMergeItem): void => {
    if (props.busy) {
      event.preventDefault();
      return;
    }
    props.onDragStart(item.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
  };

  return (
    <>
      <div className="pdf-merge-file-tools">
        <div className="pdf-merge-metrics" aria-live="polite">
          <span><strong id="pdf-merge-count">{props.count.toLocaleString("pt-BR")}</strong><small>Arquivos</small></span>
          <span><strong id="pdf-merge-size">{props.totalSize}</strong><small>Tamanho total</small></span>
        </div>
        <div>
          <button className="secondary-button compact" id="pdf-merge-add" type="button" disabled={props.busy} onClick={props.onAdd}>Adicionar arquivos</button>
          <button className="text-button danger" id="pdf-merge-clear" type="button" disabled={props.busy || !props.items.length} onClick={props.onClear}>Limpar lista</button>
        </div>
      </div>
      <div className="pdf-merge-list-wrap">
        <ol className="pdf-merge-list" hidden={!props.items.length} id="pdf-merge-list" aria-label="Ordem dos arquivos">
          {props.items.map((item, index) => {
            const dragging = props.draggedId === item.id;
            const dropTarget = props.dropTargetId === item.id;
            const className = [
              "pdf-merge-item",
              dragging ? "is-dragging" : "",
              dropTarget ? "is-drop-target" : "",
            ].filter(Boolean).join(" ");
            return (
              <li
                key={item.id}
                className={className}
                data-pdf-id={item.id}
                draggable={!props.busy}
                onDragStart={(event) => dragStart(event, item)}
                onDragOver={(event) => {
                  if (item.id === props.draggedId) return;
                  event.preventDefault();
                  props.onDragOver(item.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  props.onDrop(item.id);
                }}
                onDragEnd={props.onDragEnd}
              >
                <button className="pdf-merge-grip" type="button" data-pdf-action="drag" aria-label={`Arrastar ${item.name} para mudar a ordem`} title="Arraste para mudar a ordem">⋮⋮</button>
                <span className="pdf-merge-order" aria-label={`Posição ${index + 1}`}>{index + 1}</span>
                <span className="pdf-merge-file-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6zM15 3v4h4" /><path d="M8 16h8M8 12h5" /></svg>
                </span>
                <span className="pdf-merge-file-copy"><strong title={item.name}>{item.name}</strong><small>{props.formatBytes(item.size)}</small></span>
                <span className="pdf-merge-item-actions">
                  <button type="button" data-pdf-action="up" disabled={index === 0 || props.busy} aria-label={`Subir ${item.name}`} onClick={() => props.onMove(item.id, -1)}>↑</button>
                  <button type="button" data-pdf-action="down" disabled={index === props.items.length - 1 || props.busy} aria-label={`Descer ${item.name}`} onClick={() => props.onMove(item.id, 1)}>↓</button>
                  <button className="danger" type="button" data-pdf-action="remove" disabled={props.busy} aria-label={`Remover ${item.name}`} onClick={() => props.onRemove(item.id)}>Remover</button>
                </span>
              </li>
            );
          })}
        </ol>
        <empty-state className="pdf-merge-empty" hidden={Boolean(props.items.length)} id="pdf-merge-empty">
          <strong>Nenhum arquivo selecionado</strong><span>Adicione pelo menos dois PDFs para começar.</span>
        </empty-state>
      </div>
    </>
  );
}
