import { useEffect, useRef, useState, type FormEvent } from "react";
import { historicoEgrdtsAdapter as Adapter } from "../services/historicoEgrdtsAdapter";
import type { HistoryRecord, UpdateNumberResult } from "../types/domain";

interface Props {
  record: HistoryRecord;
  scope: string;
  onCancel(): void;
  onSave(value: string): UpdateNumberResult;
}

export function HistoricoEgrdtNumberEditor({ record, scope, onCancel, onSave }: Props) {
  const parsed = Adapter.parsedNumber(record);
  const [value, setValue] = useState(parsed ? String(parsed.sequence).padStart(4, "0") : "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = inputRef.current;
    if (!input) return;
    const result = onSave(value);
    if (result.updated) return;
    input.setAttribute("aria-invalid", "true");
    input.setCustomValidity(result.error || "Número inválido.");
    input.reportValidity();
    input.setCustomValidity("");
  };

  return (
    <form className="history-number-editor" id="history-number-editor" onSubmit={submit}>
      <label htmlFor="history-number-input">
        <span>Novo número sequencial</span>
        <input
          ref={inputRef}
          autoComplete="off"
          id="history-number-input"
          inputMode="numeric"
          maxLength={4}
          value={value}
          onChange={(event) => {
            event.currentTarget.removeAttribute("aria-invalid");
            setValue(event.currentTarget.value.replace(/\D/g, "").slice(0, 4));
          }}
        />
      </label>
      <div>
        <small>{scope}</small>
        <div className="history-number-editor-actions">
          <button className="secondary-button compact" data-history-action="cancel" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="primary-button compact" data-history-action="save" type="submit">
            Salvar número
          </button>
        </div>
      </div>
    </form>
  );
}
