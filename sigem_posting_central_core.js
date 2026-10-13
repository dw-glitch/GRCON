(function (root, factory) {
  "use strict";
  const Conference = root.GrconPostingConference || (typeof require === "function" ? require("./posting_conference_core.js") : null);
  const History = root.GrconHistory || (typeof require === "function" ? require("./history_core.js") : null);
  const api = factory(Conference, History);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconSigemCentralCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Conference, History) {
  "use strict";
  if (!Conference) return null;
  const text = Conference.text, norm = Conference.norm;
  const revision = Conference.normalizeRevision, identity = Conference.documentIdentity;
  const STATUSES = Conference.STATUSES;
  const COLUMNS = Object.freeze([
    ["document","Documento"],["title","Título"],["revisionSent","Revisão enviada"],
    ["revisionFound","Revisão SIGEM"],["statusLabel","Conferência"],
    ["sigemStatus","Status SIGEM"],["egrdtNumber","Última eGRDT"],
    ["generatedAt","Data da geração"],["sendCount","Ocorrências"],
    ["revisionCount","Revisões"],["purpose","Propósito"],["allocation","Alocação"],
    ["discipline","Disciplina"],["note","Diagnóstico"]
  ]);
  function historyExtras(records) {
    const lookup = new Map();
    for (const record of records || []) for (const file of record.files || []) {
      if (!text(file.document)) continue;
      const key = norm(record.egrdtNumber)+"|"+identity(file.document)+"|"+revision(file.grdtRevision||file.revision);
      if (!lookup.has(key)) lookup.set(key,{
        purpose:text(file.purpose),allocation:text(file.allocation),
        allocationStatus:text(file.allocationStatus),discipline:text(file.discipline),
        fiscalComment:text(file.fiscalComment),vaultFileId:text(file.vaultFileId)
      });
    }
    return lookup;
  }
  function enrich(rows, records) {
    const lookup = historyExtras(records);
    return rows.map(row => ({
      ...row, ...(lookup.get(norm(row.egrdtNumber)+"|"+identity(row.document)+"|"+revision(row.revisionSent))||{}),
      purpose:row.purpose, // origem por ocorrência, nunca sobrescrever por índice aproximado
      statusLabel:Conference.statusLabel(row.status),
      sendEvidenceLabel:"Geração registrada; envio não comprovado"
    }));
  }
  function latest(rows) {
    return rows.slice().sort((a,b)=>text(b.generatedAt).localeCompare(text(a.generatedAt)) ||
      Conference.revisionRank(b.revisionSent)-Conference.revisionRank(a.revisionSent))[0];
  }
  function baseOnly(records, covered) {
    const groups = new Map();
    for (const row of records || []) {
      if (!text(row.document)) continue;
      const id=identity(row.document);
      if (covered.has(id)) continue;
      if (!groups.has(id)) groups.set(id,[]);
      groups.get(id).push(row);
    }
    return [...groups.entries()].map(([id,found])=>{
      const first=found.slice().sort((a,b)=>
        Conference.effectiveRecordTimestamp(b)-Conference.effectiveRecordTimestamp(a))[0];
      const same=found.filter(r=>revision(r.revision)===revision(first.revision) &&
        Conference.effectiveRecordTimestamp(r)===Conference.effectiveRecordTimestamp(first));
      const conflict=new Set(same.map(r=>norm(r.status))).size>1;
      return {
        key:"base:"+id, documentIdentity:id,document:first.document,title:first.title||"",
        revisionSent:"", revisionFound:revision(first.revision), revisionsFound:[...new Set(found.map(r=>revision(r.revision)))],
        generatedAt:"",egrdtNumber:"",purpose:"",allocation:"",discipline:first.discipline||"",
        sigemStatus:conflict?"":text(first.status),status:conflict?STATUSES.REVIEW:"SEM_ENVIO",
        statusLabel:conflict?"Requer análise":"Sem envio registrado",
        note:conflict?"Status conflitante na mesma data da Consulta Geral.":
          "Localizado na Consulta Geral; sem emissão no histórico acessível.",
        sends:[],sendCount:0,revisionCount:0,grdtCount:0,
        sendEvidenceLabel:"Sem envio registrado"
      };
    });
  }

  return Object.freeze({COLUMNS,STATUSES,Conference,identity,text,norm,revision,enrich,latest,baseOnly});
});
