/* GRCON — Dashboard de Alocação, carregamento sob demanda. */
(function dashboard(root) {
  "use strict";
  const Model = root.GrconAllocationDashboardCore;
  const registry = () => root.GrconAllocationRegistry;
  const $ = id => document.getElementById(id);
  const t = v => String(v ?? "").trim();
  const esc = v => t(v).replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch]));
  const number = n => Number(n || 0).toLocaleString("pt-BR");
  const state = {scope:"",version:"",prepared:[],duplicates:0,options:{search:"",allocation:"",status:"",stage:"",sheet:"",action:"",from:"",to:""},
    sort:{key:"",dir:1},aggregated:null,full:null,fullByAllocation:null,page:1,pageSize:65,detail:"",loading:false,busy:false};
  function shell(){
    const el=$("allocation-dashboard-root");if(!el||el.dataset.ready)return;
    el.dataset.ready="true";
    el.innerHTML=`<div class="allocation-dashboard">
      <header class="allocation-dashboard-heading"><div><span>FERRAMENTAS ADICIONAIS / CONTROLE DE SOLICITAÇÕES</span>
      <h2>Dashboard de Alocação</h2><p>Acompanhamento da Fiscal 01, Fiscal 02 e demais situações da Central compartilhada.</p></div>
      <div class="allocation-dashboard-actions">
        <button id="ad-back" class="secondary-button" type="button">← Ferramentas adicionais</button>
        <button id="ad-sync" class="secondary-button" type="button">Sincronizar base</button>
        <button id="ad-export" class="primary-button" type="button">Exportar Excel</button>
      </div></header>
      <p id="ad-meta" class="allocation-dashboard-meta" aria-live="polite"></p>
      <p id="ad-alert" class="allocation-dashboard-alert" role="status" hidden></p>
      <div id="ad-segments" class="allocation-dashboard-segments" role="group" aria-label="Filtrar por fiscal">
        <button type="button" data-ad-stage="" aria-pressed="true">Todos</button>
        <button type="button" data-ad-stage="fiscal1" aria-pressed="false">Fiscal 01</button>
        <button type="button" data-ad-stage="fiscal2" aria-pressed="false">Fiscal 02</button>
        <button type="button" data-ad-stage="unclassified" aria-pressed="false">Sem fiscal explícita</button>
      </div>
      <details id="ad-more" class="allocation-dashboard-more"><summary><span>Mais filtros</span><small id="ad-more-count"></small></summary>
      <div class="allocation-dashboard-filters" role="group" aria-label="Filtros de alocação">
        <label>Número da alocação<input id="ad-allocation" type="search" inputmode="search" placeholder="Ex.: 0200 ou C1O-ALOC"></label>
        <label>Documento / workflow<input id="ad-search" type="search" placeholder="Código do documento ou workflow"></label>
        <label>Status<select id="ad-status"></select></label>
        <label>Fiscal<select id="ad-stage"><option value="">Todas as etapas</option><option value="fiscal1">Fiscal 01</option><option value="fiscal2">Fiscal 02</option><option value="unclassified">Sem fiscal explícita</option></select></label>
        <label>Aba da LD<input id="ad-sheet" type="search" placeholder="Ex.: LD_004"></label>
        <label>Ação<select id="ad-action"><option value="">Todas as ações</option></select></label>
        <label>Envio a partir de<input id="ad-from" type="date"></label>
        <label>Envio até<input id="ad-to" type="date"></label>
        <button id="ad-clear" class="secondary-button" type="button">Limpar filtros</button>
      </div>
      </details>
      <div id="ad-summary" class="allocation-dashboard-summary" aria-live="polite"></div>
      <div class="allocation-dashboard-charts">
      <section class="allocation-dashboard-panel"><h3>Distribuição por situação</h3>
        <p class="allocation-dashboard-caption">Cada alocação aparece em uma única categoria, por isso os percentuais somam 100%. Os indicadores acima e o gráfico lateral contam alocações com documentos em cada status e podem se sobrepor.</p>
        <div id="ad-distribution"></div></section>
        <section class="allocation-dashboard-panel"><h3>Alocações por status</h3>
        <p class="allocation-dashboard-caption">Uma alocação pode ter documentos em vários status; as categorias podem se sobrepor.</p>
        <div id="ad-chart"></div></section>
      </div>
      <div class="allocation-dashboard-layout">
        <section class="allocation-dashboard-panel"><div class="allocation-dashboard-table-heading"><h3>Alocações e documentos</h3><small id="ad-count"></small></div>
        <div class="allocation-dashboard-table-scroll"><table class="allocation-dashboard-table"><thead><tr><th data-sort-key="allocation"><button type="button" class="allocation-dashboard-sort" data-ad-sort="allocation">Alocação<i aria-hidden="true"></i></button></th><th data-sort-key="situation"><button type="button" class="allocation-dashboard-sort" data-ad-sort="situation">Situação<i aria-hidden="true"></i></button></th><th data-sort-key="documentsCount"><button type="button" class="allocation-dashboard-sort" data-ad-sort="documentsCount">Documentos<i aria-hidden="true"></i></button></th><th data-sort-key="completed"><button type="button" class="allocation-dashboard-sort" data-ad-sort="completed">Concluídos<i aria-hidden="true"></i></button></th><th data-sort-key="pending"><button type="button" class="allocation-dashboard-sort" data-ad-sort="pending">Pendentes / outros<i aria-hidden="true"></i></button></th><th data-sort-key="lastSentAt"><button type="button" class="allocation-dashboard-sort" data-ad-sort="lastSentAt">Último envio<i aria-hidden="true"></i></button></th><th>Detalhes</th></tr></thead><tbody id="ad-table"></tbody></table></div>
        <div class="allocation-dashboard-pager"><span id="ad-page"></span><button id="ad-prev" class="secondary-button" type="button">Anterior</button><button id="ad-next" class="secondary-button" type="button">Próxima</button></div></section>
      </div></div>`;
    $("ad-status").innerHTML='<option value="">Todos os status</option>'+Object.entries(Model.STATUS).map(([c,v])=>`<option value="${c}">${esc(v)}</option>`).join("");
    const keys=["search","allocation","status","stage","sheet","action","from","to"];
    for(const key of keys)$("ad-"+key).addEventListener(key==="search"||key==="allocation"||key==="sheet"?"input":"change",ev=>{
      state.options[key]=ev.target.value;state.page=1;state.detail="";scheduleRender();
    });
    $("ad-segments").addEventListener("click",ev=>{
      const b=ev.target.closest("button[data-ad-stage]");if(!b)return;
      state.options.stage=b.dataset.adStage;$("ad-stage").value=state.options.stage;state.page=1;state.detail="";scheduleRender();
    });
    $("ad-table").closest("table").querySelector("thead").addEventListener("click",ev=>{
      const b=ev.target.closest("button[data-ad-sort]");if(!b)return;
      const key=b.dataset.adSort;
      state.sort=state.sort.key===key?{key,dir:-state.sort.dir}:{key,dir:key==="allocation"||key==="situation"||key==="lastSentAt"?1:-1};
      state.page=1;state.detail="";render();
    });
    $("ad-clear").addEventListener("click",()=>{
      state.options={search:"",allocation:"",status:"",stage:"",sheet:"",action:"",from:"",to:""};
      for(const key of keys)$("ad-"+key).value="";
      state.sort={key:"",dir:1};
      state.page=1;state.detail="";render();
    });
    $("ad-back").addEventListener("click",()=>root.GRCONModuleLoader?.ensureModule?.("additional-tools"));
    $("ad-sync").addEventListener("click",()=>void load(true));
    $("ad-export").addEventListener("click",()=>void exportExcel());
    $("ad-prev").addEventListener("click",()=>{state.page--;render();});
    $("ad-next").addEventListener("click",()=>{state.page++;render();});
    for(const id of ["ad-chart","ad-summary"])$(id).addEventListener("click",ev=>{
      const b=ev.target.closest("button[data-ad-filter]");if(!b)return;
      state.options.status=state.options.status===b.dataset.adFilter?"":b.dataset.adFilter;
      $("ad-status").value=state.options.status;state.page=1;state.detail="";render();
    });
    $("ad-table").addEventListener("click",ev=>{
      const more=ev.target.closest("button[data-ad-more]");if(more){state.detailLimit=(state.detailLimit||100)+100;void render();return;}
      const b=ev.target.closest("button[data-ad-detail]");if(!b)return;state.detailLimit=100;
      state.detail=state.detail===b.dataset.adDetail?"":b.dataset.adDetail;render();
    });
  }
  function scope(){return root.GrconCloud?.state?.membership?.workspace_id||"";}
  function show(message,error=false){
    const el=$("ad-alert");if(!el)return;
    el.hidden=!message;el.textContent=message;el.classList.toggle("is-error",error);
  }
  function resetContract(){
    if(scope()===state.scope)return;
    snapshotGeneration++;renderGeneration++;if(filterTimer)clearTimeout(filterTimer);filterTimer=null;calculationPending=false;calculationCache=null;renderOperation?.abort();renderOperation=null;
    state.scope=scope();state.version="";state.prepared=[];state.duplicates=0;state.full=null;state.fullByAllocation=null;state.page=1;state.detail="";
    state.options={search:"",allocation:"",status:"",stage:"",sheet:"",action:"",from:"",to:""};
    for(const key of Object.keys(state.options)){const el=$("ad-"+key);if(el)el.value="";}
  }
  let renderGeneration=0, calculationCache=null, renderOperation=null, snapshotGeneration=0, filterTimer=null, calculationPending=false;
  function scheduleRender(){
    if(filterTimer)clearTimeout(filterTimer);
    renderGeneration++;calculationPending=true;$("ad-export").disabled=true;
    filterTimer=setTimeout(()=>{filterTimer=null;void render();},160);
  }
  async function readSnapshot(){
    resetContract();
    const generation=++snapshotGeneration;
    const snapshot=registry()?.current?.();
    if(!snapshot||snapshot.stale||!snapshot.id||!Array.isArray(snapshot.records)){
      state.version="";state.prepared=[];render();
      $("ad-meta").textContent=snapshot?.stale?"Base não confirmada nesta sessão.":"Nenhuma base da Central de alocação publicada neste contrato.";
      show(snapshot?.stale?"A base antiga foi suspensa. Sincronize para visualizar os indicadores.":"Publique uma Central de alocação em Configurações gerais e sincronize este painel.",!!snapshot?.stale);
      return;
    }
    if(state.version===snapshot.id)return;
    const expected=scope();
    await root.GRCONModuleLoader.ensure("performance");
    const prepared=root.GrconPerformance?.supported
      ?await root.GrconPerformance.processData("allocation-prepare",{key:expected+":"+snapshot.id,records:snapshot.records})
      :null;
    if(expected!==scope()||generation!==snapshotGeneration)return;
    calculationCache=null;
    const p=prepared?.prepared||Model.prepare(snapshot.records);
    state.prepared=p.rows;state.duplicates=p.duplicateLinks;state.full=prepared?.full||Model.aggregate(p.rows);state.fullByAllocation=new Map(state.full.groups.map(g=>[Model.norm(g.allocation),g]));state.version=snapshot.id;state.page=1;state.detail="";
    $("ad-action").innerHTML='<option value="">Todas as ações</option>'+[...new Set(p.rows.map(r=>t(r.action)).filter(Boolean))].sort().map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
    $("ad-action").value=state.options.action;
    $("ad-meta").textContent=`Base: ${snapshot.fileName||"Central de alocação"} · ${snapshot.updatedAt?new Date(snapshot.updatedAt).toLocaleString("pt-BR"):"Sem data"} · ${number(snapshot.records.length)} vínculos · ${number(p.duplicateLinks)} duplicidades consolidadas`;
    show("");await render();
  }
  async function load(force=false){
    shell();resetContract();const expected=scope();
    if(!expected){show("Entre no GRCON e selecione o contrato para consultar os dados.",true);return;}
    if(state.loading)return;
    const operation=root.GrconOperations?.begin("allocation-sync","Sincronizar Dashboard de Alocação",{host:"#allocation-dashboard-root",silent:true});
    state.loading=true;$("ad-sync").disabled=true;
    try{
      await operation?.paint();
      operation?.update("Consultando a Central compartilhada…");
      const snap=registry()?.current?.();
      if(force||!snap||snap.stale)await registry()?.refresh?.();
      if(scope()===expected){operation?.update("Calculando indicadores…");await readSnapshot();}
    }catch(err){operation?.fail(err);if(scope()===expected){show("Falha na sincronização: "+t(err.message||err),true);}}
    finally{operation?.finish();state.loading=false;$("ad-sync").disabled=false;}
  }
  async function render(){
    if(!$("ad-summary"))return;
    const generation=++renderGeneration,expected=scope();
    const cacheKey=state.version+":"+JSON.stringify(state.options);
    let a;
    try {
      if(calculationCache?.key===cacheKey)a=calculationCache.value;
      else if(state.version&&state.prepared.length>=2000&&root.GrconPerformance?.supported){
        if(!renderOperation&&!root.GrconOperations?.isActive("allocation-filter"))renderOperation=root.GrconOperations?.begin("allocation-filter","Atualizar indicadores",{host:"#allocation-dashboard-root",silent:true});
        await renderOperation?.paint();
        a=await root.GrconPerformance.processData("allocation-filter",{key:expected+":"+state.version,options:{...state.options}},renderOperation?.update);
      }else a=Model.aggregate(Model.filter(state.prepared,state.options));
      if(generation!==renderGeneration||expected!==scope())return;
      calculationPending=false;
      // Cache unmodified domain aggregation; visible group enrichment is derived below.
      calculationCache={key:cacheKey,value:{...a,groups:[...a.groups]}};
      a={...a,groups:[...a.groups]};
      renderOperation?.finish();renderOperation=null;
    } catch(error){if(generation===renderGeneration){calculationPending=false;renderOperation?.fail(error);renderOperation=null;show(error.message||String(error),true);}return;}

    // O filtro escolhe vínculos; a situação da ALOC considera SEMPRE todos os seus documentos.
    a.groups=a.groups.map(g=>{
      const complete=state.fullByAllocation?.get(Model.norm(g.allocation));
      return complete?{...g,situation:complete.situation,documentsCount:complete.documentsCount,
        completed:complete.completed,pending:complete.pending,allItems:complete.items}:g;
    });
    a.completeAllocations=a.groups.filter(g=>g.situation==="Concluída").length;
    a.partialAllocations=a.groups.filter(g=>g.situation==="Parcialmente concluída").length;
    state.aggregated=a;
    const cards=[["Alocações",a.groups.length,""],["Documentos",a.documents,""],
      ["Concluídas",a.completeAllocations,"completed"],["Parcialmente concluídas",a.partialAllocations,""],
      ["Fiscal 01 · Aguardando",a.byStatus.fiscal1Waiting,"fiscal1Waiting"],
      ["Fiscal 02 · Aguardando",a.byStatus.fiscal2Waiting,"fiscal2Waiting"],
      ["Fiscal 01 · Recusado",a.byStatus.fiscal1Rejected,"fiscal1Rejected"],
      ["Demais recusas",a.byStatus.rejected,"rejected"]];
    // Percentual sobre as alocações do filtro atual. As categorias de status se
    // sobrepõem (uma alocação pode ter documentos em vários status), então o
    // percentual nunca é apresentado como partição do total.
    const totalAllocations=a.groups.length;
    const share=(value,label)=>label==="Documentos"||!totalAllocations?"":`<small>${(100*value/totalAllocations).toLocaleString("pt-BR",{maximumFractionDigits:1})}% das alocações</small>`;
    $("ad-summary").innerHTML=cards.map(([label,value,code])=>code
      ?`<button type="button" class="allocation-dashboard-kpi" data-ad-filter="${code}" aria-pressed="${state.options.status===code}"><span>${esc(label)}</span><strong>${number(value)}</strong>${share(value,label)}</button>`
      :`<div class="allocation-dashboard-kpi"><span>${esc(label)}</span><strong>${number(value)}</strong>${share(value,label)}</div>`).join("");
    // Situação de cada alocação: categorias que NÃO se sobrepõem, somam 100%.
    const situations=new Map();
    for(const g of a.groups)situations.set(g.situation,(situations.get(g.situation)||0)+1);
    const slugOf=v=>({"Concluída":"done","Parcialmente concluída":"partial","Status mistos":"mixed"}[v]||"single");
    const ranked=[...situations.entries()].sort((x,y)=>y[1]-x[1]);
    $("ad-distribution").innerHTML=ranked.length?`<div class="allocation-dashboard-stack" role="img" aria-label="${esc(ranked.map(([k,n])=>`${k}: ${number(n)}`).join("; "))}">${ranked.map(([k,n],i)=>`<i class="is-${slugOf(k)} tone-${i%6}" style="width:${(100*n/totalAllocations).toFixed(2)}%" title="${esc(k)}: ${number(n)}"></i>`).join("")}</div>
      <ul class="allocation-dashboard-legend">${ranked.map(([k,n],i)=>`<li><i class="is-${slugOf(k)} tone-${i%6}" aria-hidden="true"></i><span>${esc(k)}</span><strong>${number(n)}</strong><small>${(100*n/totalAllocations).toLocaleString("pt-BR",{maximumFractionDigits:1})}%</small></li>`).join("")}</ul>`
      :'<p class="allocation-dashboard-empty">Sem alocações correspondentes aos filtros.</p>';
    // Segmentos de fiscal e contagem de filtros avançados.
    $("ad-segments").querySelectorAll("button[data-ad-stage]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.adStage===(state.options.stage||""))));
    $("ad-stage").value=state.options.stage||"";
    const advanced=["allocation","status","sheet","action","from","to"].filter(k=>state.options[k]).length;
    $("ad-more-count").textContent=advanced?`${advanced} ativo${advanced>1?"s":""}`:"";
    if(advanced&&!$("ad-more").open)$("ad-more").open=true;
    // Ordenação por coluna (padrão: ordem numérica da alocação, como antes).
    if(state.sort.key){
      const k=state.sort.key,dir=state.sort.dir;
      a.groups.sort((x,y)=>{const vx=x[k]??"",vy=y[k]??"";
        const c=typeof vx==="number"&&typeof vy==="number"?vx-vy:String(vx).localeCompare(String(vy),"pt-BR",{numeric:true});
        return (c||String(x.allocation).localeCompare(String(y.allocation),"pt-BR",{numeric:true}))*dir;});
    }
    // O realce global de tabelas (ui-v3) deriva o aria-sort de data-sort-direction.
    document.querySelectorAll("#allocation-dashboard-root th[data-sort-key]").forEach(th=>{
      const direction=th.dataset.sortKey===state.sort.key?(state.sort.dir>0?"asc":"desc"):"";
      if(direction)th.dataset.sortDirection=direction;else delete th.dataset.sortDirection;
      th.setAttribute("aria-sort",direction==="asc"?"ascending":direction==="desc"?"descending":"none");
    });
    const visible=Object.entries(a.byStatus).filter(([,n])=>n>0).sort((x,y)=>y[1]-x[1]),max=Math.max(1,...visible.map(([,n])=>n));
    $("ad-chart").innerHTML=visible.length?visible.map(([code,n])=>`<button type="button" class="allocation-dashboard-bar" data-ad-filter="${code}" aria-pressed="${state.options.status===code}">
      <span>${esc(Model.STATUS[code])}</span><span class="allocation-dashboard-bar-track"><i style="width:${(100*n/max).toFixed(2)}%"></i></span><strong>${number(n)}</strong></button>`).join("")
      :'<p class="allocation-dashboard-empty">Sem registros correspondentes aos filtros.</p>';
    const pages=Math.max(1,Math.ceil(a.groups.length/state.pageSize));
    state.page=Math.max(1,Math.min(pages,state.page));
    const rows=a.groups.slice((state.page-1)*state.pageSize,state.page*state.pageSize);
    $("ad-table").innerHTML=rows.map((g,i)=>{
      const id=String((state.page-1)*state.pageSize+i);
      const main=`<tr><td><strong>${esc(g.allocation)}</strong></td><td><span class="allocation-dashboard-pill is-${slugOf(g.situation)}">${esc(g.situation)}</span></td><td>${number(g.documentsCount)}</td>
        <td>${number(g.completed)}</td><td>${number(g.pending)}</td><td>${esc(g.lastSentAt||"—")}</td>
        <td><button type="button" class="secondary-button" data-ad-detail="${id}" aria-expanded="${state.detail===id}">${state.detail===id?"Fechar":"Documentos"}</button></td></tr>`;
      if(state.detail!==id)return main;
      const items=(g.allItems||g.items).slice(0,state.detailLimit||100).map(r=>`<tr><td>${esc(r.document)}</td><td>${esc(r.allocationStatus||"Não informado")}</td><td>${esc(r.sentAt)}</td>
        <td>${esc(r.fiscal1ReturnedAt)}</td><td>${esc(r.fiscal2ReturnedAt)}</td>
        <td>${esc([r.fiscalComment,r.fiscal2Comment,r.remarks].filter(Boolean).join(" · "))}</td></tr>`).join("");
      return main+`<tr class="allocation-dashboard-detail"><td colspan="7"><div class="allocation-dashboard-detail-list">
        <strong>Documentos: ${esc(g.allocation)}</strong>${(g.allItems||g.items).length>(state.detailLimit||100)?`<button type="button" class="secondary-button" data-ad-more="${id}">Mostrar mais 100 documentos (${state.detailLimit||100} de ${(g.allItems||g.items).length})</button>`:""}
        <table><thead><tr><th>Documento</th><th>Status</th><th>Envio</th><th>Retorno Fiscal 01</th><th>Retorno Fiscal 02</th><th>Comentários / observações</th></tr></thead><tbody>${items}</tbody></table>
        </div></td></tr>`;
    }).join("")||'<tr><td colspan="7">Nenhuma alocação encontrada.</td></tr>';
    $("ad-count").textContent=`${number(a.groups.length)} alocações · ${number(a.documents)} documentos · ${number(a.links)} vínculos`;
    $("ad-page").textContent=`Página ${state.page} de ${pages}`;
    $("ad-prev").disabled=state.page===1;$("ad-next").disabled=state.page===pages;
    $("ad-export").disabled=!a.links||!state.version||state.busy;
  }
  async function exportExcel(){
    if(!state.version||!state.aggregated?.links||state.busy||calculationPending||filterTimer)return;
    const snapshot=registry()?.current?.();
    if(!snapshot||snapshot.stale||snapshot.id!==state.version){show("Sincronize a base antes de exportar.",true);return;}
    const operation=root.GrconOperations?.begin("allocation-export","Exportar Dashboard de Alocação",{host:"#allocation-dashboard-root"});
    state.busy=true;$("ad-export").disabled=true;
    try{
      await operation?.paint();
      await root.GRCONModuleLoader.ensure("performance");
      const buffer=await root.GrconPerformance.processData("allocation-export",{aggregated:state.aggregated,options:{
        contract:root.GrconCloud?.state?.membership?.workspace_name||"Contrato atual",
        fileName:snapshot.fileName,updatedAt:snapshot.updatedAt,
        filters:Object.entries(state.options).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`).join(" · ")||"Sem filtros"}},operation?.update);
      operation?.assertCurrent();
      const url=URL.createObjectURL(new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
      const anchor=document.createElement("a");anchor.href=url;anchor.download="GRCON_Dashboard_Alocacao_"+new Date().toISOString().slice(0,10)+".xlsx";anchor.click();setTimeout(()=>URL.revokeObjectURL(url),30000);show("");
    }catch(err){operation?.fail(err);show("Não foi possível exportar: "+t(err.message||err),true);}
    finally{operation?.finish();state.busy=false;void render();}
  }
  root.GrconAllocationDashboardUi=Object.freeze({activate:()=>{shell();void load();},refresh:()=>load(true)});
  root.addEventListener("grcon:allocation-registry-updated",()=>{if($("allocation-dashboard-root")?.dataset.ready)void readSnapshot().catch(error=>show(error.message,true));});
  root.addEventListener("grcon:contract-context-changed",()=>{if($("allocation-dashboard-root")?.dataset.ready)void load(true);});
})(window);
