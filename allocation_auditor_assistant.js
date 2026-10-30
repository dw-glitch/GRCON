(function(root){
 'use strict';
 const VERSION='2.0.0';
 const editable=field=>field==='workflow'||field==='databook'||/^N[1-6]$/.test(field);
 const value=(row,field)=>String(/^N[1-6]$/.test(field)?row.levels?.[Number(field.slice(1))-1]||'':row[field]||'');
 // Rules are bounded precedents: never generalize a fiscal comment across documents.
 function evaluate(row,rule,context){
  const p=rule.payload||rule,why=[];
  if(rule.state!=='active')why.push('Regra não ativa');
  if(!editable(p.field)||!row.officialAllocation)why.push('Campo sem escritor homologável');
  for(const f of ['contract','document','revision','discipline'])if(!p[f]||p[f]!==row[f])why.push('Escopo diferente: '+f);
  if(!row.revision||row.origin?.revision!==row.revision)why.push('Revisão não comprovada');
  if(!p.sourceHash||p.sourceHash!==row.sourceHash)why.push('Origem alterada');
  if(!row.origin?.file||!row.origin?.sheet||!row.origin?.row)why.push('LD exata indisponível');
  if(!p.ldHash||p.ldHash!==context.ldHashes?.[row.origin?.file])why.push('Versão da LD não comprovada');
  if(JSON.stringify(p.versions)!==JSON.stringify(context.versions))why.push('Bases alteradas');
  if(value(row,p.field)!==p.before||!p.after||p.after===p.before)why.push('Valor divergente');
  if(!(row.recommendations||[]).some(r=>r.field===p.field&&r.before===p.before&&r.after===p.after))why.push('Sem proposta determinística correspondente');
  if(p.field==='databook'&&!(context.bases?.databook||[]).some(r=>r.databook===p.after))why.push('Destino não cadastrado');
  if(!(p.evidence||[]).length)why.push('Sem evidência');
  return {eligible:why.length===0,reasons:why};
 }
 function groups(rows){
  const out=new Map();
  for(const row of rows)for(const r of row.recommendations||[]){
   const k=JSON.stringify([row.contract,row.discipline,row.workflow,row.versions,r.field,r.before,r.after]);
   const group=out.get(k)||{id:k,field:r.field,before:r.before,after:r.after,justification:r.justification,evidence:r.evidence,rows:[]};
   group.rows.push({lineage:row.lineage,document:row.document,revision:row.revision});out.set(k,group);
  }
  return [...out.values()];
 }
 function allocationReference(text){
  const full=String(text).match(/\bC1O-ALOC-[A-Z]+-\d{3,4}-20\d{2}\b/i);if(full)return full[0].toUpperCase();
  if(/^\s*\d{1,4}\s*$/.test(text))return String(text).trim();
  return String(text).match(/\baloca(?:ç|c)[aã]o\s*(?:n[º°o.]?\s*)?(\d{1,4})\b/i)?.[1]||'';
 }
 function questionRows(rows,text){
  const tokens=new Set(String(text).toUpperCase().split(/[\s,;:()!?\[\]{}'"“”]+/).map(v=>v.replace(/\.$/,'')));
  const revision=String(text).match(/\brev(?:is[aã]o|\.)?\s*[:.]?\s*([0-9A-Z]+)\b/i)?.[1]?.toUpperCase();
  const allocation=String(text).match(/\bC1O-ALOC-[A-Z]+-\d{3,4}-20\d{2}\b/i)?.[0]?.toUpperCase();
  return rows.map((r,i)=>({r,i})).filter(({r})=>r.findings.length&&tokens.has(r.document.toUpperCase())&&(!revision||r.revision.toUpperCase()===revision)&&(!allocation||r.allocation?.toUpperCase()===allocation));
 }
 function intent(text){
  const t=String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/\b(baix|pacote|export)/.test(t))return 'package';
  if(/\b(paus|parar|interromp)/.test(t))return 'pause';
  if(/\b(retom|continu)/.test(t))return 'resume';
  if(/\b(expliq|por\s*que|qual\b|quais\b|justifi|duvida|o\s+que\b|como\b)/.test(t)||/\?/.test(t))return 'help';
  if(allocationReference(text))return 'audit';
  if(/\b(audit|analis|confer|confir|verifi|corrij|corrig)/.test(t))return 'audit';
  if(/\b(penden|exce|detalh)/.test(t))return 'details';
  return 'help';
 }
 root.GrconAllocationAssistant=Object.freeze({VERSION,editable,value,evaluate,groups,intent,allocationReference,questionRows});
})(typeof globalThis!=='undefined'?globalThis:this);
