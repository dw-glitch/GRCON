import type { SigemPwBase, SigemPwRecord } from "../types/domain";

/**
 * Fase 4: recuperar a relação PW original por posição (colunas A, B, C...).
 *
 * Nunca converter cabeçalhos em chaves: a exportação pode ter nomes repetidos,
 * vazios ou atributos adicionais. O motor de KPIs usa apenas registros
 * normalizados; esta leitura existe para auditoria e o Excel da Fase 5.
 */
export interface PwOriginalMatrix {
  headers: string[];
  rows: string[][];
  sourceRows: number[];
  originalColumnCount: number;
  excludedInvalidRows: number;
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

export function getPwOriginalMatrix(base: SigemPwBase): PwOriginalMatrix {
  const headers = base.meta?.pwRawHeaders;
  if (!Array.isArray(headers) || !headers.length) {
    throw new Error("Esta versão PW não contém os cabeçalhos originais. Reimporte o CSV para habilitar a rastreabilidade integral.");
  }
  const source = Array.isArray(base.sourceRecords) ? base.sourceRecords : base.records;
  if (!Array.isArray(source)) {
    throw new Error("Registros de origem PW indisponíveis. A base não pode ser reconstruída a partir dos indicadores.");
  }
  const rows = source.map((record: SigemPwRecord) => {
    if (!Array.isArray(record.pwRawCells)) {
      throw new Error("A versão PW possui registros sem colunas originais. Reimporte o CSV antes de exportar.");
    }
    return record.pwRawCells.map(text);
  });
  const declaredWidth = Number(base.meta?.pwRawColumnCount) || headers.length;
  const width = rows.reduce((max, row) => Math.max(max, row.length), Math.max(headers.length, declaredWidth));
  return {
    headers: [...headers.map(text), ...Array(Math.max(0, width - headers.length)).fill("")],
    rows: rows.map(row => [...row, ...Array(Math.max(0, width - row.length)).fill("")]),
    sourceRows: source.map(row => Number(row.sourceRow) || 0),
    originalColumnCount: width,
    excludedInvalidRows: Number(base.meta?.pwRawInvalidRowCount) || 0,
  };
}
