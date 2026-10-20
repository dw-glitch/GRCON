(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.GrconManagerialReport=api;})(typeof window==='undefined'?globalThis:window,function(root){
 'use strict';
 const fields={document:'DOCUMENTO',revision:'REVISÃO ENVIADA',egrdt:'ÚLTIMA eGRDT',status:'CONFERÊNCIA',priority:'PRIORIDADE',responsible:'RESPONSÁVEL',dueDate:'PRAZO',note:'OBSERVAÇÃO',contract:'CONTRATO',sourceFile:'BASE CONSULTA GERAL',sourceDate:'DATA DA BASE'};
 const required=['document','contract','sourceFile','sourceDate'];
 const storageKey=()=> 'grcon.importReview.v1:report-columns:'+(root.GrconImportReview?.scope?.()||'local');
 function cleanColumns(value){return [...new Set([...required,...(Array.isArray(value)?value:[])].filter(k=>Object.hasOwn(fields,k)))];}
 function columns(){try{return cleanColumns(JSON.parse(root.localStorage.getItem(storageKey())||'null')||Object.keys(fields));}catch(_){return Object.keys(fields);}}
 function setColumns(value){root.localStorage.setItem(storageKey(),JSON.stringify(cleanColumns(value)));}
 function build(rows,options={}){const selected=cleanColumns(options.columns||columns());const data=rows.map(row=>{const task=options.taskFor?.(row.document)||{},latest=row.latestSend||row,values={document:row.document,revision:latest.revisionSent||row.revisionSent||'',egrdt:row.latestEgrdtNumber||latest.egrdtNumber||'',status:row.newestPending?.statusLabel||row.statusLabel||row.status||'',priority:task.priority||'normal',responsible:task.responsible||'',dueDate:task.due_date||'',note:task.note||'',contract:options.contract||'',sourceFile:options.sourceFile||'',sourceDate:options.sourceDate||''};return selected.map(k=>values[k]);});return {columns:selected,headers:selected.map(k=>fields[k]),rows:data};}
 function csvCell(value){let text=String(value??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
 function csv(data){return '\ufeff'+[data.headers,...data.rows].map(row=>row.map(csvCell).join(';')).join('\r\n');}
 return Object.freeze({fields,required,columns,setColumns,build,csv});
});
