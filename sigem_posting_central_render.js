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
    const grdt=s.view==="grdts";
    const confirmed=rows.filter(r=>grdt?r.total>0&&r.confirmed===r.total:r.status==="CONFIRMADO").length;
    const pending=rows.filter(r=>grdt?(r.awaiting+r.notFound)>0:["AGUARDANDO","NAO_ENCONTRADO"].includes(r.status)).length;
    const divergent=rows.filter(r=>grdt?(r.divergent+r.review)>0:["REVISAO_DIVERGENTE","REQUER_ANALISE"].includes(r.status)).length;
    let values=[["Resultados",total],[grdt?"GRDTs identificadas":"Identificados",confirmed],[grdt?"GRDTs c/ pendências":"Aguardando",pending],[grdt?"GRDTs divergentes":"Divergentes",divergent]];
    if(s.view==='evolucao')values=[["Documento + revisão",total],["Com alteração",rows.filter(r=>r.changeType!=='SEM_ALTERACAO').length],["Localizados nesta versão",rows.filter(r=>r.changeType==='NOVO_NA_CONSULTA').length],["Sem alteração",rows.filter(r=>r.changeType==='SEM_ALTERACAO').length]];
    $("#sigem-central-kpis").innerHTML=values.map(([label,count])=>
      '<div class="scc-kpi"><strong>'+count.toLocaleString("pt-BR")+'</strong><span>'+label+'</span></div>').join("");
    $("#sigem-central-count").textContent=total.toLocaleString("pt-BR")+" resultado(s)";
    $("#sigem-central-missing").hidden=!missing.length;
    $("#scc-copy-missing").hidden=!missing.length;
    $("#sigem-central-missing").textContent=missing.length?missing.length+" código(s) não encontrado(s) na consulta: "+missing.join(", "):"";
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
    const count=Math.ceil((viewport.clientHeight||560)/44)+16;
    const header=viewport.querySelector("thead")?.getBoundingClientRect().height||44;
    const start=Math.min(Math.max(0,rows.length-count),Math.max(0,Math.floor(Math.max(0,viewport.scrollTop-header)/44)-8));
    const end=Math.min(rows.length,start+count);
    const span=keys.length||1;
    const signature=[s.filtered,keys.join("|"),start,end];
    if(s.rowWindow&&s.rowWindow[0]===signature[0]&&s.rowWindow.slice(1).join("|")===signature.slice(1).join("|"))return;
    s.rowWindow=signature;
    let html='';
    if(start)html+='<tr class="scc-spacer"><td colspan="'+span+'" style="height:'+(start*44)+'px"></td></tr>';
    for(let i=start;i<end;i++)html+=rowHtml(rows[i],i,keys);
    if(end<rows.length)html+='<tr class="scc-spacer"><td colspan="'+span+'" style="height:'+((rows.length-end)*44)+'px"></td></tr>';
    tbody.innerHTML=html||'<tr><td colspan="'+span+'" class="scc-empty">Nenhum registro para estes filtros.</td></tr>';
  }
  function table(s){
    const scroll=$("#sigem-central-table-scroll"),keys=visibleKeys(s);
    s.rowWindow=null;
    $("#sigem-central-thead").innerHTML='<tr>'+keys.map(key=>{
      const label=(C.COLUMNS.find(v=>v[0]===key)||[])[1]||key;
      const active=s.sort?.key===key,arrow=active?(s.sort.dir==="desc"?" ↓":" ↑"):"";
      const width=Number(s.widths?.[key]||0);
      return '<th'+(active?' aria-sort="'+(s.sort.dir==="desc"?"descending":"ascending")+'"':'')+
        (width>=90&&width<=600?' style="width:'+width+'px;min-width:'+width+'px"':'')+
        ' data-scc-key="'+h(key)+'" draggable="true"><button type="button" class="scc-sort" data-scc-sort="'+h(key)+'">'+h(label+arrow)+'</button><input class="scc-column-filter" data-scc-filter="'+h(key)+'" aria-label="Filtrar '+h(label)+'" placeholder="Filtrar…" value="'+h(s.filters.columns?.[key]||'')+'"/><span class="scc-resize" data-scc-resize="'+h(key)+'" role="separator" aria-label="Redimensionar '+h(label)+'"></span></th>';
    }).join("")+'</tr>';
    scroll.querySelector("colgroup")?.remove();
    const colgroup=document.createElement("colgroup");
    keys.forEach(key=>{
      const col=document.createElement("col"),width=Number(s.widths?.[key]||180);
      col.style.width=width+"px";
      colgroup.appendChild(col);
    });
    scroll.querySelector("table").prepend(colgroup);
    scroll.querySelector("table").style.width=keys.reduce((n,k)=>n+Number(s.widths?.[k]||180),0)+"px";
    if(!s.keepScroll)scroll.scrollTop=0;
    s.keepScroll=false;
    drawRows(s);
    pinColumns(s);
  }
  function pinColumns(s){
    const viewport=$("#sigem-central-table-scroll");let left=0;
    for(const key of visibleKeys(s)){
      const index=s.columns.indexOf(key)+1,pinned=(s.pinned||["document"]).includes(key);
      viewport.querySelectorAll("thead th:nth-child("+index+"),tbody tr[data-scc-index] td:nth-child("+index+")").forEach(cell=>{
        cell.classList.toggle("scc-pinned",pinned);cell.style.left=pinned?left+"px":"";
      });
      if(pinned)left+=Number(s.widths?.[key]||180);
    }
  }
  function detail(s,index){
    const row=s.filtered.rows[index],panel=$("#sigem-central-detail");
    if(!row){panel.hidden=true;return;}
    s.selectedRow=row;
    s.detailReturnFocus=document.activeElement;
    const history=row.sends||row.rows||(row.key&&s.data.events.filter(r=>r.key===row.key))||[row];
    const records=history.length?history:[row];
    $("#sigem-central-detail-body").innerHTML=
      '<h3>'+h(row.document)+'</h3><p>'+h(row.title||"Sem título")+'</p>'+
      '<dl class="scc-facts">'+
      [["Status anterior",row.previousStatus],["Status atual",row.currentStatus],["Base anterior",row.previousBaseDate],["Base atual",row.currentBaseDate],["Conferência",row.statusLabel],["Revisão enviada",row.revisionSent],["Revisão SIGEM",row.revisionFound],
        ["Status SIGEM",row.sigemStatus],["Última GRDT",row.egrdtNumber||row.latestEgrdtNumber],
        ["Alocação",row.allocation],["Situação da alocação",row.allocationState],["Workflow",row.allocationWorkflow],["Status da alocação",row.allocationCurrentStatus],["Fonte de alocação",row.allocationSource],["Fonte dos comentários",row.fiscalSource],
        ["Fiscal 01",row.fiscalComment],["Fiscal 02",row.fiscal2Comment],
        ["Retorno Fiscal 01",row.fiscal1ReturnedAt],["Retorno Fiscal 02",row.fiscal2ReturnedAt],
        ["Solicitações",row.requestsCount],["Referências",row.requestsDetail],
        ["Propósito",row.purpose],
        ["Evidência do envio",row.sendEvidenceLabel||"Geração registrada; envio não comprovado"],["Entrega no Teams",row.teamsDeliveredAt],["Postagem declarada no Teams",row.teamsDeclaration],
        ["Diagnóstico",row.note],["Fonte","Consulta Geral / Histórico GRCON"],["Status corresponde à revisão",row.sigemStatusRevision||row.revisionFound],["Tempo desde geração",row.ageHours===0?"0 h":row.ageHours?row.ageHours+" h":"—"]].map(([k,v])=>
          '<dt>'+h(k)+'</dt><dd>'+h(v===0?0:v||"—")+'</dd>').join("")+'</dl>'+
      '<h4>Ocorrências no histórico ('+records.length+')</h4>'+
      '<div class="scc-history">'+records.map(r=>
        '<div>'+((row.rows&&root.GrconPostingConference.repostEligibility(r).eligible)?'<label><input type="checkbox" data-scc-pending-index="'+records.indexOf(r)+'"/> Selecionar para análise</label>':'')+'<strong>'+h(r.egrdtNumber||"Sem GRDT")+'</strong><span>'+h(r.document||"")+'</span>'+
        '<span>Revisão '+h(r.revisionSent||"—")+' · '+h(format(r.generatedAt))+'</span>'+
        '<span>'+h(r.statusLabel||"—")+' · '+h(r.purpose||"Propósito não informado")+'</span></div>').join("")+'</div>'+
      '<div class="scc-actions"><button type="button" data-scc-copy-code>Copiar código</button>'+
      (row.rows?'<button type="button" data-scc-copy-pending>Copiar itens selecionados</button><button type="button" data-scc-prepare-pending>Preparar pendências na Central de GRDT</button>':'')+
      ((['owner','admin'].includes(root.GrconCloud?.state?.membership?.role))?(row.rows?'<button type="button" data-scc-monitor-grdt>Monitorar esta GRDT</button>':row.revisionSent?'<button type="button" data-scc-monitor-revision>Monitorar esta revisão</button>':''):'')+'<button type="button" data-scc-open-control>Controle de GRDT</button><button type="button" data-scc-monitor-document>Acompanhar no monitoramento</button></div>'+
      '<p class="scc-note">Copiar pendências não autoriza repostagem e não comprova envio. O operador deve conferir a Consulta Geral atual antes de qualquer nova GRDT.</p>';
    panel.hidden=false;
    panel.querySelector(".scc-close").focus();
  }
  function settings(s){
    const columns=s.columns;
    $("#sigem-central-settings-body").innerHTML=C.COLUMNS.map(([key,label])=>{
      const index=columns.indexOf(key),visible=index>=0;
      return '<div class="scc-column-option"><label><input type="checkbox" data-scc-column="'+h(key)+
        '" '+(visible?"checked":"")+'/> '+h(label)+'</label><label><input type="checkbox" data-scc-pin="'+h(key)+'" '+((s.pinned||["document"]).includes(key)?'checked':'')+'/> Fixar</label>'+
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
      (meta.snapshotId?" · Snapshot: "+meta.snapshotId:"")+
      (root.GrconSharedSigemQuery?.state?.stale?" · Cache / possível desatualização":""):
      "Consulta Geral indisponível: resultados não verificados";
    $("#sigem-central-base").textContent+=" · Histórico: "+(s.data.historyComplete?"compartilhado completo":"cópia local, pode estar incompleto");
    if(s.lastError)$("#sigem-central-base").textContent+=" · Falha na atualização; mostrando a última consulta válida";
    if(s.view==='evolucao')$("#sigem-central-base").textContent=s.comparison
      ?'Comparação: '+s.comparison.previous.file_name+' → '+s.comparison.current.file_name
      :'Evolução: selecione as versões que deseja comparar.';
    summary(s);table(s);
    if(s.showColumns)settings(s);
    $("#sigem-technical-pane").hidden=s.panel!=="technical";
    $("#sigem-central-workspace").hidden=s.panel==="technical";
    $("#sigem-central-column-pop").hidden=!s.showColumns;
    $("#sigem-central-detail").hidden=true;
  }
  root.GrconSigemCentralRender=Object.freeze({draw,drawRows,detail,settings,pinColumns,h});
})(window);