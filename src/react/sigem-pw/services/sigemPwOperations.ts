import type { SigemPwRecord, SigemPwState } from "../types/domain";
import { managerialDocumentKey } from "./sigemPwManagerial";

export const PW_ACTIONS = ["Cadastrar no PW", "Emitir no PW", "Concluído"] as const;
export type PwAction = typeof PW_ACTIONS[number];
export type PwIndicator = "all" | "sigem" | "registerSigem" | "registerAbsent" | "registered" | "issue" | "issued";
export interface PwFilters {
  query?: string; documentClass?: string; action?: string; sigem?: string;
  revisionScope?: "all" | "revision0"; indicator?: PwIndicator;
  /** Aba por revisão (0, A, B…): "" = todas. Só recorta as linhas; não muda nenhuma regra de contagem. */
  revision?: string;
}
export interface PwOperation {
  key: string; documentKey: string; code: string; title: string; revision: string;
  documentClass: string; referenceStatus: string; sources: string[]; action: PwAction;
  inSigem: boolean; sigemSituation: string; sigemStatus: string;
  pwRegistered: boolean; pwEmitted: boolean; pwEvidence?: SigemPwRecord;
  /**
   * Revisões anteriores (0, A, B…) ainda não emitidas no PW quando ESTA revisão já foi emitida (ex.: B emitida com A pendente).
   * Vazio = em sequência. Só informa; não altera nenhuma contagem.
   */
  missingBefore: string[];
}
export interface PwTotals {
  sigem: number; registerSigem: number; registerAbsent: number;
  /**
   * Revisões 0 com cadastro comprovado no PW (CSG/QTM). Só a revisão 0 é cadastro; da revisão A em diante cada revisão é uma
   * emissão (ver "A emitir" e "Emitidas"). Vale: Cadastradas = revisões 0 que estão a emitir + revisões 0 já emitidas.
   */
  registered: number; issue: number; issued: number;
}
export interface PwDiagnostic {
  source: string; code: string; revision: string; reason: string; sourceRow: string;
}
export interface PwOperationsReport {
  ready: boolean; reason: string; rows: PwOperation[]; totals: PwTotals;
  byClass: Array<PwTotals & { documentClass: string }>;
  diagnostics: PwDiagnostic[]; outside: PwDiagnostic[];
  reconciliation: {
    records: number; documents: number; pairs: number; inScopePairs: number;
    outsidePairs: number; duplicates: number; invalid: number; omitted: number | null;
    /** Mesma conferência restrita à revisão 0 (acompanha o filtro "Somente revisão 0"). */
    revision0: { pairs: number; inScopePairs: number; outsidePairs: number };
  };
}
const text = (value: unknown) => String(value ?? "").trim();
const norm = (value: unknown) => text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
function core() { return typeof window === "undefined" ? undefined : window.GrconSigemPwDashboard; }
/** All document identities go through the existing central GRCON normalizer. */
export function operationDocumentKey(row: SigemPwRecord): string {
  const code = text(row.canonicalDocument || row.document);
  return (code && core()?.documentIdentity(code).key) || managerialDocumentKey(row);
}
export function operationRevision(value: unknown): string {
  const key = core()?.revisionKey(value) || norm(value).replace(/^REV(?:ISAO)?\.?\s*/, "").replace(/\s+/g, "");
  return /^(?:__SEM_REVISAO__|SEMREVISAO|NAOINFORMAD[AO]|NA|N\/A|-)$/.test(key) ? "" : key;
}
const revisionOf = (row: SigemPwRecord) => operationRevision(row.revisionComplete || row.revision);
const codeOf = (row: SigemPwRecord) => text(row.canonicalDocument || row.document || row.documentKey);
function emittedEvidence(row: SigemPwRecord): boolean {
  // Última emissão describes current versus historical issuance, not a yes/no issued flag.
  const flags = core()?.EMISSION_FLAGS || { CURRENT: "SIM", HISTORICAL: "NAO" };
  return [flags.CURRENT, flags.HISTORICAL].includes(norm(row.lastEmission));
}
const pair = (key: string, rev: string) => JSON.stringify([key, rev]);
/** 0 → 0, A → 1, B → 2… Outras grafias (#1, AA…) não têm ordem conhecida e não são preenchidas. */
function sequenceRank(rev: string): number | null {
  if (rev === "0") return 0;
  return /^[A-Z]$/.test(rev) ? rev.charCodeAt(0) - 64 : null;
}
/** Se a revisão exigida é B, o PW precisa emitir 0, A e depois B: completa a sequência até a maior revisão exigida. */
function fillRevisionSequence(required: Set<string>): void {
  let highest = 0;
  for (const rev of required) { const rank = sequenceRank(rev); if (rank !== null && rank > highest) highest = rank; }
  if (highest === 0) return;
  required.add("0");
  for (let rank = 1; rank <= highest; rank++) required.add(String.fromCharCode(64 + rank));
}
/** Emissão fora de ordem: uma revisão emitida enquanto outra, anterior e de ordem conhecida, ainda não foi emitida. */
function markOutOfSequence(rows: PwOperation[], documentKey: string): void {
  const own = rows.filter(row => row.documentKey === documentKey);
  for (const row of own) {
    const rank = sequenceRank(row.revision);
    if (!row.pwEmitted || rank === null) continue;
    row.missingBefore = own
      .filter(other => { const otherRank = sequenceRank(other.revision); return otherRank !== null && otherRank < rank && !other.pwEmitted; })
      .sort((a, b) => (sequenceRank(a.revision) as number) - (sequenceRank(b.revision) as number))
      .map(other => other.revision);
  }
}
const totals = (): PwTotals => ({ sigem: 0, registerSigem: 0, registerAbsent: 0, registered: 0, issue: 0, issued: 0 });
export const PW_INDICATORS: Array<{ key: Exclude<PwIndicator, "all">; label: string }> = [
  { key: "sigem", label: "Constam no SIGEM" },
  { key: "registerSigem", label: "A cadastrar no PW — já constam no SIGEM" },
  { key: "registerAbsent", label: "A cadastrar no PW — não constam no SIGEM" },
  { key: "registered", label: "Cadastradas no PW" },
  { key: "issue", label: "A emitir no PW" },
  { key: "issued", label: "Emitidas no PW" },
];
function count(target: PwTotals, row: PwOperation) {
  if (row.inSigem) target.sigem++;
  if (row.action === "Cadastrar no PW") target[row.inSigem ? "registerSigem" : "registerAbsent"]++;
  if (row.pwRegistered) target.registered++;
  if (row.action === "Emitir no PW") target.issue++;
  if (row.action === "Concluído") target.issued++;
}
function matches(row: PwOperation, filters: PwFilters): boolean {
  if (filters.revisionScope === "revision0" && row.revision !== "0") return false;
  if (filters.revision && row.revision !== filters.revision) return false;
  if (filters.documentClass && row.documentClass !== filters.documentClass) return false;
  if (filters.action && row.action !== filters.action) return false;
  if (filters.sigem && row.sigemSituation !== filters.sigem) return false;
  const i = filters.indicator;
  if (i === "sigem" && !row.inSigem) return false;
  if (i === "registerSigem" && !(row.inSigem && row.action === "Cadastrar no PW")) return false;
  if (i === "registerAbsent" && !(!row.inSigem && row.action === "Cadastrar no PW")) return false;
  if (i === "registered" && !row.pwRegistered) return false;
  if (i === "issue" && row.action !== "Emitir no PW") return false;
  if (i === "issued" && row.action !== "Concluído") return false;
  const needle = norm(filters.query);
  return !needle || norm([row.code, row.title, row.revision, ...row.sources].join(" ")).includes(needle);
}
/** Filter, total and export always use this same projection, never a second calculation. */
export function filterPwOperations(report: PwOperationsReport, filters: PwFilters = {}): PwOperationsReport {
  const rows = report.rows.filter(row => matches(row, filters));
  const total = totals();
  const classes = new Map<string, PwTotals & { documentClass: string }>();
  for (const row of rows) {
    count(total, row);
    const entry = classes.get(row.documentClass) || { documentClass: row.documentClass, ...totals() };
    count(entry, row); classes.set(row.documentClass, entry);
  }
  return { ...report, rows, totals: total, byClass: [...classes.values()].sort((a, b) => a.documentClass.localeCompare(b.documentClass, "pt-BR")) };
}

