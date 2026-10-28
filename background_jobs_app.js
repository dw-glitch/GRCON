(function(root){
 'use strict';
 const cloud=()=>root.GrconCloud, $=s=>document.querySelector(s), master=()=>Boolean(cloud()?.isMasterOwner?.());
 const completedImports=new Set();
 const state={jobs:[],open:false,technical:false,ticket:0,timer:null,embedded:false,workspace:null};
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={uploading:'Recebendo dados',queued:'Na fila',running:'Em andamento',retry_wait:'Nova tentativa agendada',succeeded:'Concluída',failed:'Falhou',needs_review:'Conferir entrega',cancelled:'Cancelada'};
 const notify=(text,kind='info')=>root.GrconNotify?.(text,kind);
 function context(){return `${cloud()?.state?.session?.user?.id||''}:${cloud()?.state?.membership?.workspace_id||''}`;}
 function available(){return Boolean(cloud()?.state?.session?.user?.id&&cloud()?.state?.membership?.workspace_id&&cloud()?.state?.client?.auth?.getSession&&cloud()?.state?.online!==false);}
 async function api(action,{method='GET',data,id,bodyText,metadata}={}){
  const client=cloud()?.state?.client;if(!client)throw new Error('Entre no GRCON para continuar.');
  const identity=context(),workspace=(action!=='submit'&&state.workspace)||cloud().state.membership?.workspace_id;
  const {data:sessionData,error}=await client.auth.getSession();
  const token=sessionData?.session?.access_token;
  if(error||!token||identity!==context())throw new Error('A sessão mudou. Entre novamente.');
  const params=new URLSearchParams({workspace:workspace||''});if(id)params.set('id',id);
  const response=await fetch('/api/background-jobs/'+action+'?'+params,{method,headers:{Authorization:`Bearer ${token}`,...(data||bodyText?{'content-type':'application/json'}:{}),...(metadata||{})},body:bodyText||(data?JSON.stringify(data):undefined)});
  if(identity!==context())throw new Error('O contrato ou usuário mudou durante a operação.');
  if(action==='download'&&response.ok)return response.blob();
  const result=await response.json().catch(()=>({}));if(!response.ok||!result.ok)throw new Error(result.message||'Não foi possível consultar as tarefas.');return result;
 }
 function permissions(){
  state.ticket++;clearTimeout(state.timer);
  if(!cloud()?.state?.session?.user?.id||!cloud()?.state?.membership?.workspace_id){
   unmount();$('#grcon-tasks-shortcut')?.remove();$('#grcon-technical-shortcut')?.remove();$('#grcon-jobs-dialog')?.close();$('#grcon-jobs-dialog')?.remove();return;
  }
  install();
  $('#grcon-technical-shortcut')?.remove();
  if(!$('#grcon-tasks-shortcut')){
   const host=$('.runtime-status');if(host){const button=document.createElement('button');button.id='grcon-tasks-shortcut';button.type='button';button.className='secondary-button compact';button.textContent='Tarefas';host.insertBefore(button,$('#grcon-cloud-account'));button.addEventListener('click',()=>void open(false));}
  }
  if(!master()&&(state.technical||state.embedded)){unmount();$('#grcon-jobs-dialog')?.close();}
  if(state.open)void refresh();
 }
 function install(){
  if($('#grcon-jobs-dialog'))return;
  document.body.insertAdjacentHTML('beforeend','<dialog id="grcon-jobs-dialog" aria-labelledby="grcon-jobs-title"><header><div><h2 id="grcon-jobs-title">Tarefas em segundo plano</h2><p id="grcon-jobs-help"></p></div><button type="button" data-jobs-close>Voltar ao GRCON</button></header><div id="grcon-jobs-view"><div class="grcon-jobs-actions"><button type="button" data-jobs-refresh>Atualizar</button><span id="grcon-jobs-feedback" role="status" aria-live="polite"></span></div><div id="grcon-jobs-content"></div></div></dialog>');
  const dialog=$('#grcon-jobs-dialog');dialog.addEventListener('close',()=>{if(!dialog.open&&!state.embedded)unmount();});
  dialog.querySelector('[data-jobs-close]').addEventListener('click',()=>dialog.close());
  $('#grcon-jobs-view').addEventListener('click',event=>{
   if(event.target.closest('[data-jobs-refresh]'))void refresh();
   if(event.target.closest('[data-client-diagnostics-download]')&&master())try{root.GrconClientDiagnostics?.download();}catch(error){notify(error.message,'error');}
   const download=event.target.closest('[data-job-download]'),retry=event.target.closest('[data-job-retry]');
   if(download)void downloadJob(download.dataset.jobDownload);
   if(retry)void api('retry',{method:'POST',id:retry.dataset.jobRetry}).then(()=>refresh()).catch(error=>notify(error.message,'error'));
  });
 }
 function unmount(){
  state.open=false;state.ticket++;clearTimeout(state.timer);state.timer=null;
  state.jobs=[];state.embedded=false;state.workspace=null;state.technical=false;
  $('#grcon-jobs-content')?.replaceChildren();
  if($('#grcon-jobs-view'))$('#grcon-jobs-dialog')?.append($('#grcon-jobs-view'));
 }
 function mount(container,{technical=false,workspace=null}={}){
  if(!master()||!container?.isConnected)return;
  install();unmount();$('#grcon-jobs-dialog').close();
  container.append($('#grcon-jobs-view'));state.open=true;state.embedded=true;state.technical=technical;state.workspace=workspace;
  void refresh();
 }
 async function open(technical=false){
  if(technical){
   if(master())return root.GrconAdministration?.open('technical');
   permissions();return;
  }
  install();if(!$('#grcon-jobs-dialog'))return;unmount();state.open=true;
  $('#grcon-jobs-title').textContent='Tarefas em segundo plano';
  $('#grcon-jobs-help').textContent='As tarefas continuam no servidor após fechar esta tela ou o navegador. Os resultados permanecem disponíveis aqui.';
  $('#grcon-jobs-dialog').showModal();await refresh();
 }
 function table(jobs){
  return jobs.length?'<div class="grcon-jobs-table"><table><thead><tr><th>Tarefa</th><th>Andamento</th><th>Situação</th><th>Atualização</th><th>Ações</th></tr></thead><tbody>'+jobs.map(j=>'<tr><td><strong>'+escape(j.title)+'</strong>'+(state.technical?'<small>Contrato '+escape(j.workspace_id)+'</small>':'')+'</td><td><progress max="100" value="'+Number(j.progress||0)+'" aria-label="Andamento da tarefa"></progress><small>'+escape(j.stage)+'</small></td><td><span class="grcon-job-state" data-status="'+escape(j.status)+'">'+escape(labels[j.status]||j.status)+'</span><small>'+Number(j.attempts||0)+' tentativa(s)</small>'+(j.error_code?'<small>'+escape(j.error_code)+'</small>':'')+'</td><td>'+escape(new Date(j.updated_at).toLocaleString('pt-BR'))+'</td><td>'+(j.status==='succeeded'&&j.output_name?'<button type="button" data-job-download="'+escape(j.id)+'">Baixar resultado</button>':'')+(j.status==='failed'&&j.error_code!=='UPLOAD_INCOMPLETE'?'<button type="button" data-job-retry="'+escape(j.id)+'">Tentar novamente</button>':'')+(j.status==='needs_review'?'<small>Confira o Teams antes de iniciar outro envio.</small>':'')+'</td></tr>').join('')+'</tbody></table></div>':'<p>Nenhuma tarefa neste contrato.</p>';
 }
 function clientDiagnostics(){
  if(!master()||!root.GrconClientDiagnostics)return '';
  const data=root.GrconClientDiagnostics.snapshot();
  return '<details data-client-diagnostics><summary>Navegador e chamadas diretas ao banco</summary><p>Amostra desta aba, limitada às últimas '+data.sampleLimit+' chamadas. Status não informado pelo navegador não conta como falha.</p><div class="grcon-jobs-table"><table><thead><tr><th>Categoria</th><th>Chamadas</th><th>Erros HTTP</th><th>Status desconhecido</th><th>Média</th><th>P95</th><th>Máximo</th></tr></thead><tbody>'+data.requests.map(row=>'<tr><td>'+escape(row.category)+'</td><td>'+row.count+'</td><td>'+row.httpErrors+'</td><td>'+row.unknownStatus+'</td><td>'+row.averageMs+' ms</td><td>'+row.p95Ms+' ms</td><td>'+row.maxMs+' ms</td></tr>').join('')+'</tbody></table></div><p>'+data.longTasks.count+' tarefa(s) longa(s) do navegador · P95 '+data.longTasks.p95Ms+' ms. Armazenamento local: '+(data.persistence.ready?'pronto':data.persistence.degraded?'degradado':'não verificado')+'.</p><button type="button" data-client-diagnostics-download>Baixar diagnóstico desta aba</button></details>';
 }
 function technical(data){
  const services=data.services||{},metrics=data.metrics||[];
  const serviceCards=[['Processamento',services.workflows],['Armazenamento',services.r2],['Banco',services.supabase],['Teams configurado',services.teamsConfigured]];
  const heartbeat=data.scheduler?new Date(data.scheduler):null,late=!heartbeat||Date.now()-heartbeat.getTime()>5*60000;
  return '<div class="grcon-jobs-kpis">'+serviceCards.map(([label,ok])=>'<article><small>'+label+'</small><strong>'+ (ok?'Disponível':'Requer atenção')+'</strong></article>').join('')+'<article><small>Agendador</small><strong>'+(late?'Verificar execução':'Ativo')+'</strong><small>'+escape(heartbeat?heartbeat.toLocaleString('pt-BR'):'Sem execução registrada')+'</small></article></div><h3>APIs nas últimas 24 horas</h3><p>Chamadas das APIs do GRCON; não inclui arquivos estáticos nem consultas diretas ao Supabase.</p><div class="grcon-jobs-table"><table><thead><tr><th>Serviço</th><th>Requisições</th><th>Falhas</th><th>Tempo médio</th><th>Maior tempo</th></tr></thead><tbody>'+metrics.filter(m=>m.route!=='vault').map(m=>'<tr><td>'+escape({teams:'Teams',jobs:'Tarefas',other:'Outras APIs'}[m.route]||m.route)+'</td><td>'+Number(m.requests)+'</td><td>'+Number(m.errors)+'</td><td>'+Number(m.average_ms)+' ms</td><td>'+Number(m.max_ms)+' ms</td></tr>').join('')+'</tbody></table></div>'+clientDiagnostics()+'<h3>Tarefas recentes de todos os contratos</h3>'+table(data.jobs||[]);
 }
 async function refresh(){
  clearTimeout(state.timer);if(!state.open||state.technical&&!master())return;
  const ticket=++state.ticket,identity=context();$('#grcon-jobs-feedback').textContent='Atualizando…';
  try{
   const result=await api(state.technical?'technical':'list');
   if(ticket!==state.ticket||identity!==context()||!state.open||(state.technical||state.embedded)&&!master())return;
   const clientOpen=Boolean($('#grcon-jobs-content [data-client-diagnostics]')?.open);
   state.jobs=result.jobs||[];$('#grcon-jobs-content').innerHTML=state.technical?technical(result):table(state.jobs);if(clientOpen&&$('[data-client-diagnostics]'))$('[data-client-diagnostics]').open=true;$('#grcon-jobs-feedback').textContent='Atualizado agora';
   if(state.jobs.some(j=>!['succeeded','failed','needs_review','cancelled'].includes(j.status))||state.technical)state.timer=setTimeout(()=>void refresh(),8000);
   for(const job of state.jobs.filter(j=>j.kind==='sigem_import'&&j.status==='succeeded'&&!completedImports.has(j.id))){completedImports.add(job.id);const query=root.GrconSharedSigemQuery;void(query?.completeBackgroundPublication?.()||query?.refreshLatest?.())?.catch(()=>{});}
  }catch(error){if(ticket===state.ticket&&state.open)$('#grcon-jobs-feedback').textContent=error.message;}
 }
 async function submit(kind,data,key=root.crypto.randomUUID()){
  const workspaceId=cloud()?.state?.membership?.workspace_id;if(!workspaceId)throw new Error('Conecte-se ao contrato para criar a tarefa.');
  await(root.GrconOperations?.paint?.()||new Promise(resolve=>setTimeout(resolve,0)));
  const identity=context();
  if(kind==='sigem_import'){
   const checksum=Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data.records)))),b=>b.toString(16).padStart(2,'0')).join('');
   data={...data,meta:{...data.meta,checksum}};key=`sigem:${checksum}:${data.meta.importedAt||''}`;
  }
  const bodyText=JSON.stringify(data);
  const fingerprint=Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(bodyText))),b=>b.toString(16).padStart(2,'0')).join('');
  if(identity!==context())throw new Error('O contrato mudou antes do envio da tarefa.');
  const result=await api('submit',{method:'POST',bodyText,metadata:{'x-grcon-kind':kind,'x-grcon-key':key,'x-grcon-fingerprint':fingerprint}});
  notify('Tarefa recebida. Você pode continuar trabalhando e acompanhar em Tarefas.','success');
  if(state.open&&!state.technical)void refresh();return result.job;
 }
 async function downloadJob(id){
  try{const blob=await api('download',{id}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=state.jobs.find(j=>j.id===id)?.output_name||'GRCON_Resultado.xlsx';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(error){notify(error.message,'error');}
 }
 for(const event of ['grcon:cloud-ready','grcon:cloud-signed-out','grcon:permissions-changed','grcon:contract-context-changed'])root.addEventListener(event,()=>{if(event==='grcon:contract-context-changed')unmount();permissions();});
 root.GrconBackgroundJobs=Object.freeze({submit,open,refresh,mount,unmount,available,state});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',permissions,{once:true});else permissions();
})(window);
