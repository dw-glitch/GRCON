/* Shared Excel construction for the data Worker and compatibility mode. */
(function(root){"use strict";
const XLSX=root.XLSX,GrconAllocationDashboardCore=root.GrconAllocationDashboardCore;
function xlsxSheets(payload, taskId, progress) {
  const book = XLSX.utils.book_new();
  for (const [index, tab] of (payload.sheets || []).entries()) {
    progress(taskId, "Montando aba " + tab.name, index, payload.sheets.length);
    const sheet = tab.aoa ? XLSX.utils.aoa_to_sheet(tab.rows) : XLSX.utils.json_to_sheet(tab.rows);
    if (tab.columns) sheet["!cols"] = tab.columns;
    if (tab.autofilter) sheet["!autofilter"] = { ref: sheet["!ref"] };
    XLSX.utils.book_append_sheet(book, sheet, tab.name);
  }
  progress(taskId, "Preparando o arquivo Excel…");
  return XLSX.write(book, { type: "array", bookType: "xlsx", compression: payload.compression !== false });
}
function centralExport(payload, taskId, progress){
    const state=payload.state,workspace=()=>payload.workspace;
    const root={GrconSigemCentralCore:{COLUMNS:payload.columns},XLSX};
    const notify=message=>{throw new Error(message);};
    progress(taskId,"Montando consulta SIGEM…");
    const keys=state.columns,rows=state.filtered.rows;
    if(!rows.length){notify("Nenhum resultado para exportar.");return;}
    const labels=Object.fromEntries(root.GrconSigemCentralCore.COLUMNS);
    const safe=v=>{
      const t=String(v==null?"":v);
      return /^\s*[=+\-@]/.test(t)||/^[\t\r\n]/.test(t)?"'"+t:t;
    };
    const meta=state.data.meta||{};
    const cells=[keys.map(k=>labels[k]||k),...rows.map(row=>keys.map(k=>safe(row[k])))];
    if(!XLSX?.utils?.aoa_to_sheet||!XLSX.writeFile){
      notify("Leitor Excel indisponível. Reabra o módulo e tente novamente.","error");return;
    }
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(cells),"Consulta");
    const info=XLSX.utils.aoa_to_sheet([["Consulta Geral",meta.fileName||"Indisponível"],
      ["Data de referência",meta.referenceDate||meta.importedAt||""],
      ["Snapshot",meta.snapshotId||""],["Origem",meta.source||"Consulta Geral compartilhada/local"],
      ["Contrato",workspace()],["Usuário",payload.userId||""],
      ["Tipo de consulta",state.view],["Pesquisa",state.effectiveQuery],
      ["Filtros",JSON.stringify(state.filters)],["Ordenação",JSON.stringify(state.sort)],
      ["Colunas",keys.join(" | ")],["Base desatualizada",String(Boolean(root.GrconSharedSigemQuery?.state?.stale))],
      ["Histórico completo",String(Boolean(state.data.historyComplete))],["Total de resultados",rows.length],["Não encontrados",state.filtered.missing.join(" | ")],
      ["Gerado em",new Date().toISOString()]].map(row=>row.map(safe)));
    XLSX.utils.book_append_sheet(wb,info,"Fonte e filtros");
    if(state.view==="evolucao"&&state.comparison){
      const comparison=state.comparison;
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
        ["Comparação",comparison.id],["Base anterior",comparison.previous.file_name],["Snapshot anterior",comparison.previous.snapshot_id],
        ["Base atual",comparison.current.file_name],["Snapshot atual",comparison.current.snapshot_id],
        ["Data anterior",comparison.previous.metadata?.referenceDate||comparison.previous.published_at],
        ["Data atual",comparison.current.metadata?.referenceDate||comparison.current.published_at]
      ].map(row=>row.map(safe))),"Versões comparadas");
    }
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
    progress(taskId,"Preparando arquivo Excel…");
    return XLSX.write(wb,{type:"array",bookType:"xlsx",compression:true});
  }
function allocationExport(payload, taskId, progress) {
    progress(taskId, "Preparando dados das alocações…");
    const data = GrconAllocationDashboardCore.exportData(payload.aggregated, payload.options);
    const sheets = [["Resumo", data.summary], ["Alocações", data.allocations], ["Documentos", data.documents]].map(([name, lines]) => ({
      name, aoa: true, autofilter: true,
      rows: lines.map(line => line.map(value => typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? "'" + value : value)),
      columns: lines[0].map(label => ({ wch: Math.min(40, Math.max(16, String(label).length + 5)) })),
    }));
    return xlsxSheets({ sheets }, taskId, progress);
  }

const call=(work,payload,onProgress=()=>{})=>work(payload,null,(_id,message,done,total)=>onProgress({message,done,total}));
root.GrconDataExports=Object.freeze({central:(payload,onProgress)=>call(centralExport,payload,onProgress),allocation:(payload,onProgress)=>call(allocationExport,payload,onProgress),sheets:(payload,onProgress)=>call(xlsxSheets,payload,onProgress)});
})(typeof globalThis!=="undefined"?globalThis:this);
