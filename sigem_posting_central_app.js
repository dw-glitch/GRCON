(function(root){
  "use strict";
  const $=(s,n)=>(n||document).querySelector(s);
  const Query=root.GrconSigemCentralQuery,View=root.GrconSigemCentralRender;
  const History=root.GrconHistory;
  const DEFAULT=["document","title","revisionSent","revisionFound",
    "statusLabel","sigemStatus","egrdtNumber","generatedAt","sendCount"];
  const state={view:"documentos",panel:"central",query:"",filters:{},columns:DEFAULT.slice(),
    showColumns:false,sort:{key:"",dir:"asc"},widths:{},keepScroll:false,data:null,filtered:{rows:[],missing:[]},generation:0};
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
    }catch(_){state.columns=DEFAULT.slice();state.widths={};state.sort={key:"",dir:"asc"};}
  }
  function saveColumns(){try{localStorage.setItem(storageKey(),JSON.stringify({
    columns:state.columns,widths:state.widths,sort:state.sort
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
      '<label>Revisão <input id="scc-revision" placeholder="Todas" maxlength="8"/></label>'+
      '<label>Disciplina <input id="scc-discipline" placeholder="Todas"/></label>'+
      '<label>Propósito <input id="scc-purpose" placeholder="Todos"/></label>'+
      '<label>Fiscal <input id="scc-fiscal" placeholder="Comentários"/></label>'+
      '<label>De <input id="scc-start" type="date"/></label>'+
      '<label>Até <input id="scc-end" type="date"/></label>'+
      '<label class="scc-check"><input id="scc-reposts" type="checkbox"/> Com repostagens</label>'+
      '<button id="scc-clear-filters" type="button" class="secondary-button compact">Limpar filtros</button>'+
      '</div>'+
      '<div class="scc-kpis" id="sigem-central-kpis"></div>'+
      '<div class="scc-toolbar"><strong id="sigem-central-count">0 resultados</strong>'+
      '<div><button id="scc-copy" type="button" class="secondary-button compact">Copiar códigos</button>'+
      '<button id="scc-columns" type="button" class="secondary-button compact">Colunas</button>'+
      '<button id="scc-export" type="button" class="primary-button compact">Exportar Excel</button></div></div>'+
      '<div id="sigem-central-column-pop" class="scc-column-pop" hidden>'+
      '<strong>Colunas visíveis</strong><div id="sigem-central-settings-body"></div>'+
      '<button id="scc-columns-reset" type="button">Restaurar padrão</button></div>'+
      '<p id="sigem-central-missing" class="scc-missing" hidden></p>'+
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
    state.filtered=Query.filter(state.data,state.view,query,state.filters,state.sort);
    View.draw(state);
    document.querySelectorAll("[data-scc-view]").forEach(button=>
      button.classList.toggle("active",button.dataset.sccView===state.view));
  }
  async function refresh(){
    const token=++state.generation;
    const activeWorkspace=root.GrconCloud?.state?.membership?.workspace_id;
    const active=Boolean(activeWorkspace);
    const records=active?History.read():[];
    const shared=root.GrconSharedSigemQuery;
    // Nunca cruzar registros de um contrato com a Consulta Geral de outro.
    const base=active&&shared?.state?.workspace===activeWorkspace?shared.current():null;
    const data=Query.build(records,base||{records:[],meta:{}},{});
    const registry=root.GrconAllocationRegistry;
    if(active&&registry?.resolve){
      const resolved=new Map();
      const apply=row=>{
        if(!resolved.has(row.documentIdentity)){
          const info=registry.resolve(row.document);
          const comments=registry.fiscalComments?.(row.document)||[];
          resolved.set(row.documentIdentity,{
            allocationState:info.label||"Alocação a confirmar",
            allocation:info.allocations?.join(" · ")||"",
            fiscalComment:comments.length?comments.join(" | "):undefined,
            allocationNotes:info.warnings?.join(" · ")||"",
          });
        }
        const enrichment={...resolved.get(row.documentIdentity)};
        if(enrichment.fiscalComment===undefined)delete enrichment.fiscalComment;
        Object.assign(row,enrichment);
      };
      data.documents.forEach(apply);
      data.revisions.forEach(apply);
    }
    if(token!==state.generation)return;
    const oldWorkspace=state.workspace;
    state.workspace=workspace();
    if(oldWorkspace!==state.workspace)loadColumns();
    state.data=data;
    filter();
  }
  function exportExcel(){
    const keys=state.columns,rows=state.filtered.rows;
    if(!rows.length){notify("Nenhum resultado para exportar.");return;}
    const labels=Object.fromEntries(root.GrconSigemCentralCore.COLUMNS);
    const safe=v=>{const t=String(v==null?"":v);return /^[=+\-@\t\r]/.test(t)?"'"+t:t;};
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
      ["Snapshot",meta.snapshotId||""],["Tipo de consulta",state.view],
      ["Total de resultados",rows.length],["Gerado em",new Date().toISOString()]]);
    XLSX.utils.book_append_sheet(wb,info,"Fonte e filtros");
    XLSX.writeFile(wb,"GRCON_Central_Postagem_SIGEM_"+new Date().toISOString().slice(0,10)+".xlsx");
  }
  function bind(){
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
    [["scc-status","status"],["scc-allocation","allocationState"],["scc-revision","revision"],["scc-discipline","discipline"],["scc-purpose","purpose"],["scc-fiscal","fiscal"],["scc-reposts","reposts"],["scc-start","start"],["scc-end","end"]]
      .forEach(([id,key])=>$("#"+id).addEventListener("input",e=>{
        state.filters[key]=e.target.type==="checkbox"?e.target.checked:e.target.value;filter();
      }));
    $("#scc-clear-filters").addEventListener("click",()=>{
      state.filters={};
      ["scc-status","scc-allocation","scc-revision","scc-discipline","scc-purpose","scc-fiscal","scc-start","scc-end"].forEach(id=>$("#"+id).value="");
      $("#scc-reposts").checked=false;
      filter();
    });
    $("#scc-columns").addEventListener("click",()=>{
      state.showColumns=!state.showColumns;
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
      state.columns=DEFAULT.slice();state.widths={};state.sort={key:"",dir:"asc"};
      saveColumns();filter();
    });
    $("#scc-export").addEventListener("click",exportExcel);
    $("#scc-copy").addEventListener("click",async()=>{
      const codes=[...new Set(state.filtered.rows.map(row=>row.document).filter(Boolean))];
      if(!codes.length){notify("Nenhum código para copiar.");return;}
      try{
        await navigator.clipboard.writeText(codes.join("\n"));
        notify(codes.length+" código(s) copiado(s).","success");
      }catch(_){notify("Não foi possível copiar os códigos neste navegador.","warning");}
    });
    $("#sigem-central-table-scroll").addEventListener("scroll",()=>View.drawRows(state),{passive:true});
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
        $("#sigem-central-detail").hidden=true;state.selectedRow=null;return;
      }
      if(e.target.closest("[data-scc-open-control]")){
        $("#sigem-central-detail").hidden=true;
        await root.GRCONModuleLoader.ensureModule("control");
        return;
      }
      let value="";
      if(e.target.closest("[data-scc-copy-code]"))value=state.selectedRow?.document||"";
      if(e.target.closest("[data-scc-copy-pending]")){
        if(!state.data?.hasBase||root.GrconSharedSigemQuery?.state?.stale){
          notify("Atualize a Consulta Geral antes de preparar a lista de pendências.","warning");return;
        }
        const rows=state.selectedRow?.rows||[];
        const eligible=rows.filter(row=>root.GrconPostingConference?.repostEligibility?.(row).eligible);
        value=[...new Set(eligible.map(row=>row.document))].join("\n");
        if(!eligible.length){notify("Nenhum item elegível para análise automática. Faça a conferência manual.");return;}
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
      if(e.key==="Escape"&&!$("#sigem-central-detail").hidden){
        $("#sigem-central-detail").hidden=true;
      }
    });
    ["grcon:history-updated","grcon:shared-sigem-updated",
      "grcon:cloud-ready","grcon:conference-workspace-reset",
      "grcon:allocation-registry-updated","grcon:planned-documents-updated"]
      .forEach(name=>root.addEventListener(name,()=>void refresh()));
    root.addEventListener("grcon:module-ready",e=>{
      if(e.detail?.module==="sigem")void refresh();
    });
    root.addEventListener("storage",e=>{
      if(e.key===History.STORAGE_KEY)void refresh();
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
    void refresh();
  }
  if(shell()){
    loadColumns();bind();
    root.GrconSigemCentralUi=Object.freeze({state,refresh,openTechnical,openCentral});
    void refresh();
  }
})(window);
