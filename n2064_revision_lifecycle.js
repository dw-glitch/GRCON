(function(root,factory){
  const Core=root.TriagemCore||(typeof module==='object'&&module.exports?require('./core.js'):null);
  const api=factory(Core);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.GrconN2064Lifecycle=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Core){
'use strict';

const SOURCE=Object.freeze({
  norm:'N-2064',
  revision:'D',
  edition:'10/2017',
  catalog:'Catálogo oficial PETROBRAS Mar/2025',
  sourceStatus:'unconfirmed_primary_pdf',
});

const text=value=>String(value??'').trim();
const normalize=value=>Core&&Core.normalizeRevision?Core.normalizeRevision(value):text(value).toUpperCase().replace(/^REV(?:ISAO)?\.?\s*/,'').replace(/\s+/g,'');
const info=value=>Core&&Core.revisionInfo?Core.revisionInfo(value):({revision:normalize(value),valid:Boolean(normalize(value)),kind:'unknown',rank:0,warnings:[]});
const next=value=>Core&&Core.nextRevision?Core.nextRevision(value):'';

function result(errors,warnings,meta={}){
  return Object.freeze({
    valid:errors.length===0,
    errors:Object.freeze(errors),
    warnings:Object.freeze(warnings),
    source:SOURCE,
    ...meta,
  });
}

function validateTransition(previousRevision,nextRevisionValue){
  const previous=previousRevision==null||text(previousRevision)===''?null:info(previousRevision);
  const nextInfo=info(nextRevisionValue);
  const errors=[];
  const warnings=[...(nextInfo.warnings||[])];

  if(!nextInfo.valid){
    errors.push('Revisão de destino inválida.');
    return result(errors,warnings,{previous,next:nextInfo});
  }
  if(previous && !previous.valid){
    warnings.push('A revisão anterior não pôde ser classificada; a sequência não foi usada como bloqueio.');
    return result(errors,warnings,{previous,next:nextInfo});
  }

  if(!previous){
    if(nextInfo.lifecycleKind!=='preliminary_before_original'&&nextInfo.revision!=='0'){
      errors.push('A primeira emissão controlada deve ser revisão 0; versões anteriores à emissão original usam # seguido de número.');
    }
    return result(errors,warnings,{previous,next:nextInfo});
  }

  if(nextInfo.lifecycleKind==='preliminary_before_original'){
    if(previous.lifecycleKind==='preliminary_before_original'){
      if(nextInfo.sequence<=previous.sequence) warnings.push('A sequência preliminar não avançou; conferir histórico/justificativa.');
      return result(errors,warnings,{previous,next:nextInfo});
    }
    errors.push('Revisão preliminar #n só é aplicável antes da emissão original (Rev. 0).');
    return result(errors,warnings,{previous,next:nextInfo});
  }

  if(nextInfo.lifecycleKind==='preliminary_after_revision'){
    const previousBase=previous.baseRevision||previous.revision;
    if(nextInfo.baseRevision!==previousBase){
      errors.push(`A versão preliminar ${nextInfo.revision} deve partir da última revisão emitida ${previous.revision}.`);
    }
    if(previous.lifecycleKind==='preliminary_after_revision'&&nextInfo.sequence<=previous.sequence){
      warnings.push('A sequência preliminar não avançou; conferir histórico/justificativa.');
    }
    return result(errors,warnings,{previous,next:nextInfo});
  }

  if(previous.lifecycleKind==='preliminary_before_original'){
    if(nextInfo.revision!=='0') errors.push('Após versões #n, a emissão original deve ser Rev. 0.');
    return result(errors,warnings,{previous,next:nextInfo});
  }

  if(previous.lifecycleKind==='preliminary_after_revision'){
    const target=previous.targetRevision||next(previous.baseRevision);
    if(nextInfo.kind==='standard'&&target&&nextInfo.revision!==target){
      warnings.push(`A versão preliminar ${previous.revision} apontava para ${target}; foi informada ${nextInfo.revision}. Conferir histórico antes da emissão.`);
    }
    return result(errors,warnings,{previous,next:nextInfo});
  }

  if(previous.kind==='standard'&&nextInfo.kind==='standard'){
    const expected=next(previous.revision);
    if(expected&&nextInfo.revision!==expected){
      warnings.push(`Sequência não contínua: após ${previous.revision}, a próxima revisão recomendada pelo GRCON é ${expected}. Conferir histórico/justificativa.`);
    }
  }
  return result(errors,warnings,{previous,next:nextInfo});
}

function validateAction(input={}){
  const action=text(input.action).toLowerCase();
  const errors=[];
  const warnings=[];
  const currentDocument=text(input.document);
  const replacementDocument=text(input.replacementDocument||input.newDocument);
  const revisionDescription=text(input.revisionDescription);
  const sourceRevision=normalize(input.sourceRevision||input.revision);
  const newRevision=normalize(input.newRevision);

  if(input.purposeChanged===true){
    warnings.push('A mudança de finalidade da emissão caracteriza revisão e deve permanecer rastreável no histórico.');
  }

  if(['cancel','replace','renumber'].includes(action)&&input.previouslyEmitted===false){
    errors.push('Documento ainda não emitido não deve ser cancelado/substituído/renumerado; deve ser retirado do planejamento aplicável.');
  }
  if(['cancel','replace','renumber'].includes(action)&&input.previouslyEmitted==null){
    warnings.push('Não foi possível confirmar a emissão anterior; consulte Histórico e Consulta Geral antes de decidir.');
  }

  if(action==='cancel'){
    if(!revisionDescription) warnings.push('Cancelamento deve registrar descrição/justificativa da revisão.');
  }else if(action==='replace'){
    if(!replacementDocument) errors.push('Substituição exige identificar o documento substituinte.');
    if(replacementDocument&&currentDocument&&replacementDocument===currentDocument) warnings.push('Documento substituinte é igual ao substituído; conferir a relação de substituição.');
    if(!revisionDescription) warnings.push('Substituição deve registrar a relação “cancelado/substituído por” na descrição da revisão.');
  }else if(action==='renumber'){
    if(!replacementDocument) errors.push('Renumeração exige o novo número do documento.');
    if(replacementDocument&&currentDocument&&replacementDocument.toUpperCase()===currentDocument.toUpperCase()) errors.push('Renumeração exige um número diferente do documento original.');
    if(newRevision!=='0') errors.push('Documento renumerado deve nascer como novo documento em revisão 0.');
  }else if(action==='translate'){
    if(!replacementDocument) errors.push('Tradução exige novo número/identidade documental.');
    if(!sourceRevision) errors.push('Tradução deve registrar a revisão do documento no idioma original usada como fonte.');
  }else if(['as_built','as_purchased','as_manufactured','certified','revision',''].includes(action)){
    // Tipos reconhecidos; campos de conteúdo/capa são tratados por N-381 e pelo histórico do documento.
  }else{
    warnings.push(`Ação “${action}” não possui regra N-2064 mapeada nesta versão do motor.`);
  }

  return result(errors,warnings,{action,document:currentDocument,replacementDocument,sourceRevision,newRevision});
}

function audit(input={}){
  const transition=validateTransition(input.previousRevision,input.revision);
  const action=validateAction(input);
  return result(
    [...transition.errors,...action.errors],
    [...transition.warnings,...action.warnings],
    {transition,action},
  );
}

return Object.freeze({SOURCE,validateTransition,validateAction,audit});
});
