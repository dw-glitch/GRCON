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
    $("#sigem-central-thead").innerHTML='<tr>'+keys.map(key=>
      '<th>'+h((C.COLUMNS.find(v=>v[0]===key)||[])[1]||key)+'</th>').join("")+'</tr>';
    scroll.scrollTop=0;
    drawRows(s);
  }
  function detail(s,index){
    const row=s.filtered.rows[index],panel=$("#sigem-central-detail");
    if(!row){panel.hidden=true;return;}
    const history=row.sends||row.rows||(row.key&&s.data.events.filter(r=>r.key===row.key))||[row];
    const records=history.length?history:[row];
    $("#sigem-central-detail-body").innerHTML=
      '<h3>'+h(row.document)+'</h3><p>'+h(row.title||"Sem título")+'</p>'+
      '<dl class="scc-facts">'+
      [["Conferência",row.statusLabel],["Revisão enviada",row.revisionSent],["Revisão SIGEM",row.revisionFound],
        ["Status SIGEM",row.sigemStatus],["Última GRDT",row.egrdtNumber||row.latestEgrdtNumber],
        ["Alocação histórica",row.allocation],["Propósito",row.purpose],
        ["Diagnóstico",row.note],["Fonte","Consulta Geral / Histórico GRCON"]].map(([k,v])=>
          '<dt>'+h(k)+'</dt><dd>'+h(v||"—")+'</dd>').join("")+'</dl>'+
      '<h4>Ocorrências no histórico ('+records.length+')</h4>'+
      '<div class="scc-history">'+records.map(r=>
        '<div><strong>'+h(r.egrdtNumber||"Sem GRDT")+'</strong>'+
        '<span>Revisão '+h(r.revisionSent||"—")+' · '+h(format(r.generatedAt))+'</span>'+
        '<span>'+h(r.statusLabel||"—")+' · '+h(r.purpose||"Propósito não informado")+'</span></div>').join("")+'</div>'+
      '<p class="scc-note">A geração da eGRDT não comprova o envio. A localização na Consulta Geral comprova apenas a presença do código e revisão na base consultada.</p>';
    panel.hidden=false;
    panel.querySelector(".scc-close").focus();
  }
  function settings(s){
    $("#sigem-central-settings-body").innerHTML=C.COLUMNS.map(([key,label])=>
      '<label><input type="checkbox" data-scc-column="'+h(key)+'" '+(s.columns.includes(key)?"checked":"")+' /> '+h(label)+'</label>').join("");
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