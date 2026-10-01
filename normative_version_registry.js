(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.GrconNormativeVersionRegistry=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const STATUSES=new Set(['active','outdated_candidate','unconfirmed','absent_from_catalog','superseded']);
const text=v=>String(v??'').trim();
const norm=v=>{
  const raw=text(v).toUpperCase().replace(/\s+/g,'');
  const m=raw.match(/^N-?0*(\d{1,4})$/);
  return m?`N-${String(Number(m[1])).padStart(4,'0')}`:raw;
};
const part=v=>{
  const x=text(v||'body').toUpperCase().replace(/\s+/g,' ');
  return x==='BODY'||x==='CORPO'?'BODY':x;
};
const key=(n,p)=>`${norm(n)}::${part(p)}`;

function normalizeEntry(value){
  const source=value||{};
  const entry={
    norm:norm(source.norm),
    part:part(source.part),
    revision:text(source.revision).toUpperCase(),
    edition:text(source.edition),
    catalogRevision:text(source.catalogRevision).toUpperCase(),
    catalogEdition:text(source.catalogEdition),
    title:text(source.title),
    status:text(source.status||'unconfirmed'),
    sourceAvailable:source.sourceAvailable!==false,
    verificationSource:text(source.verificationSource),
    notes:text(source.notes),
  };
  if(!entry.norm||!entry.revision)throw new Error('Versão normativa exige norma e revisão.');
  if(!STATUSES.has(entry.status))throw new Error(`Status de versão inválido: ${entry.status}.`);
  return Object.freeze(entry);
}

function createVersionRegistry(seed=[]){
  const map=new Map();

  const register=(value,opt={})=>{
    const entry=normalizeEntry(value);
    const entryKey=key(entry.norm,entry.part);
    if(map.has(entryKey)&&!opt.replace)throw new Error(`Versão normativa duplicada: ${entryKey}.`);
    map.set(entryKey,entry);
    return entry;
  };

  const get=(n,p)=>map.get(key(n,p))||null;
  const list=n=>Object.freeze([...map.values()].filter(entry=>!n||entry.norm===norm(n)));

  const promotionDecision=(entryOrNorm,p)=>{
    const entry=typeof entryOrNorm==='object'&&entryOrNorm?entryOrNorm:get(entryOrNorm,p);
    if(!entry)return Object.freeze({
      allowed:false,
      code:'missing_version',
      reason:'Versão normativa não cadastrada.',
    });
    if(!entry.sourceAvailable)return Object.freeze({
      allowed:false,
      code:'source_missing',
      reason:'A revisão foi identificada em catálogo ou inventário, mas o texto-fonte não foi auditado. Promoção automática bloqueada.',
    });
    if(entry.status!=='active')return Object.freeze({
      allowed:false,
      code:entry.status,
      reason:`Fonte normativa com status ${entry.status}; promoção automática bloqueada.`,
    });
    if(entry.catalogRevision&&entry.catalogRevision!==entry.revision)return Object.freeze({
      allowed:false,
      code:'catalog_mismatch',
      reason:`Revisão ${entry.revision} diverge do Catálogo ${entry.catalogRevision}.`,
    });
    return Object.freeze({
      allowed:true,
      code:'active',
      reason:'Texto-fonte auditado e versão compatível com a referência de catálogo disponível.',
    });
  };

  seed.forEach(register);
  return Object.freeze({
    register,
    get,
    list,
    promotionDecision,
    isUsable:(n,p)=>promotionDecision(n,p).allowed,
  });
}

const SEED=Object.freeze([
  normalizeEntry({
    norm:'N-2064',
    part:'body',
    revision:'D',
    edition:'10/2017',
    catalogRevision:'D',
    catalogEdition:'10/2017',
    status:'unconfirmed',
    sourceAvailable:true,
    verificationSource:'Catálogo oficial PETROBRAS Mar/2025 + cópia pública da Rev. D auditada nas seções 4.1 a 5.3; pacote fornecido contém Rev. C',
    notes:'A revisão vigente foi confirmada no catálogo oficial e o texto público da Rev. D foi usado para corrigir falsos bloqueios/formatos de revisão. Como o pacote entregue não contém o PDF primário Rev. D, a camada normativa ainda não promove automaticamente essas regras a BLOQUEIO.',
  }),
  normalizeEntry({
    norm:'N-1710',
    part:'body',
    revision:'N',
    edition:'04/2020',
    catalogRevision:'N',
    catalogEdition:'04/2020',
    status:'active',
    sourceAvailable:true,
    verificationSource:'PDF fornecido + Catálogo público PETROBRAS Mar/2025',
  }),
  normalizeEntry({norm:'N-1710',part:'Anexo A',revision:'W',edition:'10/2023',status:'active',sourceAvailable:true,verificationSource:'Cabeçalho do Anexo A + Anexo G'}),
  normalizeEntry({norm:'N-1710',part:'Anexo B',revision:'CJ',edition:'04/2025',status:'active',sourceAvailable:true,verificationSource:'Cabeçalho do Anexo B + Anexo G'}),
  normalizeEntry({norm:'N-1710',part:'Anexo C',revision:'BF',edition:'12/2024',status:'active',sourceAvailable:true,verificationSource:'Cabeçalho do Anexo C + Anexo G'}),
  normalizeEntry({norm:'N-1710',part:'Anexo D',revision:'BG',edition:'04/2025',status:'active',sourceAvailable:true,verificationSource:'Cabeçalho do Anexo D + Anexo G'}),
  normalizeEntry({norm:'N-1710',part:'Anexo E',revision:'D',edition:'03/2010',status:'active',sourceAvailable:true,verificationSource:'Cabeçalho do Anexo E + Anexo G'}),
  normalizeEntry({norm:'N-1710',part:'Anexo F',revision:'G',edition:'10/2014',status:'active',sourceAvailable:true,verificationSource:'Cabeçalho do Anexo F + Anexo G'}),
  normalizeEntry({norm:'N-1710',part:'Anexo G',revision:'CN',edition:'04/2025',status:'active',sourceAvailable:true,verificationSource:'Cabeçalho do Anexo G'}),
  normalizeEntry({
    norm:'N-0381',
    part:'body',
    revision:'M',
    edition:'05/2022 + errata 06/2022',
    catalogRevision:'M',
    catalogEdition:'05/2022',
    status:'active',
    sourceAvailable:true,
    verificationSource:'PDF fornecido + Catálogo público PETROBRAS Mar/2025',
    notes:'Aplicabilidade contratual e prazo de implementação permanecem dependentes do empreendimento/contrato.',
  }),
  normalizeEntry({norm:'N-1692',part:'body',revision:'D',edition:'04/2019',catalogRevision:'D',catalogEdition:'04/2019',status:'unconfirmed',sourceAvailable:false,verificationSource:'Catálogo público PETROBRAS Mar/2025',notes:'PDF normativo não auditado neste checkpoint.'}),
  normalizeEntry({norm:'N-1883',part:'body',revision:'F',edition:'05/2024',catalogRevision:'F',catalogEdition:'05/2024',status:'unconfirmed',sourceAvailable:false,verificationSource:'Catálogo público PETROBRAS Mar/2025',notes:'PDF normativo não auditado neste checkpoint.'}),
  normalizeEntry({norm:'N-2040',part:'body',revision:'F',edition:'03/2017',catalogRevision:'F',catalogEdition:'03/2017',status:'unconfirmed',sourceAvailable:false,verificationSource:'Catálogo público PETROBRAS Mar/2025',notes:'PDF normativo não auditado neste checkpoint.'}),
  normalizeEntry({norm:'N-1784',part:'body',revision:'C',edition:'11/2011',catalogRevision:'C',catalogEdition:'11/2011',status:'unconfirmed',sourceAvailable:false,verificationSource:'Catálogo público PETROBRAS Mar/2025',notes:'PDF normativo não auditado neste checkpoint.'}),
]);

return Object.freeze({
  STATUSES:Object.freeze([...STATUSES]),
  SEED,
  text,
  norm,
  part,
  normalizeEntry,
  createVersionRegistry,
});
});
