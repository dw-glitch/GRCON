import type { SigemPwRecord, SigemPwState } from "../types/domain";

export interface ManagerialDocument {
  code: string;
  title: string;
  referenceRevision: string;
  referenceStatus: string;
  sources: string[];
  conflict: boolean;
  pwRegistered: boolean;
  pwEmitted: boolean;
  pwRevision: string;
  pwState: string;
  pwLastEmission: string;
  pwRevisions: string[];
  sigemPosted: boolean;
  sigemRevision: string;
  sigemStatus: string;
  situation: "Em conformidade" | "Em preparação" | "Em andamento" | "Com pendência" | "Dados insuficientes" | "Cancelado";
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
function status(record: SigemPwRecord): string {
  return String(record.status || record.state || record.situation || record.sigemStatus || "").trim();
}
function priorityRevision(value: string): number {
  const rev = norm(value).replace(/^REV(?:ISAO)?\.?/, "");
  if (rev === "0") return 0;
  if (/^[A-Z]+$/.test(rev)) return [...rev].reduce((score, char) => score * 26 + char.charCodeAt(0) - 64, 0);
  return -1;
}
function mostRecent(rows: SigemPwRecord[]): SigemPwRecord | undefined {
  return [...rows].sort((a, b) => priorityRevision(revision(b)) - priorityRevision(revision(a)))[0];
}
function fromIndex(records: SigemPwRecord[]): Map<string, SigemPwRecord[]> {
  const index = new Map<string, SigemPwRecord[]>();
  for (const record of records) {
    const key = String(record.documentKey || "");
    if (!key) continue;
    const existing = index.get(key) || [];
    existing.push(record);
    index.set(key, existing);
  }
  return index;
}
function isRejected(record: SigemPwRecord): boolean {
  return /RECUSAD|REPROVAD/.test(norm(status(record)));
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
    pending: ready ? 0 : null, cancelled: 0, conflicts: 0,
  };

  for (const reference of state.ld.records) {
    const key = String(reference.documentKey || "");
    if (!key) continue;
    const referenceRevision = String(reference.revision || "").trim();
    const referenceStatus = String(reference.status || "").trim();
    const cancelled = /CANCELAD/.test(norm(referenceStatus));
    const conflict = reference.referenceConflict === true;
    const pw = pwIndex.get(key) || [];
    const sigem = sigemIndex.get(key) || [];
    const emittedRows = pw.filter(record => norm(record.lastEmission) === "SIM");
    const pwCurrent = mostRecent(emittedRows) || mostRecent(pw);
    const sigemCurrent = mostRecent(sigem);
    const registered = pw.length > 0;
    const emitted = emittedRows.length > 0;
    // A record in the authoritative Consulta Geral is posting evidence, even if refused.
    const posted = sigem.length > 0;
    const pwRevision = pwCurrent ? revision(pwCurrent) : "";
    const sigemRevision = sigemCurrent ? revision(sigemCurrent) : "";
    const revisionAligned = Boolean(referenceRevision && emittedRows.some(record => revision(record) === referenceRevision));
    const sigemAligned = Boolean(referenceRevision && sigem.some(record =>
      revision(record) === referenceRevision));
    const rejected = sigem.some(record => isRejected(record) && revision(record) === referenceRevision);
    const preparing = /EM EMISSAO|EM ELABORACAO|EM PREPARACAO/.test(norm(referenceStatus));
    let situation: ManagerialDocument["situation"];
    let action: string;
    if (cancelled) { situation = "Cancelado"; action = "Conferir cancelamento nos sistemas"; summary.cancelled++; }
    else if (conflict) { situation = "Dados insuficientes"; action = "Resolver divergência entre referências"; summary.conflicts++; }
    else if (!ready) { situation = "Dados insuficientes"; action = "Atualizar bases para conciliação"; }
    else if (preparing && !registered) { situation = "Em preparação"; action = "Aguardar etapa de cadastro"; }
    else if (!registered) { situation = "Com pendência"; action = "Cadastrar no PW"; }
    else if (!emitted) { situation = "Em andamento"; action = "Emitir no PW"; }
    else if (!revisionAligned) { situation = "Com pendência"; action = "Atualizar revisão no PW"; }
    else if (!posted) { situation = "Com pendência"; action = "Postar no SIGEM"; }
    else if (!sigemAligned) { situation = "Com pendência"; action = "Conferir revisão postada no SIGEM"; }
    else if (rejected) { situation = "Com pendência"; action = "Analisar recusa da fiscalização"; }
    else { situation = "Em conformidade"; action = "Sem ação necessária"; }

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
      title: String(reference.title || ""),
      referenceRevision,
      referenceStatus,
      sources: Array.isArray(reference.referenceSources) ? reference.referenceSources.map(String)
        : [String(state.ld.meta?.fileName || "")],
      conflict, pwRegistered: registered, pwEmitted: emitted,
      pwRevision, pwState: pwCurrent ? status(pwCurrent) : "",
      pwLastEmission: pwCurrent ? String(pwCurrent.lastEmission || "") : "",
      pwRevisions: [...new Set(pw.map(revision).filter(Boolean))],
      sigemPosted: posted,
      sigemRevision, sigemStatus: sigemCurrent ? status(sigemCurrent) : "",
      situation, action,
    });
  }
  return {
    ready, reason, rows, summary,
    excludedSigem: state.result?.lists?.sigemN1710OutsideLd?.length || 0,
    excludedPw: state.result?.lists?.pwN1710OutsideLd?.length || 0,
  };
}
