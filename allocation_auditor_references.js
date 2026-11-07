(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.GrconAllocationAuditorReferences=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // Catálogo de referências normativas e documentais do Robô Auditor de Alocações (Etapa 3).
 // Princípio: LOCALIZADO ≠ CARREGADO ≠ VALIDADO ≠ HOMOLOGADO. Um arquivo encontrado nunca habilita, sozinho, uma regra normativa;
 // falta de referência nunca vira conformidade (a verificação fica "bloqueada" e o motivo é dito); revisões não se preenchem umas às outras.
 const VERSION='1.0.1';
 const LEVELS=Object.freeze(['ausente','localizado','carregado','validado','homologado']);
 const text=v=>v==null?'':String(v).trim();
 const norm=v=>text(v).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ');
 const rank=level=>LEVELS.indexOf(level);
 const ET_CODE='ET-5290.00-22000-912-1LV-001';

 const KINDS=Object.freeze({
  'et-codificacao':'ET-5290.00-22000-912-1LV-001 — Definição de codificação de documentos',
  'n-1710':'Petrobras N-1710 — Codificação de documentos técnicos de engenharia',
  'n-381':'Petrobras N-381 — Formulários e campos de documentos técnicos',
  'anexo-i-apendice-3':'Anexo I — Apêndice 3 — Fornecimento de Bens Tagueados (TAGs)',
  'anexo-iii-apendice-a':'Anexo III — Apêndice A — EAP / critério de medição',
  'caminho-data-book':'Caminho do Data Book',
  'caminho-das-pastas':'Caminho das Pastas UHDT-D',
  'workflows-uhdt-d':'WORKFLOWS_UHDT-D',
  'memorial-uhdt-d':'Memorial UHDT-D',
  'ld':'Lista de Documentos (LD) de referência',
  'central-alocacao':'Central de Alocação',
  'alocacao-retornada':'Alocação retornada pela fiscalização (histórico)',
  'desconhecido':'Arquivo não classificado'
 });

 // O que o código do GRCON efetivamente CARREGA hoje (dados embutidos). Isso é "carregado", não "validado".
 // P: só a Tabela 13 (Grupo 6) está embutida; as demais regras da Rev. P não têm validador. N e Q: nada embutido.
 const BUILT_IN=Object.freeze([
  Object.freeze({kind:'et-codificacao',revision:'R',scopes:Object.freeze(['grupos-1-7','tabela-6','tabela-12','tabela-13','nt-prefixo']),declaredEffective:'24/08/2026',note:'Validador completo incorporado (RECON). Data de vigência declarada no histórico do projeto; não comprovada documentalmente.'}),
  Object.freeze({kind:'et-codificacao',revision:'P',scopes:Object.freeze(['tabela-13']),declaredEffective:'',note:'Somente a Tabela 13 (Grupo 6) da Rev. P está incorporada; não há validador das demais regras.'}),
  Object.freeze({kind:'n-1710',revision:'N',scopes:Object.freeze(['anexo-a','anexo-b','anexo-c','anexo-d']),declaredEffective:'04/2020',note:'Listas dos Anexos A a D incorporadas.'}),
  Object.freeze({kind:'n-381',revision:'M',scopes:Object.freeze(['numeracao']),declaredEffective:'05/2022',note:'Regra de numeração incorporada.'})
 ]);
 const REQUIRED_REVISIONS=Object.freeze({'et-codificacao':['N','P','Q','R']});

 // Regras e a referência de que dependem. min = nível mínimo da referência para a regra poder ser declarada verificada.
 const DEPENDENCIES=Object.freeze([
  ...['ET-R-7.1','ET-R-7.1.3','ET-R-7.1.5','ET-R-7.1.6','ET-R-7.1.7','ET-R-7.1.7.3'].map(rule=>({rule,family:'ET',field:rule==='ET-R-7.1.6'?'document (Grupo 6)':rule==='ET-R-7.1.3'?'document (Grupo 3)':rule==='ET-R-7.1.5'?'document (Grupo 5)':'document',appliesTo:'ET',requires:{kind:'et-codificacao',revision:'R',min:'validado',scope:rule==='ET-R-7.1.6'?'tabela-13':rule==='ET-R-7.1.3'?'tabela-12':rule==='ET-R-7.1.5'?'tabela-6':rule==='ET-R-7.1.7.3'?'nt-prefixo':'grupos-1-7'}})),
  ...['ET-717-PRESERVE','ET-7171-SEPARATOR','ET-7172-CHARACTERS','ET-7173-NT'].map(rule=>({rule,family:'ET',field:'tag',appliesTo:'ET',requires:{kind:'et-codificacao',revision:'applicable',min:'validado',scope:'grupos-1-7'}})),
  ...['N1710-5','N1710-A','N1710-B','N1710-C','N1710-D'].map(rule=>({rule,family:'N-1710',field:'document',appliesTo:'N-1710',requires:{kind:'n-1710',revision:'N',min:'validado',scope:rule==='N1710-A'?'anexo-a':rule==='N1710-B'?'anexo-b':rule==='N1710-C'?'anexo-c':rule==='N1710-D'?'anexo-d':undefined}})),
  {rule:'N381-NUM',family:'N-381',field:'document',appliesTo:'any',requires:{kind:'n-381',revision:'M',min:'validado',scope:'numeracao'}},
  {rule:'TAG-ANEXO-I-AP3',family:'TAG',field:'tag',appliesTo:'tag',requires:{kind:'anexo-i-apendice-3',revision:'any',min:'validado'}},
  {rule:'EAP-ANEXO-III-APA',family:'EAP',field:'levels (N1–N10)',appliesTo:'eap',requires:{kind:'anexo-iii-apendice-a',revision:'any',min:'homologado'}},
  {rule:'DATABOOK-CAMINHO',family:'Data Book',field:'databook',appliesTo:'databook',requires:{kind:'caminho-data-book',revision:'any',min:'validado'}},
  {rule:'DATABOOK-PASTAS',family:'Data Book',field:'databook',appliesTo:'databook',requires:{kind:'caminho-das-pastas',revision:'any',min:'validado'}},
  {rule:'WORKFLOW-UHDT-D',family:'Workflow',field:'workflow',appliesTo:'workflow',requires:{kind:'workflows-uhdt-d',revision:'any',min:'homologado'}}
 ].map(d=>Object.freeze({...d,requires:Object.freeze({...d.requires})})));

 // ---- Classificação de arquivos do inventário (nome + hash). Revisão só entra quando o nome a diz; nunca é presumida.
 function classifyFile(file){
  const name=text(file&&file.name),n=norm(name);
  const rev=re=>{const m=n.match(re);return m?m[1]:null;};
  if(/^LD-5290/.test(n))return {kind:'ld',revision:rev(/_\d{4}_([A-Z0-9])(?:\(|\.|$)/),revisionSource:'nome do arquivo'};
  if(/^C1O-ALOC-CM-\d+/.test(n))return {kind:'alocacao-retornada',revision:null,revisionSource:''};
  if(/CENTRAL DE ALOCACAO/.test(n))return {kind:'central-alocacao',revision:null,revisionSource:''};
  if(/CAMINHO DATA ?BOOK/.test(n)){const r=rev(/REV\.?\s*([A-Z])\b/);return {kind:'caminho-data-book',revision:r,revisionSource:r?'nome do arquivo':''};}
  if(/CAMINHO DAS PASTAS/.test(n))return {kind:'caminho-das-pastas',revision:null,revisionSource:''};
  if(/WORKFLOWS?[_ ]UHDT-D/.test(n))return {kind:'workflows-uhdt-d',revision:null,revisionSource:'',dateInName:(n.match(/\b(\d{6})\b/)||[])[1]||''};
  if(/MEMORIAL.*UHDT/.test(n))return {kind:'memorial-uhdt-d',revision:null,revisionSource:''};
  if(/ANEXO I\b.*APENDICE 3|APENDICE 3.*BENS TAGUEADOS/.test(n)){const r=rev(/\bREV\.?\s*([A-Z])\b/);return {kind:'anexo-i-apendice-3',revision:r,revisionSource:r?'nome do arquivo':''};}
  if(/ANEXO III.*APENDICE A/.test(n))return {kind:'anexo-iii-apendice-a',revision:rev(/\bREV\.?\s*([A-Z])\b/),revisionSource:'nome do arquivo'};
  if(n.includes(ET_CODE)){const r=rev(/\bREV\.?\s*([A-Z])\b/);return {kind:'et-codificacao',revision:r,revisionSource:r?'nome do arquivo':''};}
  if(/^N-1710/.test(n))return {kind:'n-1710',revision:null,revisionSource:''};
  if(/^N-381/.test(n))return {kind:'n-381',revision:null,revisionSource:''};
  return {kind:'desconhecido',revision:null,revisionSource:''};
 }

 function entryId(kind,revision,sha){return kind+'@'+(revision||(sha?'sha:'+sha.slice(0,12):'sem-revisao'));}

 // ---- Construção do catálogo.
 function oldestFirst(records){
  const stamp=r=>{const value=text(r.createdAt||r.at),m=value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/),n=m?Date.UTC(+m[3],+m[2]-1,+m[1]):Date.parse(value);return Number.isFinite(n)?n:0;};
  const explicit=r=>['applicability','sinalizador-existente'].includes(r.origin)?0:1;
  return records.map((r,i)=>({r,i})).sort((a,b)=>explicit(a.r)-explicit(b.r)||stamp(a.r)-stamp(b.r)||b.i-a.i).map(x=>x.r);
 }
 // inventory: {files:[{name,sha256,bytes}]}; validations/homologations: [{kind,revision,sha256?,by,at,evidence,effective?:{date,evidence}}]
 // applicability: confirmação humana da revisão da ET (já existente no GRCON); homologated: {eap,workflow,...}; loadedBases: {tags,databook,eap,workflow,pastas}
 function buildCatalog(options={}){
  const contract=text(options.contract),now=options.now||new Date().toISOString();
  const files=(options.inventory&&options.inventory.files)||[];
  let validations=[...(options.validations||[])];const homologations=oldestFirst([...(options.homologations||[])]);
  const app=options.applicability||{};
  // A declaração de aplicabilidade seleciona a revisão; não substitui validação completa e vigência comprovada.
  if(app.confirmed===true&&text(app.evidence)&&text(app.revision)&&(!app.contract||app.contract===contract))validations.unshift({kind:'et-codificacao',revision:text(app.revision),by:text(app.confirmedBy)||'confirmação de aplicabilidade',at:text(app.confirmedAt)||'',evidence:text(app.evidence),origin:'applicability'});
  validations=oldestFirst(validations);
  const entries=new Map();
  const ensure=(kind,revision,sha)=>{const id=entryId(kind,revision,sha);if(!entries.has(id))entries.set(id,{id,kind,name:KINDS[kind]||KINDS.desconhecido,revision:revision||null,contract,files:[],loadedScopes:[],loadedFrom:'',effective:{date:'',proof:'nenhuma',evidence:''},validated:null,homologated:null,notes:[],blockers:[]});return entries.get(id);};
  for(const file of files){
   const c=classifyFile(file),sha=text(file.sha256);
   // Revisão não identificada pelo nome: só um registro de validação por hash pode atribuí-la.
   const byHash=validations.slice().reverse().find(v=>text(v.sha256)&&text(v.sha256)===sha&&text(v.revision));
   const revision=c.revision||(byHash?text(byHash.revision):null);
   const e=ensure(c.kind,revision,revision?'':sha);
   e.files.push({name:text(file.name),sha256:sha,bytes:Number(file.bytes)||0,revisionSource:c.revision?c.revisionSource:(byHash?'validação por hash':'')||'não identificada',dateInName:c.dateInName||''});
  }
  for(const b of BUILT_IN){const e=ensure(b.kind,b.revision);e.loadedScopes=[...b.scopes];e.loadedFrom='embutido no GRCON';if(b.declaredEffective)e.effective={date:b.declaredEffective,proof:'declarada',evidence:'Registrada no histórico do projeto; não comprovada documentalmente.'};if(b.note)e.notes.push(b.note);}
  // Bases carregadas pelo usuário nesta sessão (TAGs, Data Book, EAP, Workflow, pastas) contam como "carregado", sem validar nada.
  const baseKinds={tags:'anexo-i-apendice-3',databook:'caminho-data-book',pastas:'caminho-das-pastas',eap:'anexo-iii-apendice-a',workflow:'workflows-uhdt-d'};
  for(const [key,kind] of Object.entries(baseKinds)){const v=(options.loadedBases||{})[key];if(!v)continue;const e=[...entries.values()].find(x=>x.kind===kind&&!x.loadedFrom)||ensure(kind,null);e.loadedScopes=['base-carregada'];e.loadedFrom='base carregada nesta análise'+(typeof v==='object'&&v.name?': '+v.name:'');}
  for(const v of validations){
   if(!text(v.by)||!text(v.evidence))continue; // validação sem responsável ou sem evidência não vale
   // Revisão e hash são filtros cumulativos. Sem ambos, o registro se refere à base carregada daquele tipo.
   const targets=[...entries.values()].filter(e=>e.kind===v.kind&&(!text(v.revision)||e.revision===text(v.revision))&&(!text(v.sha256)||e.files.some(f=>f.sha256===text(v.sha256)))&&(text(v.revision)||text(v.sha256)||e.loadedScopes.length>0));
   for(const e of targets){e.validated={by:text(v.by),at:text(v.at),evidence:text(v.evidence),origin:v.origin||'registro'};if(v.effective&&text(v.effective.date)&&text(v.effective.evidence))e.effective={date:text(v.effective.date),proof:'documentada',evidence:text(v.effective.evidence)};}
  }
  for(const h of homologations){
   if(!text(h.by)||!text(h.at))continue;
   for(const e of entries.values())if(e.kind===h.kind&&(!text(h.revision)||e.revision===text(h.revision))&&(!text(h.sha256)||e.files.some(f=>f.sha256===text(h.sha256))))e.homologated={by:text(h.by),at:text(h.at),evidence:text(h.evidence)};
  }
  // Sinalizador de homologação que a tela JÁ grava (homologated.eap / homologated.workflow). É uma confirmação humana explícita do usuário:
  // é preservado como declaração legada, sem elevar o nível da base. Registro completo prevalece.
  const h=options.homologated||{};
  for(const [key,kind] of [['eap','anexo-iii-apendice-a'],['workflow','workflows-uhdt-d']]){
   const v=h[key];if(!v)continue;
   const rec=typeof v==='object'?{by:text(v.by),at:text(v.at),evidence:text(v.evidence),origin:'registro'}:{by:'usuário (sinalizador de homologação da análise)',at:'',evidence:'Confirmação registrada na análise (homologated.'+key+').',origin:'sinalizador-existente'};
   if(!rec.by)continue;
   for(const e of entries.values())if(e.kind===kind&&e.loadedScopes.length>0){if(!e.validated)e.validated={...rec};if(!e.homologated)e.homologated={...rec};}
  }
  // Referências esperadas e AUSENTES: aparecem no catálogo, com o bloqueio dito.
  for(const kind of ['et-codificacao','n-1710','n-381','anexo-i-apendice-3','anexo-iii-apendice-a','caminho-data-book','caminho-das-pastas','workflows-uhdt-d'])if(![...entries.values()].some(e=>e.kind===kind))ensure(kind,null);
  for(const rev of REQUIRED_REVISIONS['et-codificacao'])if(![...entries.values()].some(e=>e.kind==='et-codificacao'&&e.revision===rev))ensure('et-codificacao',rev);
  const list=[...entries.values()].map(e=>finish(e,options));
  list.sort((a,b)=>a.kind.localeCompare(b.kind)||String(a.revision).localeCompare(String(b.revision)));
  const searched=(options.inventory&&options.inventory.notes)||[];
  return {version:VERSION,contract,builtAt:now,applicableRevision:text(app.revision)||'',entries:list,byId:Object.fromEntries(list.map(e=>[e.id,e])),searchNotes:searched,
   fingerprint:fingerprint(list)};
 }
 function finish(e,options){
  const located=e.files.length>0||Boolean(e.loadedFrom);
  const loaded=e.loadedScopes.length>0;
  const complete=p=>p&&text(p.by)&&text(p.at)&&text(p.evidence)&&!['sinalizador-existente','applicability'].includes(p.origin);
  const validated=loaded&&Boolean(complete(e.validated));
  const homologated=validated&&Boolean(complete(e.homologated));
  e.level=homologated?'homologado':validated?'validado':loaded?'carregado':located?'localizado':'ausente';
  e.blockers=[];
  if(!located)e.blockers.push({code:'REF-AUSENTE',message:'Referência não localizada nas fontes disponíveis.'});
  else if(!loaded)e.blockers.push({code:'REF-NAO-CARREGADA',message:'Arquivo localizado, mas nenhum conteúdo foi carregado/validado pelo GRCON para esta referência.'});
  if(e.validated&&!loaded)e.blockers.push({code:'REF-VALIDACAO-SEM-CARGA',message:'Há validação registrada, mas o GRCON não possui dados carregados desta referência/revisão; a validação não habilita regras.'});
  if(loaded&&!validated)e.blockers.push({code:'REF-NAO-VALIDADA',message:'Carregada, mas sem validação completa registrada (responsável, data e evidência). Declaração de aplicabilidade e sinalizadores não a substituem.'});
  if(e.kind==='et-codificacao'&&!e.revision&&e.files.length)e.blockers.push({code:'REF-REVISAO-NAO-IDENTIFICADA',message:'O arquivo não informa a revisão e nenhuma validação por hash a atribuiu. Não usar como Rev. N, P, Q ou R.'});
  const ref=options&&options.referenceDate;
  if(ref&&e.effective.proof!=='nenhuma'&&/^\d{2}\/\d{2}\/\d{4}$/.test(e.effective.date)){const [d,m,y]=e.effective.date.split('/').map(Number);if(new Date(ref).getTime()<Date.UTC(y,m-1,d))e.blockers.push({code:'REF-FORA-VIGENCIA',message:'A data de referência é anterior à vigência informada ('+e.effective.date+').'});}
  if(e.effective.proof==='declarada')e.notes.push('Vigência apenas declarada — comprovação documental pendente.');
  if(e.effective.proof==='nenhuma'&&loaded)e.notes.push('Vigência não comprovada.');
  // Como a validação/homologação foi DEMONSTRADA: registro completo (responsável, data, evidência), confirmação de aplicabilidade (com evidência)
  // ou apenas o sinalizador que a tela já grava (sem responsável nem data). Sinalizador não é demonstração.
  const proof=e.homologated||e.validated;
  e.demonstration=!proof?'':proof.origin==='sinalizador-existente'?'sinalizador':proof.origin==='applicability'?'confirmação de aplicabilidade':'registro completo';
  e.dependsRules=DEPENDENCIES.filter(d=>d.requires.kind===e.kind&&(d.requires.revision==='any'||d.requires.revision==='applicable'||d.requires.revision===e.revision)).map(d=>d.rule);
  return e;
 }
 function fingerprint(entries){
  const s=JSON.stringify(entries.map(e=>[e.id,e.level,e.loadedScopes,e.validated&&[e.validated.by,e.validated.at,e.validated.evidence],e.homologated&&[e.homologated.by,e.homologated.at],e.effective.date,e.effective.proof,e.files.map(f=>f.sha256),e.blockers.map(b=>b.code)]));
  let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');
 }

 // ---- Disponibilidade das regras.
 function applies(dep,record){
  const kind=record.docKind;
  if(dep.appliesTo==='ET')return kind==='ET';
  if(dep.appliesTo==='N-1710')return kind==='N-1710';
  if(dep.appliesTo==='tag')return Boolean(text(record.tag));
  if(dep.appliesTo==='eap')return Boolean(text(record.eap)||(Array.isArray(record.levels)&&record.levels.some(Boolean)));
  if(dep.appliesTo==='databook')return Boolean(text(record.databook));
  if(dep.appliesTo==='workflow')return Boolean(text(record.workflow));
  return true;
 }
 function findEntry(catalog,req){
  const wanted=req.revision==='applicable'?catalog.applicableRevision:req.revision==='any'?null:req.revision;
  const same=catalog.entries.filter(e=>e.kind===req.kind);
  if(req.revision==='any'){ // melhor entrada disponível, sem misturar: a de maior nível
   return same.slice().sort((a,b)=>rank(b.level)-rank(a.level))[0]||null;
  }
  if(!wanted)return null;
  return same.find(e=>e.revision===wanted)||null;
 }
 function ruleAvailability(dep,catalog){
  const req=dep.requires,entry=findEntry(catalog,req),min=req.min||'validado';
  const result={rule:dep.rule,family:dep.family,field:dep.field,requires:{kind:req.kind,revision:req.revision==='applicable'?(catalog.applicableRevision||'a confirmar'):req.revision==='any'?'qualquer':req.revision,min,scope:req.scope||''},reference:entry?{id:entry.id,name:entry.name,revision:entry.revision,level:entry.level,files:entry.files.map(f=>({name:f.name,sha256:f.sha256})),validated:entry.validated,homologated:entry.homologated,effective:entry.effective}:null,blockers:[]};
  const need=(code,message)=>result.blockers.push({code,message,reference:KINDS[req.kind],revision:result.requires.revision,needed:'nível "'+min+'"'+(req.scope?' (escopo '+req.scope+')':'')});
  if(req.revision==='applicable'&&!catalog.applicableRevision)need('REF-REVISAO-A-CONFIRMAR','A revisão aplicável da ET ainda não foi confirmada para este contrato.');
  else if(!entry||entry.level==='ausente')need('REF-AUSENTE','Referência necessária não localizada: '+KINDS[req.kind]+(result.requires.revision&&result.requires.revision!=='qualquer'?' Rev. '+result.requires.revision:'')+'.');
  else{
   if(rank(entry.level)<rank(min))need(entry.level==='localizado'?'REF-NAO-CARREGADA':rank(min)>=rank('homologado')&&entry.level==='validado'?'REF-NAO-HOMOLOGADA':'REF-NAO-VALIDADA','A referência está "'+entry.level+'"; esta verificação exige "'+min+'".');
   if(req.kind==='et-codificacao'&&entry.effective.proof!=='documentada')need('REF-VIGENCIA-NAO-COMPROVADA','A data de emissão da ET não comprova sua vigência contratual. Registre a evidência da vigência antes de validar esta regra.');
   if(req.scope&&entry.loadedFrom==='embutido no GRCON'&&!entry.loadedScopes.includes(req.scope))need('REF-ESCOPO-NAO-CARREGADO','O escopo "'+req.scope+'" desta revisão não está carregado no GRCON (carregado: '+(entry.loadedScopes.join(', ')||'nenhum')+').');
   for(const b of entry.blockers)if(b.code==='REF-FORA-VIGENCIA'||b.code==='REF-REVISAO-NAO-IDENTIFICADA')result.blockers.push({...b,reference:KINDS[req.kind],revision:entry.revision||'não identificada',needed:'vigência/revisão comprovadas'});
  }
  result.state=result.blockers.length?'bloqueada':'verificavel';
  result.demonstration=entry?entry.demonstration:'';
  return result;
 }
 function relevantRules(record){return DEPENDENCIES.filter(d=>applies(d,record));}
 // The same proven catalog controls engine and correction eligibility. A legacy
 // boolean is never enough when a catalog is available.
 function approved(catalog,key){
  const kinds={eap:'anexo-iii-apendice-a',workflows:'workflows-uhdt-d',workflow:'workflows-uhdt-d',appendix:'anexo-i-apendice-3',databook:'caminho-data-book'};
  const dep=DEPENDENCIES.find(d=>d.requires.kind===kinds[key]);
  return Boolean(dep&&catalog&&ruleAvailability({...dep,requires:{...dep.requires,min:'homologado'}},catalog).state==='verificavel');
 }

 // ---- Verificação por registro: nunca "conforme" quando uma verificação aplicável está bloqueada.
 function verification(record,catalog){
  const checks=relevantRules(record).map(d=>ruleAvailability(d,catalog));
  const blocked=checks.filter(c=>c.state==='bloqueada'),ok=checks.filter(c=>c.state==='verificavel');
  const status=!checks.length?'nao-verificado':blocked.length===0?'verificado':ok.length===0?'nao-verificado':'parcial';
  const flagOnly=checks.filter(c=>c.demonstration==='sinalizador').map(c=>({rule:c.rule,field:c.field,reference:c.reference&&c.reference.id,name:c.reference&&c.reference.name}));
  return {status,verified:ok.map(c=>c.rule),flagOnly,blocked:blocked.map(c=>({rule:c.rule,family:c.family,field:c.field,requires:c.requires,blockers:c.blockers,reference:c.reference&&c.reference.id})),checks};
 }
 function groupBlocks(v){ // um bloqueio por referência, listando as regras afetadas (evita repetir o mesmo aviso dezenas de vezes)
  const groups=new Map();
  for(const b of v.blocked)for(const x of b.blockers){const k=[x.code,x.reference,x.revision].join('|');if(!groups.has(k))groups.set(k,{code:x.code,reference:x.reference,revision:x.revision,needed:x.needed,message:x.message,rules:[],fields:new Set()});const g=groups.get(k);g.rules.push(b.rule);g.fields.add(b.field);}
  return [...groups.values()].map(g=>({...g,fields:[...g.fields]}));
 }

 // ---- Matriz de rastreabilidade: regra → documento oficial → revisão → item aplicável → campo → evidência → resultado.
 function traceMatrix(catalog,ruleSources={}){
  return DEPENDENCIES.map(d=>{
   const a=ruleAvailability(d,catalog),ref=a.reference;
   return {rule:d.rule,family:d.family,officialDocument:KINDS[d.requires.kind],revision:a.requires.revision,item:text(ruleSources[d.rule])||d.requires.scope||'',field:d.field,
    evidence:ref?{referenceId:ref.id,level:ref.level,files:ref.files,validated:ref.validated?{by:ref.validated.by,at:ref.validated.at,evidence:ref.validated.evidence}:null,homologated:ref.homologated||null,effective:ref.effective}:null,
    result:a.state==='verificavel'?'verificavel':'bloqueada',demonstration:a.demonstration||'',blockers:a.blockers.map(b=>b.code+': '+b.message)};
  });
 }
 function traceFinding(finding,catalog,ruleSources={}){
  const id=text(finding&&(finding.ruleId||finding.id)),dep=DEPENDENCIES.find(d=>d.rule===id);
  if(!dep)return null;
  const row=traceMatrix({...catalog,entries:catalog.entries},ruleSources).find(r=>r.rule===id);
  return row||null;
 }
 // Linhas planas para exportação (Excel/JSON), mesma fonte do motor.
 function exportRows(catalog){
  return {
   references:[['Identificador','Tipo','Revisão','Nível','Carregado de','Escopos carregados','Arquivos (hash)','Vigência','Prova da vigência','Validado por','Evidência da validação','Homologado por','Bloqueios','Regras que dependem','Demonstração'],
    ...catalog.entries.map(e=>[e.id,KINDS[e.kind]||e.kind,e.revision||'não identificada',e.level,e.loadedFrom,e.loadedScopes.join(', '),e.files.map(f=>f.name+' ['+f.sha256.slice(0,12)+']').join(' | '),e.effective.date,e.effective.proof,e.validated?e.validated.by:'',e.validated?e.validated.evidence:'',e.homologated?e.homologated.by:'',e.blockers.map(b=>b.code).join('; '),e.dependsRules.join(', '),e.demonstration||''])],
   trace:[['Regra','Família','Documento oficial','Revisão','Item/escopo','Campo analisado','Nível da referência','Evidência','Resultado','Bloqueios','Demonstração'],
    ...traceMatrix(catalog).map(r=>[r.rule,r.family,r.officialDocument,r.revision,r.item,r.field,r.evidence?r.evidence.level:'ausente',r.evidence&&r.evidence.validated?r.evidence.validated.evidence:'',r.result==='verificavel'?'Verificável':'BLOQUEADA',r.blockers.join(' | '),r.demonstration||''])]
  };
 }
 // Registros do servidor (tabela de validações/homologações) → opções do catálogo. Só o que tem responsável, data e evidência entra.
 function fromRecords(records){
  const date=v=>{const m=text(v).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'/'+m[2]+'/'+m[1]:text(v);};
  const validations=[],homologations=[];
  for(const r of Array.isArray(records)?records:[]){
   if(!r||!KINDS[r.kind]||!text(r.responsible)||!text(r.evidence)||!text(r.validated_on||r.validatedOn))continue;
   const base={id:r.id,kind:r.kind,revision:text(r.revision),by:text(r.responsible),at:date(r.validated_on||r.validatedOn),createdAt:text(r.created_at||r.createdAt),evidence:text(r.evidence),...(text(r.sha256)?{sha256:text(r.sha256)}:{})};
   if(r.record_type==='homologacao'||r.recordType==='homologacao')homologations.push(base);
   else validations.push({...base,sha256:text(r.sha256),origin:'registro',...(text(r.effective_date||r.effectiveDate)&&text(r.effective_evidence||r.effectiveEvidence)?{effective:{date:text(r.effective_date||r.effectiveDate),evidence:text(r.effective_evidence||r.effectiveEvidence)}}:{})});
  }
  return {validations,homologations};
 }
 return Object.freeze({VERSION,LEVELS,KINDS,BUILT_IN,fromRecords,DEPENDENCIES,classifyFile,buildCatalog,ruleAvailability,approved,relevantRules,verification,groupBlocks,traceMatrix,traceFinding,exportRows,rank});
});
