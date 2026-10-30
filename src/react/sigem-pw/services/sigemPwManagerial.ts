import type { SigemPwRecord, SigemPwState } from "../types/domain";

/**
 * Phase 1: one auditable document-level result for the executive UI and the
 * coordinator workbook. Values labelled "not available" are never guessed.
 */
export type ReviewOutcome = "favorable" | "remarks" | "rejected" | "pending" | "unknown" | "not-posted" | "other-revision";

export const MANAGERIAL_ACTIONS = Object.freeze({
  CHECK_CANCELLATION: "Conferir cancelamento nos sistemas",
  RESOLVE_REFERENCE_CONFLICT: "Resolver divergência entre referências",
  LOAD_SOURCES: "Atualizar bases para conciliação",
  CONFIRM_REFERENCE_REVISION: "Confirmar revisão na referência",
  WAIT_PREPARATION: "Aguardar etapa de cadastro",
  REGISTER_PW: "Cadastrar no PW",
  ISSUE_PW: "Emitir no PW",
  ALIGN_PW_REVISION: "Verificar revisão no PW",
  POST_SIGEM: "Postar no SIGEM",
  ALIGN_SIGEM_REVISION: "Conferir revisão postada no SIGEM",
  REVIEW_REJECTION: "Analisar recusa da fiscalização",
  ADDRESS_REMARKS: "Tratar comentários da fiscalização",
  WAIT_REVIEW: "Aguardar avaliação da Consulta Geral",
  CONFIRM_SIGEM_STATUS: "Conferir situação na Consulta Geral",
  NONE: "Sem ação necessária",
});

export type ManagerialActionCode = keyof typeof MANAGERIAL_ACTIONS;

export interface ManagerialDocument {
  code: string;
  title: string;
  referenceRevision: string;
  referenceStatus: string;
  sources: string[];
  conflict: boolean;
  pwRegistered: boolean;
  pwEmitted: boolean;
  pwNotApplicable: boolean;
  pwRevision: string;
  pwState: string;
  pwLastEmission: string;
  pwRevisions: string[];
  sigemPosted: boolean;
  sigemRevision: string;
  /** SIGEM status is shown only when evidence belongs to the reference revision. */
  sigemStatus: string;
  sigemReviewOutcome: ReviewOutcome;
  situation: "Em conformidade" | "Em preparação" | "Em andamento" | "Com pendência" | "Dados insuficientes" | "Cancelado";
  actionCode: ManagerialActionCode;
  action: string;
}
export interface ManagerialSummary {
  active: number | null;
  registered: number | null;
  emitted: number | null;
  posted: number | null;
  compliant: number | null;
  pending: number | null;
  cancelled: number;
  conflicts: number;
}
export interface ManagerialReport {
  ready: boolean;
  reason: string;
  rows: ManagerialDocument[];
  summary: ManagerialSummary;
  excludedSigem: number;
  excludedPw: number;
}

