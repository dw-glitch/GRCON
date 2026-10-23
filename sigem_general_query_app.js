(function(root){
 'use strict';
 const C=()=>root.GrconPostingConference;
 const fields=[['document','Documento'],['revision','Revisão'],['title','Título'],['status','Status SIGEM'],['discipline','Disciplina'],['documentType','Tipo de documento'],['situation','Situação'],['modifiedAt','Modificado em'],['includedAt','Incluído em'],['observation','Observação'],['sourceRow','Linha da planilha']];
 const state={records:[],base:null,page:0,scope:'',index:new Map(),visible:[],error:''};let shell,timer,epoch=0;
 const scope=()=>JSON.stringify([root.GrconCloud?.state?.session?.user?.id||'',root.GrconCloud?.state?.membership?.workspace_id||'']);
 const key=v=>String(v??'').trim().toLocaleUpperCase('pt-BR');
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const el=id=>shell?.querySelector('#'+id);
 function ensure(){
  if(shell)return;
  shell=document.createElement('section');shell.id='sigem-general-query-module';shell.hidden=true;shell.className='posting-conference-module';shell.setAttribute('role','tabpanel');shell.setAttribute('aria-label','Consulta Geral SIGEM');
  shell.innerHTML='<header class="pc-heading"><div><span>BASE COMPLETA DO SIGEM</span><h2>Consultar Consulta Geral</h2><p>Todos os documentos da base enviada, incluindo os anteriores ao GRCON.</p></div><div class="pc-heading-actions"><button id="sgq-back" class="secondary-button" type="button">Voltar à Conferência</button><button id="sgq-refresh" class="secondary-button" type="button">Atualizar consulta</button><button id="sgq-export" class="secondary-button" type="button">Exportar resultado</button></div></header><p id="sgq-source" role="status"></p><p id="sgq-error" role="alert"></p><section class="pc-toolbar-card"><div class="pc-filters"><label>Código do documento<input id="sgq-code" type="search" placeholder="Digite o código completo" autocomplete="off"></label><label>Correspondência<select id="sgq-mode"><option value="exact">Código exato</option><option value="contains">Contém o texto</option></select></label><label>Título<input id="sgq-title" type="search" placeholder="Pesquisar no título"></label><label>Revisão<input id="sgq-revision" type="search" placeholder="Todas"></label><label>Status SIGEM<select id="sgq-status"><option value="">Todos</option></select></label><button id="sgq-clear" type="button" class="secondary-button">Limpar filtros</button></div></section><section class="pc-table-card"><header><strong id="sgq-count"></strong></header><div class="pc-table-wrap"><table class="pc-table sgq-table"><thead><tr><th>Documento</th><th>Revisão</th><th>Título</th><th>Status SIGEM</th><th>Disciplina</th><th>Detalhes</th></tr></thead><tbody id="sgq-body"></tbody></table></div><div class="pc-pagination"><button id="sgq-prev" type="button" class="secondary-button">Anterior</button><span id="sgq-page"></span><button id="sgq-next" type="button" class="secondary-button">Próxima</button></div></section>';
  document.querySelector('main.workspace').appendChild(shell);
  for(const id of ['sgq-code','sgq-title','sgq-revision'])el(id).addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{state.page=0;filter();},180);});
  for(const id of ['sgq-mode','sgq-status'])el(id).addEventListener('change',()=>{state.page=0;filter();});
  el('sgq-clear').onclick=()=>{for(const id of ['sgq-code','sgq-title','sgq-revision','sgq-status'])el(id).value='';el('sgq-mode').value='exact';state.page=0;filter();};
  el('sgq-prev').onclick=()=>{state.page--;render();};el('sgq-next').onclick=()=>{state.page++;render();};
  el('sgq-back').onclick=()=>root.GrconPostingConferenceNavigation.open();
  el('sgq-refresh').onclick=()=>void refresh(true);
  el('sgq-export').onclick=()=>void exportResult();
  el('sgq-body').onclick=e=>{const button=e.target.closest('[data-sgq-detail]');if(button)detail(state.visible[Number(button.dataset.sgqDetail)]);};
 }
 function adopt(){
  const base=root.GrconSharedSigemQuery?.current();state.base=base||null;state.scope=scope();state.records=Array.isArray(base?.records)?base.records:[];state.index=new Map();
  state.records.forEach(row=>{const k=key(row.document);if(!state.index.has(k))state.index.set(k,[]);state.index.get(k).push(row);});
  const selected=el('sgq-status').value;el('sgq-status').innerHTML='<option value="">Todos</option>'+[...new Set(state.records.map(r=>String(r.status||'')))].filter(Boolean).sort((a,b)=>a.localeCompare(b,'pt-BR')).map(s=>'<option>'+escape(s)+'</option>').join('');el('sgq-status').value=selected;state.page=0;filter();
 }
 function filter(){
  const code=key(el('sgq-code').value),title=C().norm(el('sgq-title').value),revision=key(el('sgq-revision').value),status=el('sgq-status').value;
  const exact=el('sgq-mode').value==='exact';const source=code&&exact?(state.index.get(code)||[]):state.records;
  state.visible=source.filter(r=>(!code||exact||key(r.document).includes(code))&&(!title||C().norm(r.title).includes(title))&&(!revision||key(r.revision)===revision)&&(!status||r.status===status));render();
 }
 function render(){
  const meta=state.base?.meta||{};el('sgq-error').textContent=state.error;
  el('sgq-source').textContent=state.base?'Fonte: '+(meta.fileName||'Consulta Geral')+' · Data de referência: '+(meta.referenceDate||'não informada')+' · '+state.records.length.toLocaleString('pt-BR')+' registros'+(root.GrconSharedSigemQuery?.state?.stale?' · Base em cache; atualização pendente.':''):'Nenhuma Consulta Geral disponível. Envie ou publique a base na Conferência.';
  const pages=Math.max(1,Math.ceil(state.visible.length/50));state.page=Math.max(0,Math.min(state.page,pages-1));
  el('sgq-count').textContent=state.visible.length.toLocaleString('pt-BR')+' registros encontrados · '+new Set(state.visible.map(r=>key(r.document))).size.toLocaleString('pt-BR')+' documentos';
  el('sgq-body').innerHTML=state.visible.slice(state.page*50,state.page*50+50).map((r,i)=>'<tr><td>'+escape(r.document)+'</td><td>'+escape(r.revision||'—')+'</td><td>'+escape(r.title||'—')+'</td><td>'+escape(r.status||'Status não informado')+'</td><td>'+escape(r.discipline||'—')+'</td><td><button class="pc-link" type="button" data-sgq-detail="'+(state.page*50+i)+'">Ver dados da linha</button></td></tr>').join('')||'<tr><td colspan="6">Nenhum documento corresponde aos filtros nesta base. Isso não comprova ausência em outra versão da Consulta Geral.</td></tr>';
  el('sgq-prev').disabled=state.page===0;el('sgq-next').disabled=state.page+1>=pages;el('sgq-export').disabled=!state.visible.length;el('sgq-page').textContent='Página '+(state.page+1)+' de '+pages;
 }
 function detail(row){
  if(!row)return;const dialog=document.createElement('dialog');dialog.className='pc-task-dialog';dialog.innerHTML='<h3>Dados da Consulta Geral</h3><dl>'+fields.map(([f,label])=>'<dt>'+label+'</dt><dd>'+escape(row[f]||'—')+'</dd>').join('')+'</dl><button type="button">Fechar</button>';dialog.dataset.sgqScope=scope();document.body.appendChild(dialog);dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
 }
 async function refresh(force){
  const identity=scope(),ticket=++epoch;el('sgq-refresh').disabled=true;state.error='';
  try{const query=root.GrconSharedSigemQuery;if(force&&query?.refreshLatest)await query.refreshLatest();else await query?.refresh();if(ticket!==epoch||identity!==scope())return;adopt();}
  catch(error){if(ticket===epoch&&identity===scope()){state.error=error.message||'Não foi possível atualizar a base.';render();}}
  finally{if(ticket===epoch)el('sgq-refresh').disabled=false;}
 }
 async function open(){
  ensure();document.querySelectorAll('main.workspace > section').forEach(section=>{section.hidden=section!==shell;});shell.hidden=false;document.title='GRCON — Consulta Geral SIGEM';const label=document.getElementById('brand-subtitle');if(label)label.textContent='Consulta Geral SIGEM';
  if(state.scope!==scope())reset();adopt();await refresh(false);if(!shell.hidden)el('sgq-code').focus();
 }
 async function exportResult(){
  const identity=scope(),rows=state.visible.map(r=>({...r}));const button=el('sgq-export');button.disabled=true;
  try{await root.GRCONModuleLoader.ensure('xlsx');if(identity!==scope())return;const data=rows.map(r=>Object.fromEntries(fields.map(([f,label])=>[label,r[f]??''])));const workbook=root.XLSX.utils.book_new();root.XLSX.utils.book_append_sheet(workbook,root.XLSX.utils.json_to_sheet(data),'Consulta Geral');const bytes=root.XLSX.write(workbook,{type:'array',bookType:'xlsx'});const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download='GRCON_Consulta_Geral_Filtrada.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  catch(error){state.error=error.message;render();}finally{if(identity===scope())button.disabled=!state.visible.length;}
 }
 function reset(){epoch++;clearTimeout(timer);state.records=[];state.base=null;state.visible=[];state.index=new Map();state.scope=scope();state.error='';if(shell){for(const id of ['sgq-code','sgq-title','sgq-revision','sgq-status'])el(id).value='';el('sgq-mode').value='exact';el('sgq-refresh').disabled=false;render();}document.querySelectorAll('dialog[data-sgq-scope]').forEach(d=>d.close());}
 for(const event of ['grcon:contract-context-changed','grcon:cloud-signed-out'])root.addEventListener(event,reset);
 root.addEventListener('grcon:shared-sigem-updated',()=>{if(shell&&!shell.hidden){if(state.scope!==scope())reset();adopt();}});
 root.GrconGeneralQueryUi=Object.freeze({open,refresh,state});
})(window);
