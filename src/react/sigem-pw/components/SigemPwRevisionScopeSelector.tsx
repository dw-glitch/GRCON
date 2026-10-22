import type { SigemPwRevisionScope } from "../types/domain";

const OPTIONS: ReadonlyArray<{ value: SigemPwRevisionScope; label: string; short: string }> = [
  { value: "revision0", label: "Revisão 0", short: "Cadastro inicial" },
  { value: "all", label: "Todas as revisões", short: "Movimentação documental" },
];

export function SigemPwRevisionScopeSelector({
  value,
  onChange,
}: {
  value: SigemPwRevisionScope;
  onChange(value: SigemPwRevisionScope): void;
}) {
  const description = value === "revision0"
    ? "Compara SIGEM Rev. 0 com PW Rev. 0 e cadastros “Previsto” sem revisão informada. A revisão desconhecida não é tratada como emissão nem como revisão 0."
    : "Compara todas as ocorrências Documento + Revisão entre SIGEM e PW.";

  return (
    <div className="spw-revision-scope-block">
      <div className="spw-revision-scope" role="group" aria-label="Universo de revisão do Dashboard">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            data-revision-scope={option.value}
            aria-pressed={value === option.value}
            className={value === option.value ? "active" : ""}
            onClick={() => onChange(option.value)}
          >
            <strong>{option.label}</strong>
            <span>{option.short}</span>
          </button>
        ))}
      </div>
      <p className="spw-revision-scope-note" aria-live="polite">{description}</p>
    </div>
  );
}
