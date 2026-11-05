import type { SigemPwBase, SigemPwRecord } from "../../types/domain";
import {
  computePwOperations,
  filterPwOperations,
  type PwOperation,
  type PwOperationsReport,
} from "../../services/sigemPwOperations";
import type {
  EvolutionOperationsMovement,
  EvolutionOperationsPoint,
  EvolutionOperationsView,
  EvolutionRecord,
  EvolutionRevisionScope,
  EvolutionSnapshot,
} from "../types/domain";

/**
 * A Evolução mostra, para duas bases salvas, os MESMOS seis indicadores do painel gerencial
 * (Constam no SIGEM, A cadastrar, Cadastradas, A emitir, Emitidas). Nada é recalculado
 * aqui: as bases salvas viram a entrada do motor operacional (`computePwOperations`) e o escopo de
 * revisão usa o mesmo filtro (`filterPwOperations`). Assim os números batem com a visão gerencial
 * quando as bases são as mesmas.
 */

const EMPTY_VIEW = (reason: string, scope: EvolutionRevisionScope): EvolutionOperationsView => ({
  ready: false, reason, scope, current: null, previous: null, movement: null, previousUsed: { sigem: false, pw: false },
});

function sigemRecords(snapshot: EvolutionSnapshot): SigemPwRecord[] {
  // Linhas sem revisão identificada ficam em "rejeitadas"; o motor precisa delas para marcar a situação como inconclusiva.
  const withoutRevision = (snapshot.rejected || []).filter((row: EvolutionRecord) => row.document && !String(row.revision || "").trim());
  return [...snapshot.records, ...withoutRevision] as unknown as SigemPwRecord[];
}

function inputFor(ld: SigemPwBase, sigem: EvolutionSnapshot, pw: EvolutionSnapshot) {
  const sigemList = sigemRecords(sigem);
  const pwList = pw.records as unknown as SigemPwRecord[];
  return {
    ld,
    sigem: { meta: { fileName: sigem.fileName, kind: "sigem" as const }, records: sigemList },
    // A Evolução só guarda registros PW com sigla de empresa lida na coluna C; o motor volta a conferir CSG/QTM.
    pw: { meta: { fileName: pw.fileName, kind: "pw" as const, companyColumn: "C" }, records: pwList, sourceRecords: pwList },
    model: {} as never,
    analysisError: "",
  };
}

function point(report: PwOperationsReport): EvolutionOperationsPoint {
  return { ...report.totals, revisions: report.rows.length };
}

function indexRows(rows: PwOperation[]): Map<string, PwOperation> {
  return new Map(rows.map((row) => [row.key, row]));
}

function movementBetween(previous: PwOperation[], current: PwOperation[]): EvolutionOperationsMovement {
  const before = indexRows(previous);
  const after = indexRows(current);
  const move: EvolutionOperationsMovement = { newInSigem: 0, leftSigem: 0, newlyRegistered: 0, newlyIssued: 0 };
  for (const row of current) {
    const old = before.get(row.key);
    if (row.inSigem && !old?.inSigem) move.newInSigem++;
    if (row.pwRegistered && !old?.pwRegistered) move.newlyRegistered++;
    if (row.pwEmitted && !old?.pwEmitted) move.newlyIssued++;
  }
  for (const row of previous) if (row.inSigem && !after.get(row.key)?.inSigem) move.leftSigem++;
  return move;
}

export interface EvolutionOperationsSources {
  ld: SigemPwBase | undefined;
  scope: EvolutionRevisionScope;
  sigemCurrent: EvolutionSnapshot | null;
  pwCurrent: EvolutionSnapshot | null;
  sigemPrevious: EvolutionSnapshot | null;
  pwPrevious: EvolutionSnapshot | null;
}

/** Entrada: bases SEM filtro de revisão (o escopo é aplicado depois pelo mesmo filtro do painel gerencial). */
export function buildEvolutionOperations(source: EvolutionOperationsSources): EvolutionOperationsView {
  const { ld, scope, sigemCurrent, pwCurrent, sigemPrevious, pwPrevious } = source;
  if (!ld?.meta || !ld.records.length) return EMPTY_VIEW("Carregue as referências documentais ativas (LD) para ver cadastro e emissão por revisão de documento.", scope);
  if (!sigemCurrent || !pwCurrent) return EMPTY_VIEW("Selecione uma base SIGEM e uma base PW atuais.", scope);
  const filters = { revisionScope: scope } as const;
  const currentReport = computePwOperations(inputFor(ld, sigemCurrent, pwCurrent));
  if (!currentReport.ready) return EMPTY_VIEW(currentReport.reason || "Comparação incompleta.", scope);
  const current = filterPwOperations(currentReport, filters);
  const previousUsed = { sigem: Boolean(sigemPrevious), pw: Boolean(pwPrevious) };
  if (!previousUsed.sigem && !previousUsed.pw) {
    return { ready: true, reason: "", scope, current: point(current), previous: null, movement: null, previousUsed };
  }
  const previousReport = computePwOperations(inputFor(ld, sigemPrevious || sigemCurrent, pwPrevious || pwCurrent));
  if (!previousReport.ready) {
    return { ready: true, reason: "", scope, current: point(current), previous: null, movement: null, previousUsed };
  }
  const previous = filterPwOperations(previousReport, filters);
  return { ready: true, reason: "", scope, current: point(current), previous: point(previous), movement: movementBetween(previous.rows, current.rows), previousUsed };
}
