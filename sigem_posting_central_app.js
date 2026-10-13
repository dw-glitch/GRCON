(function(root){
  "use strict";
  const $=(s,n)=>(n||document).querySelector(s);
  const Query=root.GrconSigemCentralQuery,View=root.GrconSigemCentralRender;
  const History=root.GrconHistory;
  const DEFAULT=["document","title","revisionSent","revisionFound",
    "statusLabel","sigemStatus","egrdtNumber","generatedAt","sendCount"];
  const state={view:"documentos",panel:"central",query:"",filters:{},columns:DEFAULT.slice(),
    showColumns:false,sort:{key:"",dir:"asc"},widths:{},keepScroll:false,data:null,filtered:{rows:[],missing:[]},generation:0,pinned:["document"],savedViews:[]};
  function workspace(){return root.GrconCloud?.state?.membership?.workspace_id||"unavailable";}
  function storageKey(){return "grcon.sigem.central.preferences.v2:"+workspace()+":"+(root.GrconCloud?.state?.session?.user?.id||"anonymous");}
  function loadColumns(){
    try{
      const v=JSON.parse(localStorage.getItem(storageKey())||"null");
      const valid=new Set(root.GrconSigemCentralCore.COLUMNS.map(c=>c[0]));
      state.columns=Array.isArray(v?.columns)?[...new Set(v.columns.filter(k=>valid.has(k)))]:DEFAULT.slice();
      if(!state.columns.length)state.columns=DEFAULT.slice();
      state.widths=v?.widths&&typeof v.widths==="object"?Object.fromEntries(
        Object.entries(v.widths).filter(([k,n])=>valid.has(k)&&Number(n)>=90&&Number(n)<=600)):{};
      state.sort=valid.has(v?.sort?.key)?{key:v.sort.key,dir:v.sort.dir==="desc"?"desc":"asc"}:{key:"",dir:"asc"};
      state.pinned=Array.isArray(v?.pinned)?v.pinned.filter(k=>valid.has(k)):["document"];
      state.savedViews=Array.isArray(v?.savedViews)?v.savedViews.filter(item=>typeof item?.name==="string"&&Array.isArray(item.columns)).slice(0,20).map(item=>({
        name:item.name.slice(0,60),columns:[...new Set(item.columns.filter(k=>valid.has(k)))],
        widths:Object.fromEntries(Object.entries(item.widths||{}).filter(([k,n])=>valid.has(k)&&Number(n)>=90&&Number(n)<=600)),
        pinned:(Array.isArray(item.pinned)?item.pinned:[]).filter(k=>valid.has(k)),
        sort:valid.has(item.sort?.key)?{key:item.sort.key,dir:item.sort.dir==="desc"?"desc":"asc"}:{key:"",dir:"asc"},
        filters:item.filters&&typeof item.filters==="object"?item.filters:{},
        view:["documentos","grdts","revisoes","pendencias"].includes(item.view)?item.view:"documentos"
      })).filter(item=>item.columns.length):[];
    }catch(_){state.pinned=["document"];state.savedViews=[];state.columns=DEFAULT.slice();state.widths={};state.sort={key:"",dir:"asc"};}
  }
  function saveColumns(){try{localStorage.setItem(storageKey(),JSON.stringify({
    columns:state.columns,widths:state.widths,sort:state.sort,pinned:state.pinned,savedViews:state.savedViews
  }));}catch(_){}}
  function notify(msg,type){
    if(typeof root.GrconNotify==="function")root.GrconNotify(msg,type||"info");
  }
  function shell(){
    const module=$("#sigem-module");if(!module)return false;
    module.innerHTML=
      '<section class="scc" id="sigem-central-workspace">'+
      '<header class="scc-heading"><div><span>CENTRAL OPERACIONAL</span>'+
      '<h2>Central de Postagem SIGEM</h2>'+
      '<p>Consulta, conferência e rastreabilidade documental</p></div>'+
      '<div class="scc-header-actions"><button type="button" id="scc-monitor-open" class="secondary-button compact">Evolução e monitoramento</button><button type="button" id="scc-technical-open" class="secondary-button compact">Conferir pacote .xls</button></div></header>'+
      '<p class="scc-base" id="sigem-central-base" role="status"></p>'+
      '<div class="scc-query"><input type="search" id="scc-query" autocomplete="off" '+
      'placeholder="Pesquisar documento, GRDT, título ou revisão" aria-label="Pesquisa universal"/>'+
      '<button type="button" id="scc-list-toggle" class="secondary-button compact">Consultar lista</button></div>'+
      '<div class="scc-list" id="scc-list-panel" hidden><label for="scc-list-input">Cole uma lista de códigos, um por linha</label>'+
      '<textarea id="scc-list-input" rows="4" placeholder="Códigos separados por linha, vírgula ou ponto e vírgula"></textarea>'+
      '<button type="button" id="scc-clear-list" class="secondary-button compact">Limpar lista</button></div>'+
      '<nav class="scc-views" aria-label="Tipo de consulta">'+
      [["documentos","Documentos"],["grdts","GRDTs"],["revisoes","Revisões"],["pendencias","Pendências"]]
       .map(([key,label])=>'<button type="button" data-scc-view="'+key+'"'+(key===state.view?' class="active"':'')+'>'+label+'</button>').join("")+
      '</nav>'+
      '<div class="scc-filters">'+
      '<label>Situação <select id="scc-status"><option value="">Todas</option>'+
      [["CONFIRMADO","Identificado"],["AGUARDANDO","Aguardando"],["NAO_ENCONTRADO","Não encontrado"],
       ["REVISAO_DIVERGENTE","Revisão divergente"],["REQUER_ANALISE","Requer análise"],
       ["NAO_VERIFICADO","Não verificado"],["SEM_ENVIO","Sem envio registrado"]]
       .map(([value,label])=>'<option value="'+value+'">'+label+'</option>').join("")+
      '</select></label>'+
      '<label>Alocação <select id="scc-allocation"><option value="">Todas</option>'+
      '<option value="Alocado">Alocado</option><option value="Não alocado">Não alocado</option>'+
      '<option value="Alocação a confirmar">Não identificado</option></select></label>'+
      '<label>Status SIGEM <input id="scc-sigem-status" placeholder="Todos"/></label>'+
      '<label>Revisão <input id="scc-revision" placeholder="Todas" maxlength="8"/></label>'+
      '<label>Disciplina <input id="scc-discipline" placeholder="Todas"/></label>'+
      '<label>Propósito <input id="scc-purpose" placeholder="Todos"/></label>'+
      '<label>Fiscal <input id="scc-fiscal" placeholder="Comentários"/></label>'+
      '<label>Horas desde geração <input id="scc-age-min" type="number" min="0" placeholder="A partir de" title="Tempo operacional desde a geração; não representa envio comprovado ou SLA"/></label>'+
      '<label>De <input id="scc-start" type="date"/></label>'+
      '<label>Até <input id="scc-end" type="date"/></label>'+
      '<label class="scc-check"><input id="scc-reposts" type="checkbox"/> Com repostagens</label>'+
      '<label class="scc-check"><input id="scc-multiple-revisions" type="checkbox"/> Várias revisões</label>'+
      '<button id="scc-clear-filters" type="button" class="secondary-button compact">Limpar filtros</button>'+
      '</div>'+
      '<div class="scc-kpis" id="sigem-central-kpis"></div>'+
      '<div class="scc-toolbar"><div><strong id="sigem-central-count">0 resultados</strong>'+
      '<label class="scc-preset-label">Visualização <select id="scc-preset" aria-label="Visualização predefinida">'+
      '<option value="">Personalizada</option><option value="rapida">Consulta rápida</option>'+
      '<option value="completa">Conferência completa</option><option value="pendencias">Pendências</option>'+
      '<option value="fiscalizacao">Fiscalização</option><option value="historico">Histórico de revisões</option>'+
      '<option value="grdts">GRDTs</option></select></label></div>'+
      '<div><button id="scc-copy" type="button" class="secondary-button compact">Copiar códigos</button>'+
      '<button id="scc-columns" type="button" class="secondary-button compact">Colunas</button>'+
      '<button id="scc-export" type="button" class="primary-button compact">Exportar Excel</button></div></div>'+
      '<div id="sigem-central-column-pop" class="scc-column-pop" hidden>'+
      '<strong>Colunas visíveis</strong><div id="sigem-central-settings-body"></div>'+
      '<label>Nome da visualização <input id="scc-view-name" maxlength="60"/></label><button id="scc-view-save" type="button">Salvar visualização</button>'+
      '<label>Visualizações salvas <select id="scc-saved-views"><option value="">Selecione</option></select></label><button id="scc-view-delete" type="button">Excluir visualização</button>'+
      '<button id="scc-columns-reset" type="button">Restaurar padrão</button></div>'+
      '<p id="sigem-central-missing" class="scc-missing" hidden></p>'+
      '<button type="button" id="scc-copy-missing" class="secondary-button compact" hidden>Copiar todos os não encontrados</button>'+
      '<div id="sigem-central-table-scroll" class="scc-table-viewport" tabindex="0" aria-label="Tabela de consulta SIGEM">'+
      '<table class="scc-table"><thead id="sigem-central-thead"></thead>'+
      '<tbody id="sigem-central-tbody"></tbody></table></div>'+
      '<p class="scc-note">Base SIGEM e histórico GRCON: uma eGRDT gerada não comprova envio. Clique em uma linha para visualizar todas as ocorrências.</p>'+
      '</section>'+
      '<section id="sigem-technical-pane" class="scc-technical" hidden>'+
      '<button type="button" id="scc-back" class="secondary-button compact">← Voltar à central</button><div id="sigem-technical-content"></div></section>'+
      '<aside class="scc-detail" id="sigem-central-detail" role="dialog" aria-label="Detalhes do documento" hidden>'+
      '<button type="button" class="scc-close" aria-label="Fechar detalhes">×</button>'+
      '<div id="sigem-central-detail-body"></div></aside>';
    return true;
  }
  function filter(){
    if(!state.data)return;
    const listInput=$("#scc-list-input");
    const query=listInput&&!$("#scc-list-panel").hidden&&listInput.value.trim()?listInput.value:state.query;
    state.effectiveQuery=query;
    state.filtered=Query.filter(state.data,state.view,query,{...state.filters,listMode:!$("#scc-list-panel").hidden&&Boolean(listInput?.value.trim())},state.sort);
    View.draw(state);
    document.querySelectorAll("[data-scc-view]").forEach(button=>
      button.classList.toggle("active",button.dataset.sccView===state.view));
  }
  let dataWorker = null, cancelWorker = null;
  async function buildData(records,base,previousState,options){
    cancelWorker?.();
    if(records.reduce((n,r)=>n+(r.files?.length||0),0)+(base.records?.length||0)<2000||typeof Worker!=="function")
      return Query.build(records,base,previousState,options);
    $("#sigem-central-base").textContent="Atualizando a consulta…";
    return new Promise((resolve,reject)=>{
      let done=false;
      const finish=(value,error)=>{
        if(done)return;done=true;clearTimeout(timer);worker.terminate();
        if(dataWorker===worker){dataWorker=null;cancelWorker=null;}
        if(error)reject(error);else resolve(value);
      };
      let worker;
      try{worker=new Worker("workers/sigem_central.worker.js");}catch(error){reject(error);return;}
      dataWorker=worker;cancelWorker=()=>finish(null);
      const timer=setTimeout(()=>finish(null,new Error("A consulta excedeu o tempo de processamento. Tente atualizar novamente.")),30000);
      worker.onmessage=event=>event.data.ok?finish(event.data.result):finish(null,new Error(event.data.error));
      worker.onerror=event=>finish(null,new Error(event.message||"Falha no processamento da consulta."));
      worker.postMessage({records,base,previousState,options});
    });
  }
  let historyCache=null,historyRequest=null,historyVersion=0;
  async function centralHistory(scope){
    const cloud=root.GrconCloud;
    if(historyCache?.scope===scope&&historyCache.version===historyVersion)return historyCache;
    if(!cloud?.loadClassificationHistory||!cloud.state.online)return {records:History.read(),complete:false};
    if(historyRequest?.scope===scope&&historyRequest.version===historyVersion)return historyRequest.promise;
    const version=historyVersion;
    const promise=cloud.loadClassificationHistory().then(records=>{
      const result={scope,version,records,complete:true};
      if(scope===storageKey()&&version===historyVersion)historyCache=result;
      return result;
    }).catch(error=>({records:History.read(),complete:false,error:error.message}));
    historyRequest={scope,version,promise};
    try{return await promise;}finally{if(historyRequest?.promise===promise)historyRequest=null;}
  }
  async function computeRefresh(){
    const token=++state.generation;
    const activeWorkspace=root.GrconCloud?.state?.membership?.workspace_id;
    const active=Boolean(activeWorkspace),scope=storageKey();
    const history=active?await centralHistory(scope):{records:[],complete:false};
    if(token!==state.generation||scope!==storageKey())return;
    const records=history.records;
    const shared=root.GrconSharedSigemQuery;
    // Nunca cruzar registros de um contrato com a Consulta Geral de outro.
    const base=active&&shared?.state?.workspace===activeWorkspace?shared.current():null;
    const conference=root.GrconPostingConference;
    let previousState=state.workspace===activeWorkspace&&state.user===root.GrconCloud?.state?.session?.user?.id
      ?state.data?.confirmationState||{}:{};
    try{
      const storedScope=await conference.kvGet("shared-sigem-conference-workspace", "");
      if(storedScope===activeWorkspace&&scope===storageKey())previousState=await conference.loadState();
    }catch(_){/* Sem IndexedDB: mantém somente evidências da consulta atual desta sessão. */}
    if(token!==state.generation||scope!==storageKey())return;
    const data=await buildData(records,base||{records:[],meta:{}},previousState,{...conference.readPreferences(),now:new Date().toISOString()});
    if(!data||token!==state.generation||scope!==storageKey())return;
    data.historyComplete=history.complete;
    data.historyError=history.error||"";
    const registry=root.GrconAllocationRegistry;
    const requests=root.GrconRequestsControl;
    if(active){
      const resolved=new Map();
      const apply=row=>{
        if(!resolved.has(row.documentIdentity)){
          const info=registry?.resolve?.(row.document)||{};
          const comments=registry?.fiscalComments?.(row.document)||[];
          const refs=Array.isArray(info.references)?info.references:[];
          const unique=values=>[...new Set(values.filter(Boolean))].join(" | ");
          const requestRows=requests?.current?.()?requests.find(row.document)||[]:[];
          const entry={
            allocationWorkflow:unique(refs.map(r=>r.workflow)),
            allocationCurrentStatus:unique(refs.map(r=>r.allocationStatus)),
            allocationSource:"Documentos Previstos: "+(info.plannedSnapshotId||"indisponível")+" · Central de Alocação: "+(info.centralSnapshotId||"indisponível"),
            fiscalSource:info.centralSnapshotId?"Central de Alocação · "+info.centralSnapshotId:"Histórico de eGRDT (informação histórica)",
            allocationState:info.label||"Alocação a confirmar",
            allocation:info.allocations?.join(" · ")||"",
            fiscalComment:unique(comments)||undefined,
            fiscal2Comment:unique(refs.map(r=>r.fiscal2Comment))||undefined,
            fiscal1ReturnedAt:unique(refs.map(r=>r.fiscal1ReturnedAt)),
            fiscal2ReturnedAt:unique(refs.map(r=>r.fiscal2ReturnedAt)),
            requestsCount:requestRows.length,
            requestsDetail:unique(requestRows.map(r=>r.sheet+" · linha "+r.sourceRow)),
            allocationNotes:info.warnings?.join(" · ")||"",
          };
          resolved.set(row.documentIdentity,entry);
        }
        const enrichment={...resolved.get(row.documentIdentity)};
        if(enrichment.fiscalComment===undefined)delete enrichment.fiscalComment;
        if(enrichment.fiscal2Comment===undefined)delete enrichment.fiscal2Comment;
        Object.assign(row,enrichment);
      };
      data.documents.forEach(apply);
      data.events.forEach(apply);
    }
    if(token!==state.generation||activeWorkspace!==root.GrconCloud?.state?.membership?.workspace_id)return;
    const trace=root.GrconTeamsTrace,traceCore=root.GrconTeamsTraceCore;
    for(const row of [...data.documents,...data.events]){
      const attempt=trace?.latest?.({id:row.historyId,workspaceId:activeWorkspace});
      row.sendEvidenceLabel=attempt&&traceCore?traceCore.label(attempt):(row.sendCount===0?"Sem emissão registrada":"Geração registrada; envio não comprovado");
      row.teamsDeliveredAt=attempt?.delivered_at||"";
      row.teamsDeclaration=attempt&&traceCore?traceCore.confirmed(attempt,row):"Não informado";
      // Declaração Teams permanece independente da confirmação por Consulta Geral.
    }
    const oldWorkspace=state.workspace,oldUser=state.user;
    state.workspace=workspace();
    state.user=root.GrconCloud?.state?.session?.user?.id||"anonymous";
    if(oldWorkspace!==state.workspace||oldUser!==state.user){loadColumns();renderSavedViews();}
    state.data=data;
    filter();
  }
  async function refresh(){
    const scope=workspace();
    const currentUser=root.GrconCloud?.state?.session?.user?.id||"anonymous";
    if(state.workspace&&
        (state.workspace!==scope||(state.user&&state.user!==currentUser))){
      state.data=null;state.filtered={rows:[],missing:[]};
      state.query="";state.filters={};state.selectedRow=null;
      $("#scc-query").value="";$("#scc-list-input").value="";
      document.querySelectorAll(".scc-filters input,.scc-filters select").forEach(el=>{
        if(el.type==="checkbox")el.checked=false;else el.value="";
      });
      $("#sigem-central-detail").hidden=true;
      state.workspace=scope;state.user=currentUser;
      state.showColumns=false;$("#scc-view-name").value="";
      loadColumns();renderSavedViews();
      state.data=Query.build([],{records:[],meta:{}},{});
      filter(); // Limpa o DOM antes de qualquer leitura assíncrona do novo contexto.
    }
    try{
      state.lastError="";
      await computeRefresh();
    }catch(error){
      const message=String(error?.message||error||"Erro desconhecido");
      // Um workspace novo jamais pode visualizar resultados anteriores durante erro.
      if(state.workspace!==scope){
        state.data=null;
        state.workspace=scope;
        loadColumns();
      }
      if(state.lastError!==message)notify("Falha na consulta SIGEM: "+message,"error");
      state.lastError=message;
      if(!state.data){
        state.data=Query.build([],{records:[],meta:{}},{});
      }
      filter();
    }
  }
  function exportExcel(){
    const keys=state.columns,rows=state.filtered.rows;
    if(!rows.length){notify("Nenhum resultado para exportar.");return;}
    const labels=Object.fromEntries(root.GrconSigemCentralCore.COLUMNS);
    const safe=v=>{
      const t=String(v==null?"":v);
      return /^\s*[=+\-@]/.test(t)||/^[\t\r\n]/.test(t)?"'"+t:t;
    };
    const meta=state.data.meta||{};
    const cells=[keys.map(k=>labels[k]||k),...rows.map(row=>keys.map(k=>safe(row[k])))];
    const XLSX=root.XLSX;
    if(!XLSX?.utils?.aoa_to_sheet||!XLSX.writeFile){
      notify("Leitor Excel indisponível. Reabra o módulo e tente novamente.","error");return;
    }
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(cells),"Consulta");
    const info=XLSX.utils.aoa_to_sheet([["Consulta Geral",meta.fileName||"Indisponível"],
      ["Data de referência",meta.referenceDate||meta.importedAt||""],
      ["Snapshot",meta.snapshotId||""],["Origem",meta.source||"Consulta Geral compartilhada/local"],
      ["Contrato",workspace()],["Usuário",root.GrconCloud?.state?.session?.user?.id||""],
      ["Tipo de consulta",state.view],["Pesquisa",state.effectiveQuery],
      ["Filtros",JSON.stringify(state.filters)],["Ordenação",JSON.stringify(state.sort)],
      ["Colunas",keys.join(" | ")],["Base desatualizada",String(Boolean(root.GrconSharedSigemQuery?.state?.stale))],
      ["Histórico completo",String(Boolean(state.data.historyComplete))],["Total de resultados",rows.length],["Não encontrados",state.filtered.missing.join(" | ")],
      ["Gerado em",new Date().toISOString()]].map(row=>row.map(safe)));
    XLSX.utils.book_append_sheet(wb,info,"Fonte e filtros");
    if(state.filtered.missing.length){
      const missing=XLSX.utils.aoa_to_sheet([["Código não encontrado"],...state.filtered.missing.map(code=>[safe(code)])]);
      XLSX.utils.book_append_sheet(wb,missing,"Não encontrados");
    }
    if(state.view==="grdts"){
      const details=rows.flatMap(group=>(group.rows||[]).map(row=>[
        group.egrdtNumber,row.document,row.revisionSent,row.revisionFound,row.statusLabel,row.sigemStatus,row.purpose,row.generatedAt,row.note
      ].map(safe)));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["eGRDT","Documento","Revisão registrada","Revisão SIGEM","Conferência","Status SIGEM","Propósito","Data da geração","Diagnóstico"],...details]),"Documentos das GRDTs");
    }
    XLSX.writeFile(wb,"GRCON_Central_Postagem_SIGEM_"+new Date().toISOString().slice(0,10)+".xlsx");
  }
  function closeDetail(){
    $("#sigem-central-detail").hidden=true;state.selectedRow=null;
    if(state.detailReturnFocus?.isConnected)state.detailReturnFocus.focus();
  }
  function renderSavedViews(){
    $("#scc-saved-views").innerHTML='<option value="">Selecione</option>'+state.savedViews.map((v,i)=>
      '<option value="'+i+'">'+View.h(v.name)+'</option>').join("");
  }
  function bind(){
    $("#scc-view-save").addEventListener("click",()=>{
      const name=$("#scc-view-name").value.trim();if(!name)return;
      const entry={name,columns:state.columns.slice(),widths:{...state.widths},pinned:state.pinned.slice(),sort:{...state.sort},view:state.view,filters:JSON.parse(JSON.stringify(state.filters))};
      state.savedViews=state.savedViews.filter(v=>v.name!==name);state.savedViews.push(entry);state.savedViews=state.savedViews.slice(-20);
      saveColumns();renderSavedViews();notify("Visualização salva.","success");
    });
    $("#scc-saved-views").addEventListener("change",e=>{
      const entry=state.savedViews[Number(e.target.value)];if(e.target.value===""||!entry)return;
      state.columns=entry.columns.slice();state.widths={...entry.widths};state.pinned=(entry.pinned||[]).slice();state.sort={...entry.sort};state.view=entry.view||"documentos";state.filters=JSON.parse(JSON.stringify(entry.filters||{}));
      const controls={ageMinHours:"scc-age-min",status:"scc-status",allocationState:"scc-allocation",revision:"scc-revision",discipline:"scc-discipline",purpose:"scc-purpose",fiscal:"scc-fiscal",start:"scc-start",end:"scc-end",sigemStatus:"scc-sigem-status",reposts:"scc-reposts",multipleRevisions:"scc-multiple-revisions"};
      Object.entries(controls).forEach(([key,id])=>{const el=$("#"+id);if(el.type==="checkbox")el.checked=Boolean(state.filters[key]);else el.value=state.filters[key]||"";});
      saveColumns();filter();
    });
    $("#scc-view-delete").addEventListener("click",()=>{
      const value=$("#scc-saved-views").value;if(value==="")return;
      state.savedViews.splice(Number(value),1);saveColumns();renderSavedViews();
    });
    $("#sigem-central-settings-body").addEventListener("change",e=>{
      const key=e.target.dataset.sccPin;if(!key)return;
      state.pinned=e.target.checked?[...new Set([...state.pinned,key])]:state.pinned.filter(k=>k!==key);
      state.keepScroll=true;saveColumns();filter();
    });
    $("#sigem-central-thead").addEventListener("change",e=>{
      const key=e.target.dataset.sccFilter;if(!key)return;
      state.filters.columns={...state.filters.columns,[key]:e.target.value};filter();
    });
    let dragged="";
    $("#sigem-central-thead").addEventListener("dragstart",e=>{
      if(!e.target.matches("th")){e.preventDefault();return;}
      dragged=e.target.dataset.sccKey;e.dataTransfer.setData("text/plain",dragged);
    });
    $("#sigem-central-thead").addEventListener("dragover",e=>e.preventDefault());
    $("#sigem-central-thead").addEventListener("drop",e=>{
      e.preventDefault();const target=e.target.closest("[data-scc-key]")?.dataset.sccKey;
      if(!dragged||!target||dragged===target)return;
      state.columns=state.columns.filter(k=>k!==dragged);state.columns.splice(state.columns.indexOf(target),0,dragged);
      dragged="";state.keepScroll=true;saveColumns();filter();
    });
    $("#sigem-central-thead").addEventListener("pointerdown",e=>{
      const key=e.target.dataset.sccResize;if(!key)return;e.preventDefault();
      const start=e.clientX,width=Number(state.widths[key]||180);e.target.setPointerCapture(e.pointerId);
      const move=event=>{
        state.widths[key]=Math.max(90,Math.min(600,width+event.clientX-start));
        const index=state.columns.indexOf(key),table=$(".scc-table");
        table.querySelectorAll("col")[index].style.width=state.widths[key]+"px";
        const header=table.querySelectorAll("th")[index];header.style.width=state.widths[key]+"px";header.style.minWidth=state.widths[key]+"px";
        table.style.width=state.columns.reduce((n,k)=>n+Number(state.widths[k]||180),0)+"px";View.pinColumns(state);
      };
      const end=()=>{e.target.removeEventListener("pointermove",move);e.target.removeEventListener("pointerup",end);e.target.removeEventListener("pointercancel",end);state.keepScroll=true;saveColumns();filter();};
      e.target.addEventListener("pointermove",move);e.target.addEventListener("pointerup",end);e.target.addEventListener("pointercancel",end);
    });
    $("#scc-query").addEventListener("input",e=>{state.query=e.target.value;filter();});
    $("#scc-list-toggle").addEventListener("click",()=>{
      $("#scc-list-panel").hidden=!$("#scc-list-panel").hidden;
      if(!$("#scc-list-panel").hidden)$("#scc-list-input").focus();
      filter();
    });
    $("#scc-list-input").addEventListener("input",filter);
    $("#scc-clear-list").addEventListener("click",()=>{
      $("#scc-list-input").value="";filter();
    });
    document.querySelectorAll("[data-scc-view]").forEach(button=>
      button.addEventListener("click",()=>{state.view=button.dataset.sccView;filter();}));
    [["scc-age-min","ageMinHours"],["scc-sigem-status","sigemStatus"],["scc-multiple-revisions","multipleRevisions"],["scc-status","status"],["scc-allocation","allocationState"],["scc-revision","revision"],["scc-discipline","discipline"],["scc-purpose","purpose"],["scc-fiscal","fiscal"],["scc-reposts","reposts"],["scc-start","start"],["scc-end","end"]]
      .forEach(([id,key])=>$("#"+id).addEventListener("input",e=>{
        state.filters[key]=e.target.type==="checkbox"?e.target.checked:e.target.value;filter();
      }));
    $("#scc-clear-filters").addEventListener("click",()=>{
      state.filters={};
      ["scc-age-min","scc-sigem-status","scc-status","scc-allocation","scc-revision","scc-discipline","scc-purpose","scc-fiscal","scc-start","scc-end"].forEach(id=>$("#"+id).value="");
      $("#scc-reposts").checked=false;$("#scc-multiple-revisions").checked=false;
      filter();
    });
    $("#scc-preset").addEventListener("change",event=>{
      const chosen=event.target.value;
      const presets={
        rapida:["document","revisionSent","revisionFound","statusLabel","sigemStatus","egrdtNumber"],
        completa:root.GrconSigemCentralCore.COLUMNS.map(([key])=>key),
        pendencias:["document","revisionSent","revisionFound","statusLabel","egrdtNumber","generatedAt","allocationState","note"],
        fiscalizacao:["document","title","allocation","allocationState","fiscalComment","fiscal2Comment","sigemStatus","statusLabel"],
        historico:["document","revisionSent","revisionFound","egrdtNumber","purpose","generatedAt","sigemStatus","statusLabel"],
        grdts:["document","title","statusLabel","sendCount","generatedAt","note"]
      };
      if(!presets[chosen])return;
      state.columns=presets[chosen].slice();
      state.view=chosen==="grdts"?"grdts":chosen==="historico"?"revisoes":
        chosen==="pendencias"?"pendencias":"documentos";
      saveColumns();filter();
    });
    $("#scc-columns").addEventListener("click",()=>{
      state.showColumns=!state.showColumns;
      if(state.showColumns){View.settings(state);renderSavedViews();}
      $("#sigem-central-column-pop").hidden=!state.showColumns;
    });
    $("#sigem-central-settings-body").addEventListener("change",e=>{
      const key=e.target.dataset.sccColumn;if(!key)return;
      if(e.target.checked&&!state.columns.includes(key))state.columns.push(key);
      if(!e.target.checked&&state.columns.length>1)state.columns=state.columns.filter(k=>k!==key);
      state.keepScroll=true;saveColumns();filter();
    });
    $("#sigem-central-thead").addEventListener("click",event=>{
      const key=event.target.closest("[data-scc-sort]")?.dataset.sccSort;
      if(!key)return;
      state.sort=state.sort.key===key?{key,dir:state.sort.dir==="asc"?"desc":"asc"}:{key,dir:"asc"};
      saveColumns();filter();
    });
    $("#sigem-central-settings-body").addEventListener("click",event=>{
      const button=event.target.closest("[data-scc-move]");
      if(!button)return;
      const index=state.columns.indexOf(button.dataset.sccMove);
      const target=index+Number(button.dataset.sccDirection);
      if(index<0||target<0||target>=state.columns.length)return;
      const moved=state.columns.splice(index,1)[0];
      state.columns.splice(target,0,moved);
      state.keepScroll=true;saveColumns();filter();
    });
    $("#sigem-central-settings-body").addEventListener("change",event=>{
      const key=event.target.dataset.sccWidth;
      if(!key)return;
      state.widths[key]=Math.max(90,Math.min(600,Number(event.target.value)||180));
      state.keepScroll=true;saveColumns();filter();
    });
    $("#scc-columns-reset").addEventListener("click",()=>{
      state.columns=DEFAULT.slice();state.widths={};state.sort={key:"",dir:"asc"};state.pinned=["document"];
      saveColumns();filter();
    });
    $("#scc-export").addEventListener("click",()=>{try{exportExcel();}catch(error){notify("Falha ao exportar Excel: "+error.message,"error");}});
    $("#scc-copy-missing").addEventListener("click",async()=>{
      if(!state.filtered.missing.length)return;
      try{
        await navigator.clipboard.writeText(state.filtered.missing.join("\n"));
        notify(state.filtered.missing.length+" código(s) não encontrado(s) copiados.","success");
      }catch(_){notify("Não foi possível copiar os códigos.","warning");}
    });
    $("#scc-copy").addEventListener("click",async()=>{
      const codes=[...new Set(state.filtered.rows.map(row=>row.document).filter(Boolean))];
      if(!codes.length){notify("Nenhum código para copiar.");return;}
      try{
        await navigator.clipboard.writeText(codes.join("\n"));
        notify(codes.length+" código(s) copiado(s).","success");
      }catch(_){notify("Não foi possível copiar os códigos neste navegador.","warning");}
    });
    let scrollFrame=0;
    $("#sigem-central-table-scroll").addEventListener("scroll",()=>{
      if(scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;View.drawRows(state);View.pinColumns(state);});
    },{passive:true});
    $("#sigem-central-tbody").addEventListener("click",e=>{
      const line=e.target.closest("[data-scc-index]");
      if(line)View.detail(state,Number(line.dataset.sccIndex));
    });
    $("#sigem-central-tbody").addEventListener("keydown",e=>{
      if(e.key==="Enter"){
        const line=e.target.closest("[data-scc-index]");
        if(line)View.detail(state,Number(line.dataset.sccIndex));
      }
    });
    $("#sigem-central-detail").addEventListener("click",async e=>{
      if(e.target.closest(".scc-close")){
        closeDetail();return;
      }
      if(e.target.closest("[data-scc-open-control]")){
        $("#sigem-central-detail").hidden=true;
        await root.GRCONModuleLoader.ensureModule("control");
        return;
      }
      if(e.target.closest("[data-scc-monitor-document]")){
        const codes=state.selectedRow?.rows?state.selectedRow.rows.map(r=>r.document):[state.selectedRow?.document];
        const scope=storageKey();
        try{
          await root.GRCONModuleLoader.ensureModule("requests");if(scope!==storageKey())return;
          document.querySelector('[data-requests-area="sigem-monitoring"]')?.click();
          const input=$("#sigem-monitor-code");
          if(input&&codes.length===1){input.value=codes[0]||"";input.focus();}
          closeDetail();
        }catch(error){notify(error.message,"error");}return;
      }
      let value="";
      if(e.target.closest("[data-scc-copy-code]"))value=state.selectedRow?.document||"";
      if(e.target.closest("[data-scc-copy-pending],[data-scc-prepare-pending]")){
        if(!state.data?.hasBase||root.GrconSharedSigemQuery?.state?.stale){
          notify("Atualize a Consulta Geral antes de preparar a lista de pendências.","warning");return;
        }
        const rows=state.selectedRow?.rows||[];
        const selected=new Set([...$("#sigem-central-detail").querySelectorAll("[data-scc-pending-index]:checked")].map(input=>Number(input.dataset.sccPendingIndex)));
        const eligible=rows.filter((row,index)=>selected.has(index)&&root.GrconPostingConference?.repostEligibility?.(row).eligible);
        value=[...new Set(eligible.map(row=>row.document))].join("\n");
        if(!eligible.length){notify("Selecione os itens pendentes que deseja analisar.");return;}
        if(e.target.closest("[data-scc-prepare-pending]")){
          const scope=storageKey();
          try{
            await root.GRCONModuleLoader.ensureModule("control");
            if(scope!==storageKey())return;
            if(!root.GrconTriageUiApi?.prepareRelationDraft(value.split("\n")))throw new Error("A relação documental não está disponível.");
            closeDetail();
          }catch(error){notify(error.message,"error");}
          return;
        }
      }
      if(value){
        try{await navigator.clipboard.writeText(value);
          notify("Códigos copiados para avaliação manual.","success");
        }catch(_){notify("Não foi possível copiar neste navegador.","warning");}
      }
    });
    $("#scc-monitor-open").addEventListener("click",async()=>{
      const scope=workspace();
      try{
        await root.GRCONModuleLoader.ensureModule("requests");
        if(scope!==workspace())return;
        const area=document.querySelector('[data-requests-area="sigem-monitoring"]');
        if(!area)throw new Error("A área de monitoramento ainda não está disponível.");
        area.click();
      }catch(error){notify(error.message||"Não foi possível abrir o monitoramento.","error");}
    });
    $("#scc-technical-open").addEventListener("click",()=>openTechnical());
    $("#scc-back").addEventListener("click",()=>openCentral());
    root.addEventListener("keydown",e=>{
      const panel=$("#sigem-central-detail");
      if(e.key==="Tab"&&!panel.hidden){
        const controls=[...panel.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(el=>!el.disabled);
        const first=controls[0],last=controls.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
      if(e.key==="Escape"&&!$("#sigem-central-detail").hidden){
        closeDetail();
      }
    });
    ["grcon:history-updated","grcon:shared-sigem-updated",
      "grcon:cloud-ready","grcon:cloud-signed-out","grcon:cloud-offline","grcon:conference-workspace-reset",
      "grcon:teams-trace-updated","grcon:allocation-registry-updated","grcon:planned-documents-updated",
      "grcon:requests-control-updated","grcon:contract-context-changed"]
      .forEach(name=>root.addEventListener(name,()=>{
        if(["grcon:history-updated","grcon:cloud-ready","grcon:cloud-signed-out","grcon:contract-context-changed","grcon:conference-workspace-reset"].includes(name)){
          historyVersion++;historyCache=null;
        }
        if(["grcon:cloud-signed-out","grcon:contract-context-changed"].includes(name))cancelWorker?.();
        void refresh();
      }));
    root.addEventListener("grcon:module-ready",e=>{
      if(e.detail?.module==="sigem")void refresh();
    });
    root.addEventListener("storage",e=>{
      if(e.key===History.STORAGE_KEY){historyVersion++;historyCache=null;void refresh();}
    });
  }
  function openTechnical(){
    state.panel="technical";
    $("#sigem-central-workspace").hidden=true;
    $("#sigem-technical-pane").hidden=false;
  }
  function openCentral(){
    state.panel="central";
    $("#sigem-central-workspace").hidden=false;
    $("#sigem-technical-pane").hidden=true;
    state.keepScroll=true;filter();
  }
  if(shell()){
    loadColumns();bind();
    root.GrconSigemCentralUi=Object.freeze({state,refresh,openTechnical,openCentral});
    void refresh();
  }
})(window);
