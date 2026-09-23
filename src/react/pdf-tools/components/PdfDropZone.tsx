import type { DragEvent, KeyboardEvent, MouseEvent, RefObject } from "react";

interface PdfDropZoneProps {
  busy: boolean;
  active: boolean;
  hasFiles: boolean;
  inputRef: RefObject<HTMLInputElement>;
  onFiles(files: FileList | null): void;
  onEnter(): void;
  onLeave(): void;
  onReset(): void;
}

export function PdfDropZone(props: PdfDropZoneProps) {
  const openPicker = (): void => {
    if (!props.busy) props.inputRef.current?.click();
  };

  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (event.target instanceof HTMLInputElement) return;
    openPicker();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if ((event.key === "Enter" || event.key === " ") && !props.busy) {
      event.preventDefault();
      openPicker();
    }
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    props.onReset();
    if (!props.busy) props.onFiles(event.dataTransfer.files);
  };

  const className = [
    "pdf-merge-drop",
    props.hasFiles ? "has-files" : "is-empty",
    props.active ? "is-dragging" : "",
    props.busy ? "is-disabled" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={className}
      id="pdf-merge-drop"
      role="button"
      tabIndex={0}
      aria-describedby="pdf-merge-drop-hint"
      aria-disabled={props.busy}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onDragEnter={(event) => { event.preventDefault(); props.onEnter(); }}
      onDragOver={onDragOver}
      onDragLeave={props.onLeave}
      onDrop={onDrop}
    >
      <input
        ref={props.inputRef}
        accept="application/pdf,.pdf"
        hidden
        id="pdf-merge-input"
        multiple
        type="file"
        disabled={props.busy}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          props.onFiles(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <span className="pdf-merge-drop-icon">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 16V4M8 8l4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
        </svg>
      </span>
      <span className="pdf-merge-drop-copy">
        <strong>{props.hasFiles ? "Adicionar PDFs" : "Arraste seus PDFs aqui"}</strong>
        <span id="pdf-merge-drop-hint">
          {props.hasFiles ? "ou arraste mais arquivos para esta área" : "ou clique para selecionar vários arquivos"}
        </span>
        {!props.hasFiles ? <small>Vários arquivos permitidos</small> : null}
      </span>
    </div>
  );
}
