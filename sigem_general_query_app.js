(function(root){
  "use strict";
  const FIELDS = [
    ["document","Documento"],["revision","Revisão"],["title","Título"],
    ["status","Status SIGEM"],["discipline","Disciplina"],["documentType","Tipo de documento"],
    ["situation","Situação"],["modifiedAt","Modificado em"],["includedAt","Incluído em"],
    ["observation","Observação"],["sourceRow","Linha da planilha"]
  ];
  const DEFAULT_COLUMNS = ["document","revision","title","status","discipline","modifiedAt"];
  const ROW_HEIGHT = 43, OVERSCAN = 8;
  const collator = new Intl.Collator("pt-BR",{numeric:true,sensitivity:"base"});
  const trim = v => String(v == null ? "" : v).replace(/[\u200B-\u200D\uFEFF]/g,"").trim();
  const key = v => trim(v).toLocaleUpperCase("pt-BR");
  const escape = v => String(v == null ? "" : v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const text = v => trim(v).toLocaleUpperCase("pt-BR");
  const compare = (a,b) => collator.compare(trim(a),trim(b));
  const safeCell = v => {
    const value=String(v == null ? "" : v);
    return /^[\s\u0000-\u001F]*[=+\-@]/.test(value) ? "'"+value : value;
  };
  function parseCodes(input){
    const seen=new Set(), result=[], duplicate=[];
    for(const raw of String(input||"").split(/[\r\n\t;]+/)){
      const value=trim(raw).replace(/^["']|["']$/g,"").replace(/\.pdf$/i,"").trim();
      if(!value)continue;
      const normalized=key(value);
      if(seen.has(normalized)){duplicate.push(value);continue;}
      seen.add(normalized);result.push(value);
    }
    return {codes:result,duplicates:duplicate};
  }
  function buildIndex(records){
    const index=new Map(), duplicates=new Map();
    for(const row of records||[]){
      const doc=key(row.document);
      if(!doc)continue;
      if(!index.has(doc))index.set(doc,[]);
      index.get(doc).push(row);
      const identity=doc+"\u0000"+key(row.revision);
      duplicates.set(identity,(duplicates.get(identity)||0)+1);
    }
    return {index,duplicates};
  }
  function sourceDate(v){
    const raw=trim(v);
    const br=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if(br){
      const iso=br[3]+"-"+br[2]+"-"+br[1];
      const date=new Date(iso+"T12:00:00Z");
      return Number.isNaN(date.valueOf())||date.toISOString().slice(0,10)!==iso?"":iso;
    }
    const iso=raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if(iso){
      const date=new Date(iso[1]+"T12:00:00Z");
      return Number.isNaN(date.valueOf())||date.toISOString().slice(0,10)!==iso[1]?"":iso[1];
    }
    return "";
  }
  function latestRows(rows){
    const latest=new Map();
    for(const row of rows){
      const doc=key(row.document), prior=latest.get(doc);
      if(!prior||compare(row.revision,prior)>0)latest.set(doc,trim(row.revision));
    }
    return rows.filter(row=>compare(row.revision,latest.get(key(row.document)))===0);
  }
  function run(records,lookup,filters){
    const list=parseCodes(filters.batch);
    const matched=[];
    const missing=[];
    let source;
    if(list.codes.length){
      source=[];
      for(const code of list.codes){
        const rows=lookup.index.get(key(code));
        if(rows?.length){matched.push(code);source.push(...rows);}
        else missing.push(code);
      }
    }else source=records||[];
    const query=key(filters.code), title=text(filters.title), revision=key(filters.revision);
    const status=trim(filters.status), discipline=trim(filters.discipline);
    const phrase=text(filters.search);
    let rows=source.filter(row=>{
      if(query&&(filters.mode==="contains"?!key(row.document).includes(query):key(row.document)!==query))return false;
      if(title&&!text(row.title).includes(title))return false;
      if(revision&&key(row.revision)!==revision)return false;
      if(status&&trim(row.status)!==status)return false;
      if(discipline&&trim(row.discipline)!==discipline)return false;
      if(phrase&&!FIELDS.some(([field])=>text(row[field]).includes(phrase)))return false;
      const date=sourceDate(row.modifiedAt)||sourceDate(row.includedAt);
      if(filters.from&&(!date||date<filters.from))return false;
      if(filters.to&&(!date||date>filters.to))return false;
      if(filters.onlyDuplicate&&lookup.duplicates.get(key(row.document)+"\u0000"+key(row.revision))<2)return false;
      return true;
    });
    if(filters.view==="latest")rows=latestRows(rows);
    const sort=filters.sort||"document",direction=filters.direction===-1?-1:1;
    rows=rows.slice().sort((a,b)=>{
      const difference=compare(a[sort],b[sort])||compare(a.document,b.document)||compare(a.revision,b.revision);
      return direction*difference;
    });
    return {rows,missing,matched,requested:list.codes,duplicateInput:list.duplicates,
      duplicateRows:rows.filter(r=>lookup.duplicates.get(key(r.document)+"\u0000"+key(r.revision))>1).length};
  }
  function exportMatrix(rows,columns){
    return [columns.map(c=>FIELDS.find(f=>f[0]===c)?.[1]||c)].concat(rows.map(row=>columns.map(c=>safeCell(row[c]))));
  }
  function asCsv(matrix){
    return "\uFEFF"+matrix.map(row=>row.map(cell=>'"'+String(cell).replace(/"/g,'""')+'"').join(";")).join("\r\n");
  }
  const Core=Object.freeze({FIELDS,DEFAULT_COLUMNS,key,parseCodes,buildIndex,latestRows,run,exportMatrix,asCsv,sourceDate,safeCell});
  root.GrconGeneralQueryCore=Core;
  if(typeof module==="object"&&module.exports)module.exports=Core;
  if(!root.document)return;

  const state={records:[],base:null,lookup:buildIndex([]),scope:"",result:{rows:[],missing:[],matched:[],requested:[],duplicateInput:[]},
    columns:DEFAULT_COLUMNS.slice(),page:0,error:"",view:"all",sort:"document",direction:1,renderStart:-1};
  let shell,viewport,epoch=0,timer=0;
  const scoped=()=>JSON.stringify([root.GrconCloud?.state?.session?.user?.id||"",root.GrconCloud?.state?.membership?.workspace_id||""]);
  const el=id=>shell?.querySelector("#"+id);
  function css(){
    if(document.getElementById("sgq-styles"))return;
    const s=document.createElement("style");s.id="sgq-styles";
    s.textContent=[
      "#sigem-general-query-module{--sgq-border:var(--border-color,#dce3eb);--sgq-muted:var(--text-muted,#64748b)}",
      "#sigem-general-query-module .sgq-layout{display:grid;gap:14px}",
      "#sigem-general-query-module .sgq-card{padding:16px;border:1px solid var(--sgq-border);border-radius:12px;background:var(--card-bg,#fff)}",
      "#sigem-general-query-module .sgq-batch{display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:12px;align-items:end}",
      "#sigem-general-query-module .sgq-batch textarea{width:100%;min-height:104px;resize:vertical;box-sizing:border-box;font:13px/1.5 ui-monospace,Consolas,monospace}",
      "#sigem-general-query-module .sgq-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}",
      "#sigem-general-query-module .sgq-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;align-items:end}",
      "#sigem-general-query-module .sgq-filters label,#sigem-general-query-module .sgq-batch label{display:grid;gap:5px;font-size:12px;font-weight:600}",
      "#sigem-general-query-module .sgq-filters input,#sigem-general-query-module .sgq-filters select{width:100%;min-width:0;box-sizing:border-box}",
      "#sigem-general-query-module .sgq-stats{display:flex;flex-wrap:wrap;gap:10px;color:var(--sgq-muted);font-size:12px}",
      "#sigem-general-query-module .sgq-stats strong{color:inherit;font-variant-numeric:tabular-nums}",
      "#sigem-general-query-module .sgq-table-scroll{max-height:540px;overflow:auto;position:relative;contain:layout paint;border:1px solid var(--sgq-border);border-radius:8px}",
      "#sigem-general-query-module .sgq-table{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;min-width:900px}",
      "#sigem-general-query-module .sgq-table th{position:sticky;top:0;z-index:2;background:var(--card-bg,#f8fafc);text-align:left;border-bottom:1px solid var(--sgq-border);padding:0 10px;height:40px}",
      "#sigem-general-query-module .sgq-table th button{background:none;border:none;color:inherit;font-weight:700;font-size:12px;cursor:pointer;width:100%;text-align:left}",
      "#sigem-general-query-module .sgq-table td{box-sizing:border-box;height:43px;padding:0 10px;border-bottom:1px solid var(--sgq-border);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}",
      "#sigem-general-query-module .sgq-table td button{border:none;background:transparent;color:var(--primary,#2166a5);cursor:pointer;text-decoration:underline;font:inherit;text-align:left;padding:0}",
      "#sigem-general-query-module .sgq-spacer td{border:none!important;padding:0!important;height:0}",
      "#sigem-general-query-module .sgq-status{display:inline-block;max-width:100%;padding:3px 7px;border-radius:7px;font-size:11px;overflow:hidden;text-overflow:ellipsis}",
      "#sigem-general-query-module .sgq-status.analysis{background:#fff1cc;color:#845500}",
      "#sigem-general-query-module .sgq-status.issued{background:#dcfce7;color:#166534}",
      "#sigem-general-query-module .sgq-status.planned{background:#dbeafe;color:#1e40af}",
      "#sigem-general-query-module .sgq-status.alert{background:#fee2e2;color:#991b1b}",
      "#sigem-general-query-module .sgq-status.other{background:#e2e8f0;color:#334155}",
      "#sigem-general-query-module .sgq-column-list{display:flex;gap:10px;flex-wrap:wrap;font-size:12px}",
      "#sigem-general-query-module .sgq-column-list label{display:inline-flex;align-items:center;gap:4px}",
      "#sigem-general-query-module .sgq-muted{color:var(--sgq-muted);font-size:12px}",
      "#sigem-general-query-module .sgq-detail dl{display:grid;grid-template-columns:minmax(120px,180px) 1fr;gap:5px 12px;max-height:45vh;overflow:auto}",
      "#sigem-general-query-module .sgq-detail dd{margin:0;overflow-wrap:anywhere}",
      "#sigem-general-query-module .sgq-detail dt{font-weight:700}",
      "#sigem-general-query-module .sgq-detail{max-width:min(980px,92vw);width:800px;max-height:88vh}",
      "#sigem-general-query-module .sgq-missing-list{max-height:160px;overflow:auto;font:12px/1.7 ui-monospace,monospace}",
      "@media(max-width:900px){#sigem-general-query-module .sgq-batch{grid-template-columns:1fr}}"
    ].join("\n");
    document.head.appendChild(s);
  }
  function ensure(){
    if(shell)return;
    css();
    shell=document.createElement("section");
    shell.id="sigem-general-query-module";shell.hidden=true;shell.className="posting-conference-module";
    shell.setAttribute("role","tabpanel");shell.setAttribute("aria-label","Consulta Geral SIGEM");
    shell.innerHTML=[
      '<header class="pc-heading"><div><span>CONSULTA DOCUMENTAL</span><h2>Consultar Consulta Geral</h2><p>Pesquisa exata de documentos e todas as revisões existentes, inclusive anteriores ao GRCON.</p></div><div class="pc-heading-actions"><button id="sgq-back" class="secondary-button" type="button">Voltar à Conferência</button><button id="sgq-refresh" class="secondary-button" type="button">Atualizar consulta</button></div></header>',
      '<div class="sgq-layout"><p id="sgq-source" class="sgq-muted" role="status"></p><p id="sgq-error" role="alert"></p>',
      '<section class="sgq-card"><div class="sgq-batch"><label>Consultar lista de códigos (cole uma coluna do Excel)<textarea id="sgq-batch" placeholder="Um código por linha, ou separado por tabulação e ponto e vírgula" spellcheck="false"></textarea></label><div class="sgq-actions"><button id="sgq-search" type="button">Consultar lista</button><button id="sgq-clear-batch" type="button" class="secondary-button">Limpar lista</button><button id="sgq-paste" type="button" class="secondary-button">Colar</button></div></div><p id="sgq-batch-count" class="sgq-muted"></p></section>',
      '<section class="sgq-card"><div class="sgq-filters">',
      '<label>Código exato / pesquisa<input id="sgq-code" type="search" placeholder="Código completo" autocomplete="off"></label>',
      '<label>Correspondência<select id="sgq-mode"><option value="exact">Exata (segura)</option><option value="contains">Contém (exploratória)</option></select></label>',
      '<label>Título<input id="sgq-title" type="search" placeholder="Texto do título"></label>',
      '<label>Revisão<input id="sgq-revision" type="search" placeholder="Todas"></label>',
      '<label>Status SIGEM<select id="sgq-status"><option value="">Todos</option></select></label>',
      '<label>Disciplina<select id="sgq-discipline"><option value="">Todas</option></select></label>',
      '<label>Visualização<select id="sgq-view"><option value="all">Todas as revisões</option><option value="latest">Maior revisão por código</option></select></label>',
      '<label>Data a partir de<input id="sgq-from" type="date"></label><label>Data até<input id="sgq-to" type="date"></label>',
      '<label>Buscar nos resultados<input id="sgq-global" type="search" placeholder="Qualquer campo"></label>',
      '<label class="sgq-muted"><input id="sgq-duplicates" type="checkbox"> Somente registros duplicados</label>',
      '</div><div class="sgq-actions" style="margin-top:12px"><button id="sgq-clear" type="button" class="secondary-button">Limpar filtros</button><span class="sgq-muted">A busca exploratória nunca substitui a correspondência exata da lista colada.</span></div></section>',
      '<section class="sgq-card"><div id="sgq-stats" class="sgq-stats" aria-live="polite"></div><div class="sgq-actions" style="margin:12px 0"><button id="sgq-export" class="secondary-button" type="button">Exportar Excel</button><button id="sgq-csv" class="secondary-button" type="button">Exportar CSV</button><button id="sgq-copy" class="secondary-button" type="button">Copiar tabela</button><button id="sgq-missing-export" class="secondary-button" type="button">Exportar não encontrados</button></div>',
      '<details id="sgq-column-details"><summary>Organizar colunas</summary><div id="sgq-columns" class="sgq-column-list"></div></details>',
      '<p id="sgq-count" class="sgq-muted"></p><div id="sgq-scroll" class="sgq-table-scroll" tabindex="0" aria-label="Resultados da Consulta Geral">',
      '<table class="sgq-table"><thead id="sgq-head"></thead><tbody id="sgq-body"></tbody></table></div></section>',
      '<section class="sgq-card"><details id="sgq-missing-details"><summary><strong id="sgq-missing-title">Não encontrados (0)</strong></summary><p class="sgq-muted">Não localizado na Consulta Geral carregada. Não comprova ausência no SIGEM ou no ProjectWise.</p><div id="sgq-missing" class="sgq-missing-list"></div></details></section></div>'
    ].join("");
    document.querySelector("main.workspace").appendChild(shell);
    viewport=el("sgq-scroll");
    for(const id of ["sgq-code","sgq-title","sgq-revision","sgq-global","sgq-from","sgq-to"]){
      el(id).addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(update,160);});
    }
    for(const id of ["sgq-mode","sgq-status","sgq-discipline","sgq-view","sgq-duplicates"])
      el(id).addEventListener("change",update);
    el("sgq-batch").addEventListener("input",()=>{
      const p=parseCodes(el("sgq-batch").value);
      el("sgq-batch-count").textContent=p.codes.length+" códigos únicos · "+p.duplicates.length+" duplicados na lista";
    });
    el("sgq-batch").addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();update();}});
    el("sgq-search").onclick=update;
    el("sgq-clear-batch").onclick=()=>{el("sgq-batch").value="";el("sgq-batch-count").textContent="";update();};
    el("sgq-paste").onclick=async()=>{
      try{el("sgq-batch").value=await navigator.clipboard.readText();el("sgq-batch").dispatchEvent(new Event("input"));update();}
      catch(_){el("sgq-batch").focus();state.error="Use Ctrl+V para colar a lista neste campo.";renderMessage();}
    };
    el("sgq-clear").onclick=()=>{
      for(const id of ["sgq-code","sgq-title","sgq-revision","sgq-status","sgq-discipline","sgq-global","sgq-from","sgq-to"])el(id).value="";
      el("sgq-mode").value="exact";el("sgq-view").value="all";el("sgq-duplicates").checked=false;update();
    };
    el("sgq-back").onclick=()=>root.GrconPostingConferenceNavigation.open();
    el("sgq-refresh").onclick=()=>void refresh(true);
    el("sgq-export").onclick=()=>void exportExcel();
    el("sgq-csv").onclick=()=>downloadCsv(exportMatrix(state.result.rows,state.columns),"GRCON_Consulta_Geral");
    el("sgq-missing-export").onclick=()=>downloadCsv([["Código não encontrado"],...state.result.missing.map(c=>[safeCell(c)])],"GRCON_Consulta_Geral_Nao_Encontrados");
    el("sgq-copy").onclick=()=>void copyTable();
    el("sgq-head").onclick=e=>{
      const button=e.target.closest("[data-sgq-sort]");
      if(!button)return;
      const field=button.dataset.sgqSort;
      state.direction=state.sort===field?-state.direction:1;state.sort=field;update();
    };
    el("sgq-body").onclick=e=>{
      const button=e.target.closest("[data-sgq-detail]");
      if(button)detail(Number(button.dataset.sgqDetail));
    };
    viewport.addEventListener("scroll",()=>renderRows());
    el("sgq-columns").addEventListener("change",e=>{
      const input=e.target.closest("input[data-sgq-column]");
      if(!input)return;
      const field=input.dataset.sgqColumn;
      if(input.checked&&!state.columns.includes(field))state.columns.push(field);
      if(!input.checked&&state.columns.length>1)state.columns=state.columns.filter(c=>c!==field);
      if(!input.checked&&state.columns.length===1)input.checked=true;
      state.renderStart=-1;render();
    });
  }
  function renderMessage(){
    el("sgq-error").textContent=state.error||"";
  }
  function adopt(){
    const base=root.GrconSharedSigemQuery?.current();
    const changed=state.base!==base;
    state.base=base||null;state.scope=scoped();
    state.records=Array.isArray(base?.records)?base.records:[];
    if(changed)state.lookup=buildIndex(state.records);
    for(const [id,field] of [["sgq-status","status"],["sgq-discipline","discipline"]]){
      const select=el(id),selected=select.value;
      const labels=[...new Set(state.records.map(row=>trim(row[field])).filter(Boolean))].sort(compare);
      select.innerHTML='<option value="">'+(field==="status"?"Todos":"Todas")+"</option>"+labels.map(label=>'<option value="'+escape(label)+'">'+escape(label)+"</option>").join("");
      select.value=labels.includes(selected)?selected:"";
    }
    update();
  }
  function filters(){
    return {batch:el("sgq-batch").value,code:el("sgq-code").value,mode:el("sgq-mode").value,
      title:el("sgq-title").value,revision:el("sgq-revision").value,status:el("sgq-status").value,
      discipline:el("sgq-discipline").value,view:el("sgq-view").value,search:el("sgq-global").value,
      from:el("sgq-from").value,to:el("sgq-to").value,onlyDuplicate:el("sgq-duplicates").checked,
      sort:state.sort,direction:state.direction};
  }
  function update(){
    if(!shell)return;
    state.result=run(state.records,state.lookup,filters());state.renderStart=-1;viewport.scrollTop=0;render();
  }
  function statusKind(value){
    const v=text(value);
    if(/EM (ANALISE|ANÁLISE|WORKFLOW)|EM WORKFLOW|AGUARDANDO ANALISE|AGUARDANDO ANÁLISE/.test(v))return "analysis";
    if(/^(EMITIDO|POSTADO|CONCLU[IÍ]DO|APROVADO)$/.test(v))return "issued";
    if(/PREVISTO|NÃO POSTADO|NAO POSTADO|CADASTRADO/.test(v))return "planned";
    if(/ERRO|RECUSADO|REJEITADO|INCONSIST/.test(v))return "alert";
    return "other";
  }
  function render(){
    if(!shell)return;
    renderMessage();
    const meta=state.base?.meta||{};
    const workspace=root.GrconCloud?.state?.membership?.workspace_id||"não informado";
    el("sgq-source").textContent=state.base?
      "Fonte: "+(meta.fileName||"Consulta Geral")+" · Referência: "+(meta.referenceDate||"não informada")+" · Importação: "+(meta.importedAt||meta.publishedAt||"não informada")+" · Contrato: "+workspace+" · "+state.records.length.toLocaleString("pt-BR")+" registros"+(root.GrconSharedSigemQuery?.state?.stale?" · Base em cache; atualização pendente":""):
      "Nenhuma Consulta Geral disponível. Envie ou publique a base na Conferência.";
    const result=state.result;
    const distinct=new Set(result.rows.map(r=>key(r.document))).size;
    el("sgq-stats").innerHTML=[
      ["Códigos na lista",result.requested.length],["Encontrados",result.matched.length],
      ["Não encontrados",result.missing.length],["Revisões/registros",result.rows.length],
      ["Documentos exibidos",distinct],["Registros duplicados",result.duplicateRows||0]
    ].map(([name,n])=>"<span>"+escape(name)+": <strong>"+Number(n).toLocaleString("pt-BR")+"</strong></span>").join("");
    el("sgq-count").textContent="Exibindo "+result.rows.length.toLocaleString("pt-BR")+" registros de "+state.records.length.toLocaleString("pt-BR")+" na fonte · "+(state.sort==="document"?"Ordenação por documento":"Ordenação por "+(FIELDS.find(f=>f[0]===state.sort)?.[1]||state.sort))+" · "+(state.direction===1?"crescente":"decrescente");
    el("sgq-missing-title").textContent="Não encontrados ("+result.missing.length+")";
    el("sgq-missing").textContent=result.missing.length?result.missing.join("\n"):"Nenhum código ausente da Consulta Geral carregada.";
    el("sgq-export").disabled=el("sgq-csv").disabled=el("sgq-copy").disabled=!result.rows.length;
    el("sgq-missing-export").disabled=!result.missing.length;
    el("sgq-columns").innerHTML=FIELDS.map(([field,label])=>'<label><input type="checkbox" data-sgq-column="'+field+'" '+(state.columns.includes(field)?"checked":"")+"> "+escape(label)+"</label>").join("");
    el("sgq-head").innerHTML="<tr>"+state.columns.map(field=>{
      const label=FIELDS.find(f=>f[0]===field)?.[1]||field;
      return '<th scope="col" title="Ordenar por '+escape(label)+'"><button type="button" data-sgq-sort="'+field+'">'+escape(label)+(state.sort===field?(state.direction>0?" ↑":" ↓"):"")+"</button></th>";
    }).join("")+"</tr>";
    renderRows();
  }
  function renderRows(){
    if(!shell||shell.hidden||!viewport)return;
    const rows=state.result.rows,n=rows.length;
    const start=Math.max(0,Math.floor(viewport.scrollTop/ROW_HEIGHT)-OVERSCAN);
    const count=Math.ceil((viewport.clientHeight||540)/ROW_HEIGHT)+OVERSCAN*2;
    const end=Math.min(n,start+count);
    if(state.renderStart===start&&el("sgq-body").dataset.count===String(n))return;
    state.renderStart=start;
    el("sgq-body").dataset.count=String(n);
    const width=state.columns.length;
    if(!n){
      el("sgq-body").innerHTML='<tr><td colspan="'+width+'">Nenhum registro corresponde aos filtros nesta fonte. Isso não comprova ausência em outra versão.</td></tr>';return;
    }
    const chunk=rows.slice(start,end).map((row,i)=>{
      const index=start+i;
      return "<tr>"+state.columns.map(field=>{
        const value=String(row[field]??"");
        if(field==="document")return '<td title="'+escape(value)+'"><button type="button" data-sgq-detail="'+index+'">'+escape(value||"—")+"</button></td>";
        if(field==="status")return '<td title="'+escape(value)+'"><span class="sgq-status '+statusKind(value)+'">'+escape(value||"Não informado")+"</span></td>";
        return '<td title="'+escape(value)+'">'+escape(value||"—")+"</td>";
      }).join("")+"</tr>";
    }).join("");
    el("sgq-body").innerHTML=
      (start?'<tr class="sgq-spacer" aria-hidden="true"><td colspan="'+width+'" style="height:'+(start*ROW_HEIGHT)+'px"></td></tr>':"")+
      chunk+
      (end<n?'<tr class="sgq-spacer" aria-hidden="true"><td colspan="'+width+'" style="height:'+((n-end)*ROW_HEIGHT)+'px"></td></tr>':"");
  }
  function detail(index){
    const row=state.result.rows[index];
    if(!row)return;
    const revisions=(state.lookup.index.get(key(row.document))||[]).slice().sort((a,b)=>compare(a.revision,b.revision));
    const dialog=document.createElement("dialog");
    dialog.className="pc-task-dialog sgq-detail";dialog.dataset.sgqScope=scoped();
    dialog.innerHTML="<h3>Histórico de revisões — "+escape(row.document)+"</h3>"+
      '<p class="sgq-muted">Todas as revisões registradas na fonte atual, inclusive linhas repetidas. Não é histórico completo de movimentações.</p>'+
      '<div style="overflow:auto;max-height:28vh"><table class="pc-table"><thead><tr><th>Revisão</th><th>Status SIGEM</th><th>Modificado em</th><th>Linha de origem</th></tr></thead><tbody>'+
      revisions.map(r=>"<tr><td>"+escape(r.revision||"—")+"</td><td>"+escape(r.status||"Não informado")+"</td><td>"+escape(r.modifiedAt||"—")+"</td><td>"+escape(r.sourceRow??"—")+"</td></tr>").join("")+
      "</tbody></table></div><h4>Dados do registro selecionado</h4><dl>"+
      FIELDS.map(([field,label])=>"<dt>"+escape(label)+"</dt><dd>"+escape(row[field]??"—")+"</dd>").join("")+
      '</dl><div class="sgq-actions"><button type="button" data-sgq-copy-code>Copiar código</button><button type="button" data-sgq-close class="secondary-button">Fechar</button></div>';
    shell.appendChild(dialog);
    dialog.querySelector("[data-sgq-close]").onclick=()=>dialog.close();
    dialog.querySelector("[data-sgq-copy-code]").onclick=()=>void navigator.clipboard?.writeText(row.document).catch(e=>{state.error=e.message;renderMessage();});
    dialog.addEventListener("close",()=>dialog.remove(),{once:true});
    dialog.showModal();
  }
  function dateName(prefix){
    const at=new Date(),stamp=[at.getFullYear(),String(at.getMonth()+1).padStart(2,"0"),String(at.getDate()).padStart(2,"0")].join("-");
    return prefix+"_"+stamp+"_"+String(at.getHours()).padStart(2,"0")+"-"+String(at.getMinutes()).padStart(2,"0");
  }
  function save(blob,name){
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function downloadCsv(matrix,name){
    if(!matrix.length)return;
    save(new Blob([asCsv(matrix)],{type:"text/csv;charset=utf-8"}),dateName(name)+".csv");
  }
  async function copyTable(){
    const cells=exportMatrix(state.result.rows,state.columns);
    try{await navigator.clipboard.writeText(cells.map(row=>row.join("\t")).join("\n"));}
    catch(error){state.error="Não foi possível copiar: "+error.message;renderMessage();}
  }
  async function exportExcel(){
    const identity=scoped(),base=state.base,rows=state.result.rows.slice(),columns=state.columns.slice();
    const button=el("sgq-export");button.disabled=true;
    try{
      await root.GRCONModuleLoader.ensure("xlsx");
      if(identity!==scoped()||base!==state.base)return;
      const XLSX=root.XLSX,mat=exportMatrix(rows,columns);
      const sheet=XLSX.utils.aoa_to_sheet(mat);
      sheet["!autofilter"]={ref:sheet["!ref"]};
      sheet["!cols"]=columns.map((column,i)=>({wch:Math.min(65,Math.max(16,...mat.slice(0,200).map(r=>String(r[i]||"").length)))}));
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,sheet,"Consulta Geral");
      const bytes=XLSX.write(wb,{type:"array",bookType:"xlsx",compression:true});
      save(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),dateName("GRCON_Consulta_Geral")+".xlsx");
    }catch(error){state.error=error.message||"Falha ao exportar Excel.";renderMessage();}
    finally{if(identity===scoped())button.disabled=!state.result.rows.length;}
  }
  async function refresh(force){
    const identity=scoped(),ticket=++epoch;
    el("sgq-refresh").disabled=true;state.error="";
    try{
      const query=root.GrconSharedSigemQuery;
      if(force&&query?.refreshLatest)await query.refreshLatest();
      else await query?.refresh?.();
      if(ticket!==epoch||identity!==scoped())return;
      adopt();
    }catch(error){
      if(ticket===epoch&&identity===scoped()){state.error=error.message||"Não foi possível atualizar a base.";render();}
    }finally{if(ticket===epoch)el("sgq-refresh").disabled=false;}
  }
  function reset(){
    epoch++;clearTimeout(timer);state.base=null;state.records=[];state.lookup=buildIndex([]);
    state.scope=scoped();state.error="";state.renderStart=-1;
    if(shell){
      for(const id of ["sgq-batch","sgq-code","sgq-title","sgq-revision","sgq-status","sgq-discipline","sgq-global","sgq-from","sgq-to"])el(id).value="";
      el("sgq-view").value="all";el("sgq-mode").value="exact";el("sgq-duplicates").checked=false;
      el("sgq-batch-count").textContent="";el("sgq-refresh").disabled=false;update();
    }
    document.querySelectorAll("dialog[data-sgq-scope]").forEach(dialog=>dialog.close());
  }
  async function open(){
    ensure();
    document.querySelectorAll("main.workspace > section").forEach(section=>{section.hidden=section!==shell;});
    shell.hidden=false;document.title="GRCON — Consulta Geral SIGEM";
    const label=document.getElementById("brand-subtitle");if(label)label.textContent="Consulta Geral SIGEM";
    if(state.scope!==scoped())reset();
    adopt();await refresh(false);
    if(!shell.hidden)el("sgq-code").focus();
  }
  for(const event of ["grcon:contract-context-changed","grcon:cloud-signed-out"])root.addEventListener(event,reset);
  root.addEventListener("grcon:shared-sigem-updated",()=>{if(shell&&!shell.hidden){if(state.scope!==scoped())reset();adopt();}});
  root.GrconGeneralQueryUi=Object.freeze({open,refresh,state});
})(typeof window==="undefined"?globalThis:window);
