import type { PdfMergeItem } from "../types/domain";

// Ordenação sob comando explícito: não interfere na ordem de inclusão ou na ordem manual.
// O desempate por posição evita trocar PDFs com nomes equivalentes para o idioma.
const nameCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

export function sortPdfItemsNaturally(items: readonly PdfMergeItem[]): PdfMergeItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => nameCollator.compare(left.item.name, right.item.name) || left.index - right.index)
    .map(({ item }) => item);
}