function norm(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function revision(record: SigemPwRecord): string {
  return String(record.revisionComplete || record.revision || "").trim();
}
function revisionKey(value: string): string {
  return norm(value).replace(/^REV(?:ISAO)?\s*\.?\s*/, "");
}
function status(record: SigemPwRecord): string {
  return String(record.status || record.sigemStatus || record.state || record.situation || "").trim();
}
function priorityRevision(value: string): number {
  const rev = revisionKey(value);
  if (rev === "0") return 0;
  if (/^[A-Z]+$/.test(rev)) return [...rev].reduce((score, char) => score * 26 + char.charCodeAt(0) - 64, 0);
  return -1;
}
function mostRecent(rows: SigemPwRecord[]): SigemPwRecord | undefined {
  return [...rows].sort((a, b) => priorityRevision(revision(b)) - priorityRevision(revision(a)))[0];
}
/** Use the same complete-document identity as the GRCON core when a base
 * (e.g. a shared historical LD) was persisted before documentKey enrichment.
 * Never collapse documents by prefix, title, EAP or partial code. */
export function managerialDocumentKey(record: SigemPwRecord): string {
  const existing = String(record.documentKey || "").trim();
  if (existing) return existing;
  const fullCode = String(record.canonicalDocument || record.document || "").trim();
  if (!fullCode) return "";
  const core = typeof window !== "undefined" ? window.GrconSigemPwDashboard : undefined;
  return core?.documentIdentity?.(fullCode).key || fullCode.toUpperCase();
}
function fromIndex(records: SigemPwRecord[]): Map<string, SigemPwRecord[]> {
  const index = new Map<string, SigemPwRecord[]>();
  for (const record of records) {
    const key = managerialDocumentKey(record);
    if (!key) continue;
    const existing = index.get(key) || [];
    existing.push(record);
    index.set(key, existing);
  }
  return index;
}
export function assessSigemReview(value: unknown): Exclude<ReviewOutcome, "not-posted" | "other-revision"> {
  const source = norm(value);
  if (/RECUSAD|REPROVAD/.test(source)) return "rejected";
  if (/COM COMENTAR|COM COMENTARIO|RESSALVA|CONDICIONAD/.test(source)) return "remarks";
  if (/EM ANALIS|EM WORKFLOW|AGUARD|PENDENTE|EM AVALIAC|EM TRAMIT/.test(source)) return "pending";
  if (/^(SEM COMENTAR|SEM COMENTARIO|APROVAD|ACEIT|LIBERAD)/.test(source)) return "favorable";
  return "unknown";
}
function statusTimestamp(record: SigemPwRecord): number | null {
  const data = record.modifiedAt || record.stateChangedAt || record.includedAt || record.createdAt;
  if (!data) return null;
  const date = data instanceof Date ? data.getTime() : Date.parse(String(data));
  return Number.isFinite(date) ? date : null;
}
function selectReviewEvidence(records: SigemPwRecord[]): SigemPwRecord | undefined {
  if (!records.length) return undefined;
  if (records.length === 1) return records[0];
  const dates = records.map(statusTimestamp);
  // If every same-revision observation has a valid timestamp, the latest
  // source event wins. Otherwise never guess which favorable status is newer.
  if (dates.every(date => date !== null)) {
    const latest = Math.max(...dates as number[]);
    const latestRows = records.filter((_, index) => dates[index] === latest);
    if (latestRows.length === 1) return latestRows[0];
    records = latestRows;
  }
  const risk: Record<ReturnType<typeof assessSigemReview>, number> = {
    rejected: 5, remarks: 4, pending: 3, unknown: 2, favorable: 1,
  };
  return [...records].sort((a, b) => risk[assessSigemReview(status(b))] - risk[assessSigemReview(status(a))])[0];
}
function isCv(reference: SigemPwRecord): boolean {
  if (norm(reference.documentClass) === "CV") return true;
  // Exact segment only; CVE or another prefix must never be classified as CV.
  return /(?:^|[-_])CV(?=[-_]|$)/.test(norm(reference.canonicalDocument || reference.document));
}

export function reconcileManagerial(state: SigemPwState): ManagerialReport {
  const referenceAvailable = Boolean(state.ld.meta && state.ld.records.length);
  const pwAvailable = Boolean(state.pw.meta && state.pw.meta.companyColumn === "C" && state.pw.meta.scopeCompanyColumnMissing !== true);
  const sigemAvailable = Boolean(state.sigem.meta);
  const ready = referenceAvailable && pwAvailable && sigemAvailable && Boolean(state.model);
  const reason = !referenceAvailable ? "Carregue referências documentais ativas para delimitar o controle."
    : !pwAvailable ? "Importe uma consulta PW com empresas identificadas na coluna C."
    : !sigemAvailable ? "Consulta Geral indisponível; postagem e conformidade são inconclusivas."
    : !state.model ? "A conciliação ainda não foi calculada." : "";
  const pwIndex = fromIndex(state.model?.normalizedPw || []);
  const sigemIndex = fromIndex(state.model?.normalizedSigem || []);
  const rows: ManagerialDocument[] = [];
  const summary: ManagerialSummary = {
    active: referenceAvailable ? 0 : null,
    registered: referenceAvailable && pwAvailable && state.model ? 0 : null,
    emitted: referenceAvailable && pwAvailable && state.model ? 0 : null,
    posted: referenceAvailable && sigemAvailable && state.model ? 0 : null,
    compliant: ready ? 0 : null,
    pending: ready ? 0 : null,
    cancelled: 0, conflicts: 0,
  };
  const processed = new Set<string>();

  for (const reference of state.ld.records) {
    const key = managerialDocumentKey(reference);
    if (!key || processed.has(key)) continue;
    processed.add(key);
    const referenceRevision = revisionKey(String(reference.revision || ""));
    const referenceStatus = String(reference.status || "");
    const cancelled = /CANCELAD/.test(norm(referenceStatus));
    const conflict = reference.referenceConflict === true;
    const pwNotApplicable = isCv(reference);
    const pw = pwIndex.get(key) || [];
    const sigem = sigemIndex.get(key) || [];
    const emittedRows = pw.filter(record => norm(record.lastEmission) === "SIM");
    const samePwRevision = referenceRevision
      ? emittedRows.find(record => revisionKey(revision(record)) === referenceRevision)
      : undefined;
    const pwCurrent = samePwRevision || mostRecent(emittedRows) || mostRecent(pw);
    const matchingSigem = referenceRevision
      ? sigem.filter(record => revisionKey(revision(record)) === referenceRevision)
      : [];
    const sigemAtReference = selectReviewEvidence(matchingSigem);
    const sigemCurrent = sigemAtReference || mostRecent(sigem);
    const registered = pw.length > 0;
    const emitted = emittedRows.length > 0;
    // Presence is posting evidence (even if refused), not proof of conformity.
    const posted = sigem.length > 0;
    const pwRevision = pwCurrent ? revision(pwCurrent) : "";
    const sigemRevision = sigemCurrent ? revision(sigemCurrent) : "";
    const sigemStatus = sigemAtReference ? status(sigemAtReference) : "";
    const sigemReviewOutcome: ReviewOutcome = !posted ? "not-posted"
      : !matchingSigem.length ? "other-revision"
      : assessSigemReview(sigemStatus);
    const revisionAligned = Boolean(referenceRevision && samePwRevision);
    const preparing = /EM EMISSAO|EM ELABORACAO|EM PREPARACAO/.test(norm(referenceStatus));
    let situation: ManagerialDocument["situation"];
    let actionCode: ManagerialActionCode;
    if (cancelled) { situation = "Cancelado"; actionCode = "CHECK_CANCELLATION"; summary.cancelled++; }
    else if (conflict) { situation = "Dados insuficientes"; actionCode = "RESOLVE_REFERENCE_CONFLICT"; summary.conflicts++; }
    else if (!ready) { situation = "Dados insuficientes"; actionCode = "LOAD_SOURCES"; }
    else if (!referenceRevision) { situation = "Dados insuficientes"; actionCode = "CONFIRM_REFERENCE_REVISION"; }
    else if (preparing && !registered && !posted) { situation = "Em preparação"; actionCode = "WAIT_PREPARATION"; }
    else if (!pwNotApplicable && !registered) { situation = "Com pendência"; actionCode = "REGISTER_PW"; }
    else if (!pwNotApplicable && !emitted) { situation = "Em andamento"; actionCode = "ISSUE_PW"; }
    else if (!pwNotApplicable && !revisionAligned) { situation = "Com pendência"; actionCode = "ALIGN_PW_REVISION"; }
    else if (!posted) { situation = "Com pendência"; actionCode = "POST_SIGEM"; }
    else if (!matchingSigem.length) { situation = "Com pendência"; actionCode = "ALIGN_SIGEM_REVISION"; }
    else if (sigemReviewOutcome === "rejected") { situation = "Com pendência"; actionCode = "REVIEW_REJECTION"; }
    else if (sigemReviewOutcome === "remarks") { situation = "Com pendência"; actionCode = "ADDRESS_REMARKS"; }
    else if (sigemReviewOutcome === "pending") { situation = "Em andamento"; actionCode = "WAIT_REVIEW"; }
    else if (sigemReviewOutcome !== "favorable") { situation = "Com pendência"; actionCode = "CONFIRM_SIGEM_STATUS"; }
    else { situation = "Em conformidade"; actionCode = "NONE"; }

    if (!cancelled) {
      if (summary.active !== null) summary.active++;
      if (summary.registered !== null && registered) summary.registered++;
      if (summary.emitted !== null && emitted) summary.emitted++;
      if (summary.posted !== null && posted) summary.posted++;
      if (ready) {
        if (situation === "Em conformidade") summary.compliant!++;
        if (situation === "Com pendência" || situation === "Em andamento") summary.pending!++;
      }
    }
    rows.push({
      code: String(reference.canonicalDocument || reference.document || key),
      title: String(reference.title || ""), referenceRevision, referenceStatus,
      sources: Array.isArray(reference.referenceSources) ? reference.referenceSources.map(String)
        : [String(state.ld.meta?.fileName || "")],
      conflict, pwRegistered: registered, pwEmitted: emitted, pwNotApplicable,
      pwRevision, pwState: pwCurrent ? status(pwCurrent) : "",
      pwLastEmission: pwCurrent ? String(pwCurrent.lastEmission || "") : "",
      pwRevisions: [...new Set(pw.map(revision).filter(Boolean))],
      sigemPosted: posted, sigemRevision, sigemStatus, sigemReviewOutcome,
      situation, actionCode, action: MANAGERIAL_ACTIONS[actionCode],
    });
  }
  return {
    ready, reason, rows, summary,
    excludedSigem: state.result?.lists?.sigemN1710OutsideLd?.length || 0,
    excludedPw: state.result?.lists?.pwN1710OutsideLd?.length || 0,
  };
}
