(function(root){
  "use strict";
  const $=(s)=>document.querySelector(s);
  const t=v=>String(v==null?"":v);
  const h=v=>t(v).replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const C=root.GrconSigemCentralCore;
  function statusClass(status){
    if(status==="CONFIRMADO")return "ok";
    if(status==="NAO_VERIFICADO"||status==="SEM_ENVIO")return "muted";
    if(status==="REVISAO_DIVERGENTE"||status==="REQUER_ANALISE")return "alert";
    return "pending";
  }
  function format(v){
    if(!v)return "—";
    const s=t(v);
    if(/^\d{4}-\d{2}-\d{2}T/.test(s))return new Date(s).toLocaleDateString("pt-BR");
    return s;
  }
  function summary(s){
    const rows=s.filtered.rows,missing=s.filtered.missing;
    const total=rows.length;
    const confirmed=rows.filter(r=>r.status==="CONFIRMADO").length;
    const pending=rows.filter(r=>["AGUARDANDO","NAO_ENCONTRADO"].includes(r.status)).length;
    const divergent=rows.filter(r=>["REVISAO_DIVERGENTE","REQUER_ANALISE"].includes(r.status)).length;
    const values=[["Resultados",total],["Identificados",confirmed],["Aguardando",pending],["Divergentes",divergent]];
    $("#sigem-central-kpis").innerHTML=values.map(([label,count])=>
      '<div class="scc-kpi"><strong>'+count.toLocaleString("pt-BR")+'</strong><span>'+label+'</span></div>').join("");
    $("#sigem-central-count").textContent=total.toLocaleString("pt-BR")+" resultado(s)";
    $("#sigem-central-missing").hidden=!missing.length;
    $("#sigem-central-missing").textContent=missing.length?missing.length+" código(s) não encontrado(s) na consulta: "+missing.slice(0,15).join(", ")+(missing.length>15?" …":""):"";
  }
  function visibleKeys(s){
    return s.columns.filter(key=>C.COLUMNS.some(pair=>pair[0]===key));
  }
  function rowHtml(row,index,keys){
    const grdt=row.egrdtNumber||row.latestEgrdtNumber||"";
    return '<tr data-scc-index="'+index+'" tabindex="0" aria-label="Abrir detalhes de '+h(row.document)+'">'+
      keys.map(k=>{
        let value=row[k];
        if(k==="generatedAt")value=format(value);
        if(k==="statusLabel")return '<td><span class="scc-status '+statusClass(row.status)+'">'+h(value||"—")+'</span></td>';
        return '<td title="'+h(value)+'">'+h(value||value===0?value:"—")+'</td>';
      }).join("")+'</tr>';
  }
  function drawRows(s){
    const viewport=$("#sigem-central-table-scroll"),tbody=$("#sigem-central-tbody");
    if(!viewport||!tbody)return;
    const rows=s.filtered.rows,keys=visibleKeys(s);
    const start=Math.max(0,Math.floor(viewport.scrollTop/44)-8);
    const end=Math.min(rows.length,start+46);
    const span=keys.length||1;
    let html='';
    if(start)html+='<tr class="scc-spacer"><td colspan="'+span+'" style="height:'+(start*44)+'px"></td></tr>';
    for(let i=start;i<end;i++)html+=rowHtml(rows[i],i,keys);
    if(end<rows.length)html+='<tr class="scc-spacer"><td colspan="'+span+'" style="height:'+((rows.length-end)*44)+'px"></td></tr>';
    tbody.innerHTML=html||'<tr><td colspan="'+span+'" class="scc-empty">Nenhum registro para estes filtros.</td></tr>';
  }
  function table(s){
    const scroll=$("#sigem-central-table-scroll"),keys=visibleKeys(s);
    $("#sigem-central-thead").innerHTML='<tr>'+keys.map(key=>{
      const label=(C.COLUMNS.find(v=>v[0]===key)||[])[1]||key;
      const active=s.sort?.key===key,arrow=active?(s.sort.dir==="desc"?" ↓":" ↑"):"";
      const width=Number(s.widths?.[key]||0);
      return '<th'+(active?' aria-sort="'+(s.sort.dir==="desc"?"descending":"ascending")+'"':'')+
        (width>=90&&width<=600?' style="width:'+width+'px;min-width:'+width+'px"':'')+
        '><button type="button" class="scc-sort" data-scc-sort="'+h(key)+'">'+h(label+arrow)+'</button></th>';
    }).join("")+'</tr>';
    scroll.querySelector("colgroup")?.remove();
    const colgroup=document.createElement("colgroup");
    keys.forEach(key=>{
      const col=document.createElement("col"),width=Number(s.widths?.[key]||0);
      if(width>=90&&width<=600)col.style.width=width+"px";
      colgroup.appendChild(col);
    });
    scroll.querySelector("table").prepend(colgroup);
    if(!s.keepScroll)scroll.scrollTop=0;
    s.keepScroll=false;
    drawRows(s);
  }
  function detail(s,index){
    const row=s.filtered.rows[index],panel=$("#sigem-central-detail");
    if(!row){panel.hidden=true;return;}
    s.selectedRow=row;
    const history=row.sends||row.rows||(row.key&&s.data.events.filter(r=>r.key===row.key))||[row];
    const records=history.length?history:[row];
    $("#sigem-central-detail-body").innerHTML=
      '<h3>'+h(row.document)+'</h3><p>'+h(row.title||"Sem título")+'</p>'+
      '<dl class="scc-facts">'+
      [["Conferência",row.statusLabel],["Revisão enviada",row.revisionSent],["Revisão SIGEM",row.revisionFound],
        ["Status SIGEM",row.sigemStatus],["Última GRDT",row.egrdtNumber||row.latestEgrdtNumber],
        ["Alocação histórica",row.allocation],["Propósito",row.purpose],
        ["Evidência do envio",row.sendEvidenceLabel||"Geração registrada; envio não comprovado"],
        ["Diagnóstico",row.note],["Fonte","Consulta Geral / Histórico GRCON"]].map(([k,v])=>
          '<dt>'+h(k)+'</dt><dd>'+h(v||"—")+'</dd>').join("")+'</dl>'+
      '<h4>Ocorrências no histórico ('+records.length+')</h4>'+
      '<div class="scc-history">'+records.map(r=>
        '<div><strong>'+h(r.egrdtNumber||"Sem GRDT")+'</strong>'+
        '<span>Revisão '+h(r.revisionSent||"—")+' · '+h(format(r.generatedAt))+'</span>'+
        '<span>'+h(r.statusLabel||"—")+' · '+h(r.purpose||"Propósito não informado")+'</span></div>').join("")+'</div>'+
      '<div class="scc-actions"><button type="button" data-scc-copy-code>Copiar código</button>'+
      (row.rows?'<button type="button" data-scc-copy-pending>Copiar itens para análise</button>':'')+
      '<button type="button" data-scc-open-control>Controle de GRDT</button></div>'+
      '<p class="scc-note">Copiar pendências não autoriza repostagem e não comprova envio. O operador deve conferir a Consulta Geral atual antes de qualquer nova GRDT.</p>';
    panel.hidden=false;
    panel.querySelector(".scc-close").focus();
  }
  function settings(s){
    const columns=s.columns,known=new Map(C.COLUMNS);
    $("#sigem-central-settings-body").innerHTML=C.COLUMNS.map(([key,label])=>{
      const index=columns.indexOf(key),visible=index>=0;
      return '<div class="scc-column-option"><label><input type="checkbox" data-scc-column="'+h(key)+
        '" '+(visible?"checked":"")+'/> '+h(label)+'</label>'+
        (visible?'<div><button type="button" data-scc-move="'+h(key)+'" data-scc-direction="-1" '+
        (index===0?'disabled':'')+' aria-label="Mover '+h(label)+' para a esquerda">←</button>'+
        '<button type="button" data-scc-move="'+h(key)+'" data-scc-direction="1" '+
        (index===columns.length-1?'disabled':'')+' aria-label="Mover '+h(label)+' para a direita">→</button>'+
        '<input type="number" min="90" max="600" step="10" value="'+Number(s.widths?.[key]||180)+
        '" data-scc-width="'+h(key)+'" aria-label="Largura de '+h(label)+' em pixels"/></div>':'')+
        '</div>';
    }).join("");
  }
  function draw(s){
    const meta=s.data.meta||{};
    $("#sigem-central-base").textContent=s.data.hasBase?
      "Consulta Geral: "+(meta.fileName||"base disponível")+" · "+(meta.referenceDate||meta.importedAt||"Data não informada")+
      (root.GrconSharedSigemQuery?.state?.stale?" · Cache / possível desatualização":""):
      "Consulta Geral indisponível: resultados não verificados";
    summary(s);table(s);settings(s);
    $("#sigem-technical-pane").hidden=s.panel!=="technical";
    $("#sigem-central-workspace").hidden=s.panel==="technical";
    $("#sigem-central-column-pop").hidden=!s.showColumns;
    $("#sigem-central-detail").hidden=true;
  }
  root.GrconSigemCentralRender=Object.freeze({draw,drawRows,detail,settings,h});
})(window);