(function(root) {
  "use strict";
  const text = value => String(value ?? "");
  const esc = value => text(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const identity = value => root.GrconSigemPwDashboard?.documentIdentity?.(value)?.key || text(value).trim().replace(/\s+/g,'').toUpperCase().replace(/^NT-/, '');
  let epoch = 0, searchTicket = 0, searchTimer, pwIndex = null, pwBase = null, opener = null;
  const api = () => root.GrconDocumentVault;
  const sections = [
    ['sigem','Consulta Geral / SIGEM'],['pw','ProjectWise'],['history','GRDT / eGRDT'],
    ['vault','Arquivos no Cofre'],['requests','Controle de Solicitações'],['monitor','Meu monitoramento'],['monitorChanges','Últimas mudanças monitoradas'],['audit','Auditoria'],
  ];
  function status(message, error) {
    const target = document.getElementById('master-status');
    target.textContent = message; target.classList.toggle('error', Boolean(error));
  }
  function table(rows, columns) {
    if (!rows?.length) return '<p class="master-empty">Sem registros nesta fonte.</p>';
    return '<div class="vault-table-wrap"><table><thead><tr>' + columns.map(c=>'<th>'+esc(c[0])+'</th>').join('') + '</tr></thead><tbody>' + rows.map(row=>'<tr>'+columns.map(c=>'<td>'+esc(typeof c[1]==='function'?c[1](row):row[c[1]])+'</td>').join('')+'</tr>').join('') + '</tbody></table></div>';
  }
  async function currentPw() {
    const scope=epoch;
    if (pwBase) return pwBase;
    if (!root.GrconSigemPwDashboard) await root.GRCONModuleLoader?.ensure('sigem_pw_dashboard_core.js');
    const base = root.GrconSigemPwDashboardUi?.state?.pw;
    const source = base?.meta ? base : await root.GrconSigemPwDashboard?.kvGet(root.GrconSigemPwDashboard.PW_BASE_KEY, null);
    if(scope!==epoch)return null;
    if (source !== pwBase) {
      pwBase = source; pwIndex = new Map();
      for (const row of source?.records || []) {
        const key = identity(row.document); if (!pwIndex.has(key)) pwIndex.set(key, []);
        pwIndex.get(key).push(row);
      }
    }
    return source;
  }
  async function downloadFile(id, name) {
    try {
      const blob = await api().download({id});
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name || 'documento'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),30000);
    } catch(error) { status(error.message || 'Arquivo indisponível.',true); }
  }
  function filesMarkup(files) {
    return table(files,[['Arquivo','file_name'],['Revisão','revision'],['Versão','file_version'],['Situação',r=>r.is_active?'Atual':'Histórica'],['Bytes','size_bytes'],['SHA-256','sha256'],['eGRDT',r=>(r.emissions||[]).map(e=>e.egrdt_number).join(' / ')]]) +
      '<div class="master-file-actions">'+(files||[]).map(f=>'<button type="button" class="secondary-button" data-master-download="'+esc(f.id)+'" data-master-name="'+esc(f.file_name)+'">Baixar versão '+esc(f.file_version||1)+' · '+esc(f.file_name)+'</button>').join('')+'</div>';
  }
  async function showDocument(code) {
    const ticket = ++searchTicket, scope = epoch;
    document.getElementById('master-query').value = code;
    document.getElementById('master-results').innerHTML = '';
    status('Consultando fontes do documento…');
    const results = await Promise.allSettled([api().request('/master?code='+encodeURIComponent(code)),currentPw()]);
    if (ticket !== searchTicket || scope !== epoch) return;
    const remote = results[0].status==='fulfilled' ? results[0].value : {};
    const pw = results[1].status==='fulfilled' ? (pwIndex?.get(identity(code)) || []) : null;
    const columns = {
      sigem:[['Código','document'],['Revisão','revision'],['Status','status'],['Título','title'],['Data',r=>r.date||r.updatedAt||'']],
      pw:[['Código','document'],['Revisão','revision'],['Workflow',r=>r.status||r.workflow||''],['Última emissão',r=>r.lastEmission||r.emissionFlag||''],['Databook',r=>r.databook||r.eap||'']],
      history:[['eGRDT','egrdt_number'],['Data','generated_at'],['Revisão',r=>r.file?.revision],['Propósito',r=>r.file?.purpose],['Arquivo',r=>r.file?.originalName],['Hash',r=>r.file?.fileProvenance?.sha256]],
      requests:[['Código','document'],['Planilha','sheet'],['Linha','sourceRow'],['Dados',r=>Object.entries(r.data||{}).map(([k,v])=>k+': '+v).join(' · ')]],
      monitor:[['Código','document_code'],['Prioridade','priority'],['Observação','note'],['Atualização','updated_at']],
      monitorChanges:[['Código','document_code'],['Revisão','revision'],['Anterior','previous_status'],['Atual','current_status'],['Detectado em','created_at']],
      audit:[['Ação','action'],['Data','created_at'],['Resultado',r=>r.metadata?.result||'Registrado']],
    };
    const values = [...(remote.sigem||[]),...(pw||[]),...(remote.vault||[]).map(f=>f.source_context||{})];
    const known = keys => values.map(row=>keys.map(key=>row[key]).find(value=>text(value).trim())).find(Boolean) || 'Não identificado';
    const identification=table([{description:known(['title','description']),class:known(['documentClass','class']),discipline:known(['discipline']),taxonomy:known(['taxonomy']),eap:known(['eap'])}], [['Descrição','description'],['Classe','class'],['Disciplina','discipline'],['Taxonomia','taxonomy'],['EAP','eap']]);
    const heading = '<h3>'+esc(code)+'</h3><p>Fontes consultadas separadamente. Cada seção exibe até 100 registros; baixe versões específicas pelo identificador do arquivo.</p>';
    document.getElementById('master-content').innerHTML = heading+'<section class="master-source"><h4>Identificação</h4>'+identification+'</section>'+sections.map(([key,label])=> {
      let body;
      if(key==='pw') body = pw===null ? '<p>ProjectWise indisponível.</p>' : !pwBase?.meta ? '<p>Base PW não carregada neste contrato/dispositivo.</p>' : '<p>Base local: '+esc(pwBase.meta.fileName)+' · '+esc(pwBase.meta.importedAt)+'</p>'+table(pw,columns.pw);
      else if(results[0].status==='rejected') body='<p>Fonte compartilhada indisponível. '+esc(results[0].reason?.message)+'</p>';
      else body=key==='vault'?filesMarkup(remote.vault):table(remote[key],columns[key]);
      return '<section class="master-source"><h4>'+label+'</h4>'+body+'</section>';
    }).join('');
    status(results[0].status==='rejected'?'Algumas fontes não puderam ser consultadas.':'Registro atualizado.',results[0].status==='rejected');
  }
  async function search(query) {
    const ticket=++searchTicket, scope=epoch;
    if(query.trim().length<2) { document.getElementById('master-results').innerHTML='';status('Informe ao menos dois caracteres ou abra um código completo.');return; }
    status('Pesquisando…');
    try {
      const [remote,pw] = await Promise.allSettled([api().request('/search?q='+encodeURIComponent(query)),currentPw()]);
      if(ticket!==searchTicket||scope!==epoch)return;
      const rows=remote.status==='fulfilled'?(remote.value.results||[]):[];
      const wanted=query.toLocaleLowerCase('pt-BR');
      let localCount=0;
      if(pw.status==='fulfilled') for(const row of pwBase?.records||[]) {
        if(localCount>=50)break;
        if([row.document,row.revision,row.title,row.discipline,row.documentClass,row.databook].join(' ').toLocaleLowerCase('pt-BR').includes(wanted)) {rows.push({code:row.document,label:row.title,source:'pw local'});localCount++;}
      }
      const seen=new Set();
      document.getElementById('master-results').innerHTML=rows.filter(r=>r.code&&!seen.has(r.code+'|'+r.source)&&seen.add(r.code+'|'+r.source)).map(r=>'<button class="master-result" type="button" data-master-code="'+esc(r.code)+'"><strong>'+esc(r.code)+'</strong><span>'+esc(r.source)+' · '+esc(r.label)+'</span></button>').join('');
      status(remote.status==='rejected'?'Busca compartilhada indisponível. '+text(remote.reason?.message):'Até 100 resultados compartilhados e 50 locais. Abra um código para consultar suas fontes.',remote.status==='rejected');
    }catch(error){if(ticket===searchTicket)status(error.message,true);}
  }
  async function openFile(id) {
    open(); const scope=epoch,ticket=++searchTicket; status('Carregando versões e auditoria…');
    try {
      const result=await api().request('/detail?id='+encodeURIComponent(id));
      if(scope!==epoch||ticket!==searchTicket)return;
      const f=result.file;
      document.getElementById('master-content').innerHTML='<h3>'+esc(f.document_code)+' · Revisão '+esc(f.revision)+'</h3>'+filesMarkup(result.versions)+
        '<section class="master-source"><h4>Auditoria desta versão</h4>'+table(result.audit,[['Ação','action'],['Data','created_at'],['Usuário','actor_id']])+'</section>'+
        '<form id="master-metadata"><h4>Metadados da versão selecionada</h4><input type="hidden" name="id" value="'+esc(id)+'"><label>Propósito<input name="purpose" value="'+esc(f.source_context?.purpose)+'"></label><label>Disciplina<input name="discipline" value="'+esc(f.source_context?.discipline)+'"></label><label>Classe<select name="class"><option value="">Não identificado</option>'+["ET","N-1710","CV"].map(value=>'<option value="'+value+'" '+(f.source_context?.class===value?"selected":"")+'>'+value+'</option>').join("")+'</select></label><button type="submit" class="secondary-button" '+(!['owner','admin','operator'].includes(root.GrconCloud?.state?.membership?.role)?'disabled':'')+'>Salvar metadados</button></form>';
      status('Versões anteriores permanecem disponíveis. Arquivos utilizados em GRDT são preservados.');
    }catch(error){if(scope===epoch)status(error.message,true);}
  }
  function open(code) {
    opener=document.activeElement;
    const dialog=document.getElementById('document-master-dialog');
    if(!dialog.open)dialog.showModal();
    document.getElementById('master-query').focus();
    if(code)void showDocument(code);
  }
  function init() {
    const nav=document.querySelector('.ops-sidebar');
    if(!nav)return;
    const button=document.createElement('button');button.type='button';button.className='ops-nav-button';button.id='document-master-open';button.innerHTML='<span><strong>Registro Mestre</strong><small>Pesquisa documental</small></span>';button.addEventListener('click',()=>open());nav.appendChild(button);
    const dialog=document.createElement('dialog');dialog.id='document-master-dialog';dialog.className='document-master-dialog';dialog.innerHTML='<header><div><strong>Registro Mestre do Documento</strong><p>Pesquise código, arquivo, revisão, disciplina, solicitação ou eGRDT.</p></div><button id="master-close" type="button" aria-label="Fechar Registro Mestre">Fechar</button></header><form id="master-search"><label for="master-query">Pesquisa global</label><div><input id="master-query" type="search" autocomplete="off" placeholder="Código, arquivo ou eGRDT"><button type="submit" class="secondary-button">Abrir código</button></div></form><p id="master-status" role="status" aria-live="polite">Informe ao menos dois caracteres.</p><div id="master-results"></div><div id="master-content"></div>';document.body.appendChild(dialog);
    document.getElementById('master-close').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{searchTicket++;opener?.focus?.();});
    document.getElementById('master-query').addEventListener('input',event=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>void search(event.target.value),220);});
    document.getElementById('master-search').addEventListener('submit',event=>{event.preventDefault();clearTimeout(searchTimer);void showDocument(document.getElementById('master-query').value);});
    dialog.addEventListener('click',event=>{const code=event.target.closest('[data-master-code]');if(code)void showDocument(code.dataset.masterCode);const file=event.target.closest('[data-master-download]');if(file)void downloadFile(file.dataset.masterDownload,file.dataset.masterName);});
    dialog.addEventListener('submit',async event=>{if(event.target.getAttribute('id')!=='master-metadata')return;event.preventDefault();const values=Object.fromEntries(new FormData(event.target));try{await api().request('/metadata',{method:'POST',body:JSON.stringify(values)});status('Metadados atualizados.');}catch(error){status(error.message,true);}});
    root.addEventListener('grcon:contract-context-changed',()=>{epoch++;searchTicket++;pwBase=null;pwIndex=null;dialog.close();document.getElementById('master-results').innerHTML='';document.getElementById('master-content').innerHTML='';document.getElementById('master-query').value='';});
    root.addEventListener('grcon:pw-base-updated',()=>{pwBase=null;pwIndex=null;});
  }
  root.GrconDocumentMaster=Object.freeze({open,openFile});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