/** Entradas que o motor lê; a Evolução monta o mesmo formato a partir de duas bases salvas. */
export type PwOperationsInput = Pick<SigemPwState, "ld" | "sigem" | "pw" | "model" | "analysisError">;
/** Cached by the immutable base/model identities; searching never rebuilds the base indexes. */
let cached: { ld: SigemPwState["ld"]; pw: SigemPwState["pw"]; sigem: SigemPwState["sigem"]; model: SigemPwState["model"]; error: string; report: PwOperationsReport } | undefined;
export function reconcilePwOperations(state: SigemPwState): PwOperationsReport {
  const error = text(state.analysisError);
  if (cached && cached.ld === state.ld && cached.pw === state.pw && cached.sigem === state.sigem && cached.model === state.model && cached.error === error) return cached.report;
  const result = computePwOperations(state);
  cached = { ld: state.ld, pw: state.pw, sigem: state.sigem, model: state.model, error, report: result };
  return result;
}
/** Mesma regra do painel gerencial, sem cache: a Evolução a aplica à base anterior e à atual. */
export function computePwOperations(state: PwOperationsInput): PwOperationsReport {
  const error = text(state.analysisError);
  const reason = error || (!state.ld.meta || !state.ld.records.length ? "Carregue as referências documentais ativas."
    : !state.sigem.meta ? "Carregue a Consulta Geral."
    : !state.pw.meta || state.pw.meta.companyColumn !== "C" || state.pw.meta.scopeCompanyColumnMissing === true ? "Reimporte o PW com as empresas identificadas na coluna C."
    : !state.model ? "Aguarde a comparação das bases." : "");
  const report: PwOperationsReport = {
    ready: !reason, reason, rows: [], totals: totals(), byClass: [], diagnostics: [], outside: [],
    reconciliation: { records: state.sigem.records.length, documents: 0, pairs: 0, inScopePairs: 0, outsidePairs: 0, duplicates: 0, invalid: 0, omitted: null, revision0: { pairs: 0, inScopePairs: 0, outsidePairs: 0 } },
  };
  const refs = new Map<string, SigemPwRecord[]>();
  const sigem = new Map<string, Map<string, SigemPwRecord[]>>();
  const pw = new Map<string, SigemPwRecord[]>();
  const diagnostic = (source: string, row: SigemPwRecord, reason: string) => ({ source, code: codeOf(row), revision: revisionOf(row), reason, sourceRow: text(row.sourceRow) });
  for (const row of state.ld.records) {
    const key = operationDocumentKey(row);
    if (!key) { report.diagnostics.push(diagnostic("LD", row, "Código ausente")); continue; }
    const group = refs.get(key) || []; group.push(row); refs.set(key, group);
  }
  const rawDocuments = new Set<string>();
  const unknownSigemRevisions = new Set<string>();
  const seenPairs = new Set<string>();
  for (const row of state.sigem.records) {
    const key = operationDocumentKey(row); const rev = revisionOf(row);
    if (key) rawDocuments.add(key);
    if (!key || !rev) {
      if (key && !rev) unknownSigemRevisions.add(key);
      report.reconciliation.invalid++;
      report.diagnostics.push(diagnostic("SIGEM", row, "Código ou revisão não identificado; presença não determina a revisão a emitir"));
      continue;
    }
    const id = pair(key, rev);
    if (seenPairs.has(id)) {
      report.reconciliation.duplicates++;
      report.diagnostics.push(diagnostic("SIGEM", row, "Mesma revisão do mesmo documento repetida (conta uma vez)"));
    } else {
      seenPairs.add(id);
      const inRefs = refs.has(key);
      if (inRefs) report.reconciliation.inScopePairs++; else report.reconciliation.outsidePairs++;
      if (rev === "0") {
        report.reconciliation.revision0.pairs++;
        if (inRefs) report.reconciliation.revision0.inScopePairs++; else report.reconciliation.revision0.outsidePairs++;
      }
    }
    if (!refs.has(key)) { report.outside.push(diagnostic("SIGEM", row, "Não consta nas LDs ativas")); continue; }
    const revisions = sigem.get(key) || new Map<string, SigemPwRecord[]>();
    const entries = revisions.get(rev) || []; entries.push(row); revisions.set(rev, entries); sigem.set(key, revisions);
  }
  report.reconciliation.documents = rawDocuments.size;
  report.reconciliation.pairs = seenPairs.size;
  if (report.ready && (!refs.size || (state.sigem.records.length > 0 && !seenPairs.size))) {
    report.ready = false;
    report.reason = !refs.size ? "As referências não contêm códigos interpretáveis. Reimporte as bases."
      : "A Consulta Geral contém registros, mas nenhuma revisão de documento interpretável. Reimporte a base.";
  }
  const originalRows = Number(state.sigem.meta?.sourceRowCount);
  if (Number.isFinite(originalRows) && originalRows >= state.sigem.records.length) report.reconciliation.omitted = originalRows - state.sigem.records.length;
  // Raw PW remains intact for audit, but only CSG/QTM proves operational registration/emission.
  for (const original of state.pw.sourceRecords?.length ? state.pw.sourceRecords : state.model?.normalizedPw || state.pw.records) {
    const row = original.company == null && original.pwRawCells ? { ...original, company: original.pwRawCells[2] } : original;
    if (row.pwRawInvalid || !/(?:^|[\s,;/|+&])(?:CSG|QTM)(?=$|[\s,;/|+&])/i.test(text(row.company))) continue;
    const key = operationDocumentKey(row);
    if (!key) { report.diagnostics.push(diagnostic("PW", row, "Código ausente")); continue; }
    if (!refs.has(key)) { report.outside.push(diagnostic("PW", row, "Não consta nas LDs ativas")); continue; }
    const group = pw.get(key) || []; group.push(row); pw.set(key, group);
  }
  if (!report.ready) return report;
  for (const [key, references] of refs) {
    const reference = references[0];
    const documentClass = text(reference.sheetName || reference.documentClass) || "Sem classe";
    if (references.some(row => row.referenceConflict === true) || new Set(references.map(row => norm(row.status)).filter(Boolean)).size > 1) {
      report.diagnostics.push(diagnostic("LD", reference, "Referências divergentes; corrigir na origem antes de classificar")); continue;
    }
    if (/CANCELAD/.test(norm(reference.status))) { report.diagnostics.push(diagnostic("LD", reference, "Cancelado: fora das pendências operacionais")); continue; }
    if (norm(reference.documentClass) === "CV" || /(?:^|[-_])CV(?=[-_]|$)/.test(norm(codeOf(reference)))) {
      report.diagnostics.push(diagnostic("LD", reference, "CV: PW não aplicável")); continue;
    }
    const required = new Set(references.map(revisionOf).filter(Boolean));
    for (const rev of sigem.get(key)?.keys() || []) required.add(rev);
    fillRevisionSequence(required);
    if (!required.size) { report.diagnostics.push(diagnostic("LD", reference, "Revisão requerida não identificada")); continue; }
    const sources = [...new Set(references.flatMap(row => Array.isArray(row.referenceSources) ? row.referenceSources.map(text) : [text(row.referenceSourceName || state.ld.meta?.fileName)]).filter(Boolean))];
    if (sources.length > 1 || references.length > 1) report.diagnostics.push(diagnostic("LD", reference, "Referências consolidadas sem duplicar pendências: " + sources.join(", ")));
    const seenPw = new Set<string>();
    for (const entry of pw.get(key) || []) {
      const rev = revisionOf(entry);
      if (seenPw.has(rev)) report.diagnostics.push(diagnostic("PW", entry, "Mesma revisão do mesmo documento repetida no PW; evidência preservada na relação PW original"));
      seenPw.add(rev);
    }
    for (const rev of required) {
      // A SIGEM line with unknown revision cannot prove absence for another revision.
      const entries = sigem.get(key)?.get(rev) || [];
      if (unknownSigemRevisions.has(key) && !entries.length) { report.diagnostics.push({ ...diagnostic("SIGEM", reference, "Presença sem revisão: situação inconclusiva"), revision: rev }); continue; }
      const same = (pw.get(key) || []).filter(row => revisionOf(row) === rev);
      const unspecified = (pw.get(key) || []).filter(row => !revisionOf(row));
      // Só a revisão 0 é cadastro (Previsto sem revisão comprova o cadastro do código, nunca a emissão de uma revisão presumida).
      // Da revisão A em diante não existe "cadastrar": a revisão ou foi emitida ou está a emitir.
      const isCadastro = rev === "0";
      const evidence = same.find(row => norm(row.lastEmission) === (core()?.EMISSION_FLAGS.CURRENT || "SIM"))
        || same.find(emittedEvidence) || same[0] || (isCadastro ? unspecified[0] : undefined);
      const registered = isCadastro && Boolean(evidence);
      const emitted = same.some(emittedEvidence);
      const inSigem = entries.length > 0;
      report.rows.push({ key: pair(key, rev), documentKey: key, code: codeOf(reference), title: text(reference.title), revision: rev,
        documentClass, referenceStatus: text(reference.status), sources, action: isCadastro && !registered ? "Cadastrar no PW" : emitted ? "Concluído" : "Emitir no PW",
        inSigem, sigemSituation: inSigem ? "Consta no SIGEM" : "Não consta na Consulta Geral",
        sigemStatus: [...new Set(entries.map(row => text(row.status || row.sigemStatus)).filter(Boolean))].join("; "),
        pwRegistered: registered, pwEmitted: emitted, pwEvidence: evidence, missingBefore: [] });
    }
    markOutOfSequence(report.rows, key);
  }
  report.rows.sort((a, b) => a.code.localeCompare(b.code, "pt-BR") || a.revision.localeCompare(b.revision, "pt-BR", { numeric: true }));
  return filterPwOperations(report);
}
