(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.GrconDocumentExplanations=api;})(typeof window==='undefined'?globalThis:window,function(root){
 'use strict';
 const questions=Object.freeze({sources:'Quais fontes estão disponíveis?',conference:'Como entender a conferência?',revision:'Quais revisões aparecem nas fontes?',files:'Quais arquivos e versões foram encontrados?',history:'Quais emissões aparecem no histórico?'});
 const labels={sigem:'Consulta Geral / SIGEM',pw:'ProjectWise',history:'Histórico de eGRDTs',vault:'Cofre',requests:'Controle de Solicitações'};
 const text=value=>String(value??'').trim();
 const key=value=>root.GrconDocumentTasks?.key(value)||text(value).toUpperCase().replace(/\s+/g,'').replace(/^NT-/,'');
 function sameDate(a,b){const x=Date.parse(a),y=Date.parse(b);return Number.isFinite(x)&&x===y;}
 function answer(input){const intent=Object.hasOwn(questions,input.intent)?input.intent:'sources',data=input.data||{},sources=input.sources||{},code=text(input.code),lines=[],citations=new Set(),limitations=[];
  const add=(message,keys=[])=>{lines.push(message);for(const k of keys)citations.add(k);};
  function available(name){return !input.remoteFailed&&sources[name]?.available!==false&&(sources[name]?.available===true||Array.isArray(data[name]));}
  const page=name=>data.pages?.[name]||{};
  if(intent==='sources'){
   for(const name of Object.keys(labels)){
    if(name==='pw'&&input.localPwMeta&&!sources.pw?.available){add('ProjectWise local: '+text(input.localPwMeta.fileName||'arquivo não identificado')+'. Esta cópia não comprova a base compartilhada da equipe.',['pw']);continue;}
    if(!available(name)){add(labels[name]+': fonte indisponível ou sem base publicada.',[''+name]);continue;}
    const meta=sources[name]||{},rows=data[name]||[];
    add(labels[name]+': '+rows.length+' registro(s) nesta página'+(meta.fileName?' · '+text(meta.fileName):'')+(meta.date?' · data '+text(meta.date):'')+'.',[name]);if(page(name).hasMore)limitations.push(labels[name]+': há mais páginas; a contagem exibida não é o total.');
   }
  }else if(intent==='conference'){
   add('A conferência compara documento e revisão. O status textual do SIGEM é informativo. Somente o último envio pertinente determina a pendência vigente.',['sigem','history']);
   const engine=input.conference,latest=(data.history||[])[0],row=(engine?.rows||[]).find(r=>key(r.document)===key(code)&&r.workspaceId===input.workspaceId),send=row?.latestSend||row;
   const baseMatches=available('sigem')&&sources.sigem?.snapshotId&&engine?.snapshotId===sources.sigem.snapshotId;
   const latestMatches=available('history')&&!page('history').after&&latest&&send&&text(send.egrdtNumber)===text(latest.egrdt_number)&&sameDate(send.generatedAt,latest.generated_at);
   if(baseMatches&&latestMatches){add('Resultado calculado: '+text(row.conferenceLabel||row.statusLabel||row.status)+'. Último envio: '+text(send.egrdtNumber)+' · revisão '+text(send.revisionSent||'não informada')+'.',['sigem','history']);if(row.note)add(text(row.note),['sigem','history']);if(row.historicalPreserved&&!row.currentEvidence)add('Há confirmação histórica preservada; isso não comprova presença na base atual.',['history','sigem']);}
   else limitations.push('Não há resultado de conferência com as mesmas fontes e o mesmo último envio desta consulta. Abra a Conferência para verificar o documento.');
   if(!available('sigem'))limitations.push('Sem Consulta Geral disponível não é possível concluir a postagem atual.');
   if(!available('history')||!(data.history||[]).length)limitations.push('Sem emissão acessível no histórico não é possível determinar a pendência pelo último envio.');
  }else if(intent==='revision'){
   for(const name of ['sigem','pw']){
    if(!available(name)){add(labels[name]+': revisões indisponíveis. Nenhuma revisão foi inferida.',[''+name]);continue;}
    const revisions=[...new Set((data[name]||[]).map(r=>text(r.revisionComplete??r.revision)||'não informada'))];add(labels[name]+': revisões exibidas nesta página — '+(revisions.join(', ')||'nenhuma correspondência')+'.',[name]);
   }
   add('A revisão para emissão deve respeitar o arquivo físico. Mudança de status no SIGEM não autoriza avançar a revisão do arquivo.',['history','sigem']);
  }else if(intent==='files'){
   if(!available('vault'))limitations.push('O Cofre não está disponível nesta consulta.');
   else for(const f of (data.vault||[]).slice(0,12))add(text(f.file_name)+' · revisão '+(text(f.revision)||'não informada')+' · versão '+text(f.file_version||1)+' · '+(f.is_active?'atual':'histórica')+'.',['vault']);
   if(available('vault')&&!(data.vault||[]).length)add('Nenhum arquivo foi retornado pelo Cofre para este código.',['vault']);
   if((data.vault||[]).length>12||page('vault').hasMore)limitations.push('Resumo limitado aos arquivos apresentados; navegue na seção Cofre para ver os demais.');
  }else{
   if(!available('history'))limitations.push('Histórico compartilhado indisponível nesta consulta.');
   else for(const h of (data.history||[]).slice(0,12))add(text(h.egrdt_number||'eGRDT sem número')+' · '+text(h.generated_at||'data não informada')+' · revisão '+(text(h.file?.revision)||'não informada')+(h.file?.purpose?' · propósito '+text(h.file.purpose):'')+'.',['history']);
   if(available('history')&&!(data.history||[]).length)add('Nenhuma emissão foi retornada no histórico acessível para este código.',['history']);
   if((data.history||[]).length>12||page('history').hasMore||page('history').after)limitations.push('Este resumo usa a página consultada; não representa todo o histórico nem reclassifica pendências.');
  }
  return {mode:'source-rules',intent,title:questions[intent],code,lines,limitations,citations:[...citations].map(id=>({id,label:labels[id],queriedAt:data.pages?.[id]?.queriedAt||data.queriedAt||''})),queriedAt:data.queriedAt||''};
 }
 return Object.freeze({questions,answer});
});
