import type { CoverDocumentCandidate, CoverDocumentData, SourceDocumentInfo, ValidationMessage } from "../types/domain";

function isoToBr(value: string): string {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function normalizeRevisionDate(value: string): string {
  return isoToBr(String(value || "").trim());
}

export function validateCover(
  selected: CoverDocumentCandidate | null,
  data: CoverDocumentData,
  source: SourceDocumentInfo | null,
  totalPages: number | null,
): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const push = (level: ValidationMessage["level"], id: string, message: string) => messages.push({ level, id, message });

  if (!selected) push("error", "document", "Selecione o registro correto da LD.");
  if (!source) push("error", "source", "Anexe o documento que receberá a capa.");
  if (!data.title.trim()) push("error", "title", "Título obrigatório.");
  if (!data.documentNumber.trim()) push("error", "code", "Código/número do documento obrigatório.");

  const rawRevision = data.revision.trim();
  if (!rawRevision) {
    push("error", "revision", "Revisão obrigatória; confirme a LD ou informe manualmente.");
  } else if (window.TriagemCore?.revisionInfo) {
    try {
      const info = window.TriagemCore.revisionInfo(rawRevision);
      if (!info.valid) {
        push("warning", "revision-rule", `Revisão “${rawRevision}” possui formato inesperado para a regra documental vigente do GRCON. O valor original foi preservado para conferência.`);
      } else {
        push("info", "revision-valid", info.kind === "field"
          ? `Revisão de campo “${rawRevision}” reconhecida pelo motor documental do GRCON.`
          : `Revisão “${rawRevision}” reconhecida pelo motor documental do GRCON.`);
      }
    } catch (_) {
      push("warning", "revision-validator", "A regra documental de revisão não pôde ser executada; o valor original da LD foi preservado.");
    }
  } else {
    push("warning", "revision-validator", "Motor documental de revisão indisponível; o valor original da LD foi preservado.");
  }

  if (!data.revisionDate.trim()) push("error", "date", "Data da emissão/revisão obrigatória.");
  if (!data.revisionDescription.trim()) push("error", "revision-description", "Descrição da revisão obrigatória.");
  if (!data.categoryLabel.trim()) push("warning", "category", data.category.trim()
    ? `Categoria “${data.category}” não reconhecida pelo catálogo/motor documental do GRCON; confira antes de gerar.`
    : "Categoria documental não informada ou não reconhecida na LD.");
  if (!data.taxonomy.trim()) push("warning", "taxonomy", "Taxonomia Interna não informada na LD");
  if (!totalPages || totalPages < 2) push("error", "pages", "Total de folhas não pôde ser confirmado.");

  if (source?.kind === "docx" && source.pageCountSource === "metadata") {
    push("info", "docx-pages", "A contagem do DOCX vem do metadado de páginas salvo no Word. Confira o total se o documento tiver sido alterado depois do último salvamento.");
  }
  if (source?.kind === "docx") {
    push("info", "word-output", "A saída Word mantém a capa editável e integra a primeira página diretamente ao pacote OOXML do DOCX original, preservando o arquivo de origem.");
  }

  const triagemValidator = window.TriagemCore as (typeof window.TriagemCore & {
    validateDocumentCode?: (document: string, sheetName?: string) => {
      valid: boolean;
      family?: string;
      errors?: string[];
    };
  });
  if (data.documentNumber.trim() && triagemValidator?.validateDocumentCode) {
    try {
      const validation = triagemValidator.validateDocumentCode(data.documentNumber, selected?.sheet || "");
      if (!validation.valid) {
        (validation.errors || ["Código não passou pela validação documental."]).slice(0, 3).forEach((message: string, index: number) => {
          push("warning", `code-rule-${index}`, message);
        });
      } else {
        push("info", "code-valid", `Código conferido pelo validador ${validation.family || "documental"} do GRCON.`);
      }
    } catch (_) {
      push("warning", "code-validator", "O validador de codificação não pôde ser executado; o valor da LD foi preservado.");
    }
  }

  return messages;
}
