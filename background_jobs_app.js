(function(root){
 'use strict';
 const cloud=()=>root.GrconCloud, $=s=>document.querySelector(s), master=()=>Boolean(cloud()?.isMasterOwner?.());
 const completedImports=new Set();
 const state={jobs:[],open:false,technical:false,ticket:0,timer:null};
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={uploading:'Recebendo dados',queued:'Na fila',running:'Em andamento',retry_wait:'Nova tentativa agendada',succeeded:'Concluída',failed:'Falhou',needs_review:'Conferir entrega',cancelled:'Cancelada'};
 const notify=(text,kind='info')=>root.GrconNotify?.(text,kind);
 function context(){return `${cloud()?.state?.session?.user?.id||''}:${cloud()?.state?.membership?.workspace_id||''}`;}
 async function api(action,{method='GET',data,id,bodyText,metadata}={}){
  const client=cloud()?.state?.client;if(!client)throw new Error('Entre no GRCON para continuar.');
  const identity=context(),workspace=cloud().state.membership?.workspace_id;
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
   $('#grcon-tasks-shortcut')?.remove();$('#grcon-technical-shortcut')?.remove();$('#grcon-jobs-dialog')?.close();$('#grcon-jobs-dialog')?.remove();state.open=false;state.jobs=[];return;
  }
  install();if(!$('#grcon-tasks-shortcut'))return;
  if(master()&&!$('#grcon-technical-shortcut')){
   const button=document.createElement('button');button.id='grcon-technical-shortcut';button.type='button';button.className='secondary-button compact';button.textContent='Painel técnico';$('#grcon-tasks-shortcut').after(button);button.addEventListener('click',()=>void open(true));
  }
  if(!master()){$('#grcon-technical-shortcut')?.remove();if(state.technical){state.open=false;$('#grcon-jobs-content')?.replaceChildren();$('#grcon-jobs-dialog')?.close();state.technical=false;}}
  if(state.open)void refresh();
 }
 function install(){
  if($('#grcon-tasks-shortcut'))return;
  const host=$('.runtime-status');if(!host)return;
  const button=document.createElement('button');button.id='grcon-tasks-shortcut';button.type='button';button.className='secondary-button compact';button.textContent='Tarefas';host.insertBefore(button,$('#grcon-cloud-account'));button.addEventListener('click',()=>void open(false));
  document.body.insertAdjacentHTML('beforeend','<dialog id="grcon-jobs-dialog" aria-labelledby="grcon-jobs-title"><header><div><h2 id="grcon-jobs-title">Tarefas em segundo plano</h2><p id="grcon-jobs-help"></p></div><button type="button" data-jobs-close>Voltar ao GRCON</button></header><div class="grcon-jobs-actions"><button type="button" data-jobs-refresh>Atualizar</button><span id="grcon-jobs-feedback" role="status" aria-live="polite"></span></div><div id="grcon-jobs-content"></div></dialog>');
  const dialog=$('#grcon-jobs-dialog');dialog.addEventListener('close',()=>{if(dialog.open)return;state.open=false;state.ticket++;clearTimeout(state.timer);$('#grcon-jobs-content')?.replaceChildren();});
  dialog.addEventListener('click',event=>{
   if(event.target.closest('[data-jobs-close]'))dialog.close();
   if(event.target.closest('[data-jobs-refresh]'))void refresh();
   const download=event.target.closest('[data-job-download]'),retry=event.target.closest('[data-job-retry]');
   if(download)void downloadJob(download.dataset.jobDownload);
   if(retry)void api('retry',{method:'POST',id:retry.dataset.jobRetry}).then(()=>refresh()).catch(error=>notify(error.message,'error'));
  });
 }
 async function open(technical=false){
  if(technical&&!await cloud()?.refreshMasterOwner?.()){permissions();return;}
  install();if(!$('#grcon-jobs-dialog'))return;state.open=true;state.technical=technical;
  $('#grcon-jobs-title').textContent=technical?'Painel técnico do proprietário master':'Tarefas em segundo plano';
  $('#grcon-jobs-help').textContent=technical?'Saúde dos serviços, processamento e falhas. Acesso exclusivo do proprietário master.':'As tarefas continuam no servidor após fechar esta tela ou o navegador. Os resultados permanecem disponíveis aqui.';
  $('#grcon-jobs-dialog').showModal();await refresh();
 }
 function table(jobs){
  return jobs.length?'<div class="grcon-jobs-table"><table><thead><tr><th>Tarefa</th><th>Andamento</th><th>Situação</th><th>Atualização</th><th>Ações</th></tr></thead><tbody>'+jobs.map(j=>'<tr><td><strong>'+escape(j.title)+'</strong>'+(state.technical?'<small>Contrato '+escape(j.workspace_id)+'</small>':'')+'</td><td><progress max="100" value="'+Number(j.progress||0)+'" aria-label="Andamento da tarefa"></progress><small>'+escape(j.stage)+'</small></td><td><span class="grcon-job-state" data-status="'+escape(j.status)+'">'+escape(labels[j.status]||j.status)+'</span><small>'+Number(j.attempts||0)+' tentativa(s)</small>'+(j.error_code?'<small>'+escape(j.error_code)+'</small>':'')+'</td><td>'+escape(new Date(j.updated_at).toLocaleString('pt-BR'))+'</td><td>'+(j.status==='succeeded'&&j.output_name?'<button type="button" data-job-download="'+escape(j.id)+'">Baixar resultado</button>':'')+(j.status==='failed'&&j.error_code!=='UPLOAD_INCOMPLETE'?'<button type="button" data-job-retry="'+escape(j.id)+'">Tentar novamente</button>':'')+(j.status==='needs_review'?'<small>Confira o Teams antes de iniciar outro envio.</small>':'')+'</td></tr>').join('')+'</tbody></table></div>':'<p>Nenhuma tarefa neste contrato.</p>';
 }
 function technical(data){
  const services=data.services||{},metrics=data.metrics||[];
  const serviceCards=[['Processamento',services.workflows],['Armazenamento',services.r2],['Banco',services.supabase],['Teams configurado',services.teamsConfigured]];
  const heartbeat=data.scheduler?new Date(data.scheduler):null,late=!heartbeat||Date.now()-heartbeat.getTime()>5*60000;
  return '<div class="grcon-jobs-kpis">'+serviceCards.map(([label,ok])=>'<article><small>'+label+'</small><strong>'+ (ok?'Disponível':'Requer atenção')+'</strong></article>').join('')+'<article><small>Agendador</small><strong>'+(late?'Verificar execução':'Ativo')+'</strong><small>'+escape(heartbeat?heartbeat.toLocaleString('pt-BR'):'Sem execução registrada')+'</small></article></div><h3>APIs nas últimas 24 horas</h3><p>Chamadas das APIs do GRCON; não inclui arquivos estáticos nem consultas diretas ao Supabase.</p><div class="grcon-jobs-table"><table><thead><tr><th>Serviço</th><th>Requisições</th><th>Falhas</th><th>Tempo médio</th><th>Maior tempo</th></tr></thead><tbody>'+metrics.map(m=>'<tr><td>'+escape({vault:'Cofre',teams:'Teams',jobs:'Tarefas',other:'Outras APIs'}[m.route]||m.route)+'</td><td>'+Number(m.requests)+'</td><td>'+Number(m.errors)+'</td><td>'+Number(m.average_ms)+' ms</td><td>'+Number(m.max_ms)+' ms</td></tr>').join('')+'</tbody></table></div><h3>Tarefas recentes de todos os contratos</h3>'+table(data.jobs||[]);
 }
 async function refresh(){
  clearTimeout(state.timer);if(!state.open||state.technical&&!master())return;
  const ticket=++state.ticket,identity=context();$('#grcon-jobs-feedback').textContent='Atualizando…';
  try{
   const result=await api(state.technical?'technical':'list');
   if(ticket!==state.ticket||identity!==context()||!state.open||state.technical&&!master())return;
   state.jobs=result.jobs||[];$('#grcon-jobs-content').innerHTML=state.technical?technical(result):table(state.jobs);$('#grcon-jobs-feedback').textContent='Atualizado agora';
   if(state.jobs.some(j=>!['succeeded','failed','needs_review','cancelled'].includes(j.status))||state.technical)state.timer=setTimeout(()=>void refresh(),8000);
   for(const job of state.jobs.filter(j=>j.kind==='sigem_import'&&j.status==='succeeded'&&!completedImports.has(j.id))){completedImports.add(job.id);void root.GrconSharedSigemQuery?.refreshLatest?.();}
  }catch(error){if(ticket===state.ticket&&state.open)$('#grcon-jobs-feedback').textContent=error.message;}
 }
 async function submit(kind,data,key=root.crypto.randomUUID()){
  const workspaceId=cloud()?.state?.membership?.workspace_id;if(!workspaceId)throw new Error('Conecte-se ao contrato para criar a tarefa.');
  await(root.GrconOperations?.paint?.()||new Promise(resolve=>setTimeout(resolve,0)));
  const identity=context(),bodyText=JSON.stringify(data);
  const fingerprint=Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(bodyText))),b=>b.toString(16).padStart(2,'0')).join('');
  if(identity!==context())throw new Error('O contrato mudou antes do envio da tarefa.');
  const result=await api('submit',{method:'POST',bodyText,metadata:{'x-grcon-kind':kind,'x-grcon-key':key,'x-grcon-fingerprint':fingerprint}});
  notify('Tarefa recebida. Você pode continuar trabalhando e acompanhar em Tarefas.','success');
  if(state.open&&!state.technical)void refresh();return result.job;
 }
 async function downloadJob(id){
  try{const blob=await api('download',{id}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=state.jobs.find(j=>j.id===id)?.output_name||'GRCON_Resultado.xlsx';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(error){notify(error.message,'error');}
 }
 for(const event of ['grcon:cloud-ready','grcon:cloud-signed-out','grcon:permissions-changed','grcon:contract-context-changed'])root.addEventListener(event,permissions);
 root.GrconBackgroundJobs=Object.freeze({submit,open,refresh,state});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',permissions,{once:true});else permissions();
})(window);
