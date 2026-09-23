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
  const coverCore = (window as unknown as {
    TriagemCore?: {
      revisionInfo?: (value: unknown) => { valid: boolean };
      EGRDT_OPTIONS?: { documentTypes?: string[] };
    };
  }).TriagemCore;
  if (!data.revision.trim()) {
    push("error", "revision", "Revisão obrigatória; confirme a revisão carregada da LD ou informe manualmente.");
  } else if (coverCore?.revisionInfo && !coverCore.revisionInfo(data.revision).valid) {
    push("error", "revision-rule", "Revisão fora da regra oficial do GRCON.");
  }
  if (!data.revisionDate.trim()) push("error", "date", "A data atual da emissão não pôde ser definida.");
  if (!data.revisionDescription.trim()) push("error", "revision-description", "Descrição da revisão obrigatória.");
  if (!data.categoryLabel.trim()) push("warning", "category", "Categoria documental não foi mapeada para uma descrição; confira antes de gerar.");
  const officialTypes = coverCore?.EGRDT_OPTIONS?.documentTypes || [];
  if (data.category.trim() && officialTypes.length && !officialTypes.includes(data.category.trim().toUpperCase())) {
    push("error", "category-rule", "Categoria documental fora do catálogo oficial do GRCON.");
  }
  if (!data.taxonomy.trim()) {
    push("error", "taxonomy", "Taxonomia não encontrada na coluna TAXONOMIA da linha selecionada da LD.");
  }
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
