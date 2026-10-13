(function(root){
  "use strict";
  const $=(s,n)=>(n||document).querySelector(s);
  const Query=root.GrconSigemCentralQuery,View=root.GrconSigemCentralRender;
  const History=root.GrconHistory;
  const DEFAULT=["document","title","revisionSent","revisionFound",
    "statusLabel","sigemStatus","egrdtNumber","generatedAt","sendCount"];
  const state={view:"documentos",panel:"central",query:"",filters:{},columns:DEFAULT.slice(),
    showColumns:false,data:null,filtered:{rows:[],missing:[]},generation:0};
  function workspace(){return root.GrconCloud?.state?.membership?.workspace_id||"unavailable";}
  function storageKey(){return "grcon.sigem.central.columns.v1:"+workspace();}
  function loadColumns(){
    try{
      const v=JSON.parse(localStorage.getItem(storageKey())||"null");
      state.columns=Array.isArray(v)?v.filter(k=>root.GrconSigemCentralCore.COLUMNS.some(c=>c[0]===k)):DEFAULT.slice();
      if(!state.columns.length)state.columns=DEFAULT.slice();
    }catch(_){state.columns=DEFAULT.slice();}
  }
  function saveColumns(){try{localStorage.setItem(storageKey(),JSON.stringify(state.columns));}catch(_){}}
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
      '<button type="button" id="scc-technical-open" class="secondary-button compact">Conferir pacote .xls</button></header>'+
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
      '<label>Revisão <input id="scc-revision" placeholder="Todas" maxlength="8"/></label>'+
      '<label>De <input id="scc-start" type="date"/></label>'+
      '<label>Até <input id="scc-end" type="date"/></label>'+
      '<button id="scc-clear-filters" type="button" class="secondary-button compact">Limpar filtros</button>'+
      '</div>'+
      '<div class="scc-kpis" id="sigem-central-kpis"></div>'+
      '<div class="scc-toolbar"><strong id="sigem-central-count">0 resultados</strong>'+
      '<div><button id="scc-columns" type="button" class="secondary-button compact">Colunas</button>'+
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
      '<button type="button" id="scc-back" class="secondary-button compact">← Voltar à central</button></section>'+
      '<aside class="scc-detail" id="sigem-central-detail" role="dialog" aria-label="Detalhes do documento" hidden>'+
      '<button type="button" class="scc-close" aria-label="Fechar detalhes">×</button>'+
      '<div id="sigem-central-detail-body"></div></aside>';
    return true;
  }
  function filter(){
    if(!state.data)return;
    const listInput=$("#scc-list-input");
    const query=listInput&&!$("#scc-list-panel").hidden&&listInput.value.trim()?listInput.value:state.query;
    state.filtered=Query.filter(state.data,state.view,query,state.filters);
    View.draw(state);
    document.querySelectorAll("[data-scc-view]").forEach(button=>
      button.classList.toggle("active",button.dataset.sccView===state.view));
  }
  async function refresh(){
    const token=++state.generation;
    const active=Boolean(root.GrconCloud?.state?.membership?.workspace_id);
    const records=active?History.read():[];
    const shared=root.GrconSharedSigemQuery;
    const base=active?shared?.current?.():null;
    const data=Query.build(records,base||{records:[],meta:{}},{});
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
