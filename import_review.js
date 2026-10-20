(function(root){
 'use strict';
 const scope=()=>JSON.stringify([root.GrconCloud?.state?.session?.user?.id||'',root.GrconCloud?.state?.membership?.workspace_id||'']);
 const storageKey=kind=>'grcon.importReview.v1:'+kind+':'+scope();
 const read=(kind,fallback)=>{try{return JSON.parse(root.localStorage.getItem(storageKey(kind))||'null')??fallback;}catch(_){return fallback;}};
 const write=(kind,value)=>root.localStorage.setItem(storageKey(kind),JSON.stringify(value));
 const allowed=['document','revision','revisionComplete','documentType','state','lastEmission','documentTypeDesc','discipline','disciplineDesc','fileName','category','sentGrd','sentDate','incomingGrd','incomingDate','createdAt','stateChangedAt','emissionSequence'];
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
 function group(base){const groups=new Map();for(const row of base?.records||[]){const code=root.GrconDocumentTasks?.key(row.document)||String(row.document||'').trim().toUpperCase();const key=JSON.stringify([code,String(row.revisionComplete??row.revision??'').trim().toUpperCase()]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(JSON.stringify(canonical(row)));}for(const [key,values]of groups)groups.set(key,values.sort().join('\n'));return groups;}
 function compare(previous,candidate){const before=group(previous),after=group(candidate),examples=[];let added=0,removed=0,changed=0,unchanged=0;
  for(const [key,value]of after){const kind=!before.has(key)?'novo':before.get(key)!==value?'alterado':'igual';if(kind==='novo')added++;else if(kind==='alterado')changed++;else unchanged++;if(kind!=='igual'&&examples.length<12)examples.push({document:JSON.parse(key)[0],revision:JSON.parse(key)[1],kind});}
  for(const key of before.keys())if(!after.has(key)){removed++;if(examples.length<12)examples.push({document:JSON.parse(key)[0],revision:JSON.parse(key)[1],kind:'removido'});}
  return {added,removed,changed,unchanged,previousCount:previous?.records?.length||0,nextCount:candidate?.records?.length||0,examples};
 }
 const enabled=()=>read('enabled',false)===true;
 function profiles(){const items=read('profiles',[]);return Array.isArray(items)?items.slice(0,20):[];}
 function saveProfile(name,value){name=String(name||'').trim().slice(0,80);if(!name)throw Error('Informe o nome do perfil.');const columns={};for(const field of allowed)if(typeof value.columns?.[field]==='string'&&value.columns[field].trim())columns[field]=value.columns[field].trim().slice(0,160);for(const field of ['document','revision','documentType','state','lastEmission'])if(!columns[field])throw Error('Informe a coluna de '+field+'.');const delimiter=[';',',','\t'].includes(value.delimiter)?value.delimiter:';';const items=profiles().filter(p=>p.name!==name);if(items.length>=20)throw Error('Limite de 20 perfis.');items.push({name,columns,delimiter});write('profiles',items);return items;}
 function profile(){return profiles().find(p=>p.name===read('selectedProfile',''))||null;}
 function selectProfile(name){write('selectedProfile',String(name||''));}
 function removeProfile(name){write('profiles',profiles().filter(p=>p.name!==name));if(profile()?.name===name)selectProfile('');}
 async function review(system,candidate,previous){if(!enabled()||!root.document)return true;const identity=scope(),report=compare(previous,candidate),dialog=root.document.createElement('dialog');dialog.id='grcon-import-review';dialog.className='document-master-dialog';
  dialog.innerHTML='<form method="dialog"><h3>Prévia de importação · '+esc(system.toUpperCase())+'</h3><p>'+esc(candidate.meta?.fileName||'Arquivo')+'</p><p>'+report.previousCount+' registros anteriores → '+report.nextCount+' registros novos.</p><p>'+report.added+' documento(s)/revisão(ões) novo(s), '+report.removed+' removido(s), '+report.changed+' alterado(s), '+report.unchanged+' sem mudança.</p><p>Esta comparação considera a base importada. Filtros e LD podem reduzir o universo da análise. A publicação para a equipe é uma ação separada.</p><ul>'+report.examples.map(e=>'<li>'+esc(e.document)+' · Rev. '+esc(e.revision||'não informada')+' · '+e.kind+'</li>').join('')+'</ul><button value="cancel" type="submit">Cancelar</button><button value="apply" type="submit">Ativar base local</button></form>';
  root.document.body.appendChild(dialog);
  return new Promise(resolve=>{const cancel=()=>dialog.close('cancel');root.addEventListener('grcon:contract-context-changed',cancel);root.addEventListener('grcon:cloud-signed-out',cancel);dialog.addEventListener('close',()=>{root.removeEventListener('grcon:contract-context-changed',cancel);root.removeEventListener('grcon:cloud-signed-out',cancel);const apply=dialog.returnValue==='apply'&&identity===scope();dialog.remove();resolve(apply);},{once:true});dialog.showModal();});
 }
 function session(){const data=read('session',null);return data&&Date.now()-Number(data.at)<7*86400000?data.value:null;}
 function saveSession(value){try{write('session',{at:Date.now(),value});}catch(_){/* session hints must not block analysis */}}
 root.GrconImportReview=Object.freeze({scope,enabled,setEnabled:value=>write('enabled',Boolean(value)),compare,review,profiles,saveProfile,selectProfile,removeProfile,profile,session,saveSession});
})(typeof window==='undefined'?globalThis:window);
