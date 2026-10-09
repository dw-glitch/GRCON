/* GRCON — Dashboard de Alocação, carregamento sob demanda. */
(function dashboard(root) {
  "use strict";
  const Model = root.GrconAllocationDashboardCore;
  const registry = () => root.GrconAllocationRegistry;
  const $ = id => document.getElementById(id);
  const t = v => String(v ?? "").trim();
  const esc = v => t(v).replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch]));
  const number = n => Number(n || 0).toLocaleString("pt-BR");
  const state = {scope:"",version:"",prepared:[],duplicates:0,options:{search:"",status:"",stage:"",sheet:"",action:"",from:"",to:""},
    aggregated:null,full:null,fullByAllocation:null,page:1,pageSize:65,detail:"",loading:false,busy:false};
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
      <div class="allocation-dashboard-filters" role="group" aria-label="Filtros de alocação">
        <label>Documento / alocação<input id="ad-search" type="search" placeholder="Código, alocação ou workflow"></label>
        <label>Status<select id="ad-status"></select></label>
        <label>Fiscal<select id="ad-stage"><option value="">Todas as etapas</option><option value="fiscal1">Fiscal 01</option><option value="fiscal2">Fiscal 02</option><option value="unclassified">Sem fiscal explícita</option></select></label>
        <label>Aba da LD<input id="ad-sheet" type="search" placeholder="Ex.: LD_004"></label>
        <label>Ação<select id="ad-action"><option value="">Todas as ações</option></select></label>
        <label>Envio a partir de<input id="ad-from" type="date"></label>
        <label>Envio até<input id="ad-to" type="date"></label>
        <button id="ad-clear" class="secondary-button" type="button">Limpar filtros</button>
      </div>
      <div id="ad-summary" class="allocation-dashboard-summary" aria-live="polite"></div>
      <div class="allocation-dashboard-layout">
        <section class="allocation-dashboard-panel"><h3>Situação das alocações</h3>
        <p class="allocation-dashboard-caption">Uma alocação pode ter documentos em vários status; as categorias podem se sobrepor.</p>
        <div id="ad-chart"></div></section>
        <section class="allocation-dashboard-panel"><div class="allocation-dashboard-table-heading"><h3>Alocações e documentos</h3><small id="ad-count"></small></div>
        <div class="allocation-dashboard-table-scroll"><table class="allocation-dashboard-table"><thead><tr><th>Alocação</th><th>Situação</th><th>Documentos</th><th>Concluídos</th><th>Pendentes / outros</th><th>Último envio</th><th>Detalhes</th></tr></thead><tbody id="ad-table"></tbody></table></div>
        <div class="allocation-dashboard-pager"><span id="ad-page"></span><button id="ad-prev" class="secondary-button" type="button">Anterior</button><button id="ad-next" class="secondary-button" type="button">Próxima</button></div></section>
      </div></div>`;
    $("ad-status").innerHTML='<option value="">Todos os status</option>'+Object.entries(Model.STATUS).map(([c,v])=>`<option value="${c}">${esc(v)}</option>`).join("");
    const keys=["search","status","stage","sheet","action","from","to"];
    for(const key of keys)$("ad-"+key).addEventListener(key==="search"||key==="sheet"?"input":"change",ev=>{
      state.options[key]=ev.target.value;state.page=1;state.detail="";render();
    });
    $("ad-clear").addEventListener("click",()=>{
      state.options={search:"",status:"",stage:"",sheet:"",action:"",from:"",to:""};
      for(const key of keys)$("ad-"+key).value="";
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
      const b=ev.target.closest("button[data-ad-detail]");if(!b)return;
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
    state.scope=scope();state.version="";state.prepared=[];state.duplicates=0;state.full=null;state.fullByAllocation=null;state.page=1;state.detail="";
    state.options={search:"",status:"",stage:"",sheet:"",action:"",from:"",to:""};
    for(const key of Object.keys(state.options)){const el=$("ad-"+key);if(el)el.value="";}
  }
  function readSnapshot(){
    resetContract();
    const snapshot=registry()?.current?.();
    if(!snapshot||snapshot.stale||!snapshot.id||!Array.isArray(snapshot.records)){
      state.version="";state.prepared=[];render();
      $("ad-meta").textContent=snapshot?.stale?"Base não confirmada nesta sessão.":"Nenhuma base da Central de alocação publicada neste contrato.";
      show(snapshot?.stale?"A base antiga foi suspensa. Sincronize para visualizar os indicadores.":"Publique uma Central de alocação em Configurações gerais e sincronize este painel.",!!snapshot?.stale);
      return;
    }
    if(state.version===snapshot.id)return;
    const p=Model.prepare(snapshot.records);
    state.prepared=p.rows;state.duplicates=p.duplicateLinks;state.full=Model.aggregate(p.rows);state.fullByAllocation=new Map(state.full.groups.map(g=>[Model.norm(g.allocation),g]));state.version=snapshot.id;state.page=1;state.detail="";
    $("ad-action").innerHTML='<option value="">Todas as ações</option>'+[...new Set(p.rows.map(r=>t(r.action)).filter(Boolean))].sort().map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
    $("ad-action").value=state.options.action;
    $("ad-meta").textContent=`Base: ${snapshot.fileName||"Central de alocação"} · ${snapshot.updatedAt?new Date(snapshot.updatedAt).toLocaleString("pt-BR"):"Sem data"} · ${number(snapshot.records.length)} vínculos · ${number(p.duplicateLinks)} duplicidades consolidadas`;
    show("");render();
  }
  async function load(force=false){
    shell();resetContract();const expected=scope();
    if(!expected){show("Entre no GRCON e selecione o contrato para consultar os dados.",true);return;}
    if(state.loading)return;
    state.loading=true;$("ad-sync").disabled=true;
    try{
      const snap=registry()?.current?.();
      if(force||!snap||snap.stale)await registry()?.refresh?.();
      if(scope()===expected)readSnapshot();
    }catch(err){if(scope()===expected){show("Falha na sincronização: "+t(err.message||err),true);readSnapshot();}}
    finally{state.loading=false;$("ad-sync").disabled=false;}
  }
  function render(){
    if(!$("ad-summary"))return;
    const a=Model.aggregate(Model.filter(state.prepared,state.options));
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
    $("ad-summary").innerHTML=cards.map(([label,value,code])=>code
      ?`<button type="button" class="allocation-dashboard-kpi" data-ad-filter="${code}" aria-pressed="${state.options.status===code}"><span>${esc(label)}</span><strong>${number(value)}</strong></button>`
      :`<div class="allocation-dashboard-kpi"><span>${esc(label)}</span><strong>${number(value)}</strong></div>`).join("");
    const visible=Object.entries(a.byStatus).filter(([,n])=>n>0).sort((x,y)=>y[1]-x[1]),max=Math.max(1,...visible.map(([,n])=>n));
    $("ad-chart").innerHTML=visible.length?visible.map(([code,n])=>`<button type="button" class="allocation-dashboard-bar" data-ad-filter="${code}" aria-pressed="${state.options.status===code}">
      <span>${esc(Model.STATUS[code])}</span><span class="allocation-dashboard-bar-track"><i style="width:${(100*n/max).toFixed(2)}%"></i></span><strong>${number(n)}</strong></button>`).join("")
      :'<p class="allocation-dashboard-empty">Sem registros correspondentes aos filtros.</p>';
    const pages=Math.max(1,Math.ceil(a.groups.length/state.pageSize));
    state.page=Math.max(1,Math.min(pages,state.page));
    const rows=a.groups.slice((state.page-1)*state.pageSize,state.page*state.pageSize);
    $("ad-table").innerHTML=rows.map((g,i)=>{
      const id=String((state.page-1)*state.pageSize+i);
      const main=`<tr><td><strong>${esc(g.allocation)}</strong></td><td>${esc(g.situation)}</td><td>${number(g.documentsCount)}</td>
        <td>${number(g.completed)}</td><td>${number(g.pending)}</td><td>${esc(g.lastSentAt||"—")}</td>
        <td><button type="button" class="secondary-button" data-ad-detail="${id}" aria-expanded="${state.detail===id}">${state.detail===id?"Fechar":"Documentos"}</button></td></tr>`;
      if(state.detail!==id)return main;
      const items=(g.allItems||g.items).map(r=>`<tr><td>${esc(r.document)}</td><td>${esc(r.allocationStatus||"Não informado")}</td><td>${esc(r.sentAt)}</td>
        <td>${esc(r.fiscal1ReturnedAt)}</td><td>${esc(r.fiscal2ReturnedAt)}</td>
        <td>${esc([r.fiscalComment,r.fiscal2Comment,r.remarks].filter(Boolean).join(" · "))}</td></tr>`).join("");
      return main+`<tr class="allocation-dashboard-detail"><td colspan="7"><div class="allocation-dashboard-detail-list">
        <strong>Documentos: ${esc(g.allocation)}</strong>
        <table><thead><tr><th>Documento</th><th>Status</th><th>Envio</th><th>Retorno Fiscal 01</th><th>Retorno Fiscal 02</th><th>Comentários / observações</th></tr></thead><tbody>${items}</tbody></table>
        </div></td></tr>`;
    }).join("")||'<tr><td colspan="7">Nenhuma alocação encontrada.</td></tr>';
    $("ad-count").textContent=`${number(a.groups.length)} alocações · ${number(a.documents)} documentos · ${number(a.links)} vínculos`;
    $("ad-page").textContent=`Página ${state.page} de ${pages}`;
    $("ad-prev").disabled=state.page===1;$("ad-next").disabled=state.page===pages;
    $("ad-export").disabled=!a.links||!state.version||state.busy;
  }
  async function exportExcel(){
    if(!state.version||!state.aggregated?.links||state.busy)return;
    const snapshot=registry()?.current?.();
    if(!snapshot||snapshot.stale||snapshot.id!==state.version){show("Sincronize a base antes de exportar.",true);return;}
    state.busy=true;$("ad-export").disabled=true;
    try{
      await root.GRCONModuleLoader.ensure("xlsx");
      const XLSX=root.XLSX;if(!XLSX)throw Error("Biblioteca Excel indisponível.");
      const data=Model.exportData(state.aggregated,{
        contract:root.GrconCloud?.state?.membership?.workspace_name||"Contrato atual",
        fileName:snapshot.fileName,updatedAt:snapshot.updatedAt,
        filters:Object.entries(state.options).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`).join(" · ")||"Sem filtros"});
      const wb=XLSX.utils.book_new();
      for(const [name,rows] of [["Resumo",data.summary],["Alocações",data.allocations],["Documentos",data.documents]]){
        const safe=rows.map(line=>line.map(v=>typeof v==="string"&&/^[=+\-@\t\r]/.test(v)?"'"+v:v));
        const sh=XLSX.utils.aoa_to_sheet(safe);
        sh["!cols"]=rows[0].map(label=>({wch:Math.min(40,Math.max(16,t(label).length+5))}));
        sh["!autofilter"]={ref:sh["!ref"]};XLSX.utils.book_append_sheet(wb,sh,name);
      }
      XLSX.writeFile(wb,"GRCON_Dashboard_Alocacao_"+new Date().toISOString().slice(0,10)+".xlsx");show("");
    }catch(err){show("Não foi possível exportar: "+t(err.message||err),true);}
    finally{state.busy=false;render();}
  }
  root.GrconAllocationDashboardUi=Object.freeze({activate:()=>{shell();void load();},refresh:()=>load(true)});
  root.addEventListener("grcon:allocation-registry-updated",()=>{if($("allocation-dashboard-root")?.dataset.ready)readSnapshot();});
  root.addEventListener("grcon:contract-context-changed",()=>{if($("allocation-dashboard-root")?.dataset.ready)void load(true);});
})(window);
