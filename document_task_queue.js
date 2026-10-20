(function(root){
 'use strict';
 const state={items:new Map(),error:'',loaded:false};let epoch=0;
 const cloud=()=>root.GrconCloud?.state;
 const scope=()=>JSON.stringify([cloud()?.session?.user?.id||'',cloud()?.membership?.workspace_id||'']);
 const key=value=>{const raw=String(value||'').trim().replace(/\s+/g,'').toUpperCase();const et=raw.match(/^([A-Z0-9]{3})[-_]RNEST[-_]([A-Z0-9]+)[-_](\d+(?:\.\d+){3})[-_]([A-Z0-9]+)[-_]([A-Z0-9]+)[-_](.+)$/);return et?[et[1],'RNEST',et[2],et[3],et[4],et[5],et[6].replace(/^NT-/,'')].join('_'):raw.replace(/^NT-/,'');};
 const canEdit=()=>Boolean(cloud()?.online&&['owner','admin','operator'].includes(cloud()?.membership?.role));
 const check=(ticket,identity)=>{if(ticket!==epoch||identity!==scope())throw Error('A conta ou o contrato mudou.');};
 async function rpc(operation,input,identity){
  if(!cloud()?.membership?.workspace_id||!cloud()?.online||!cloud()?.client)throw Error('Conecte-se para consultar a organização compartilhada.');
  const response=await cloud().client.rpc('grcon_document_tasks',{target_workspace:cloud().membership.workspace_id,operation,input});
  if(identity!==scope())throw Error('O contexto mudou.');if(response.error)throw response.error;return response.data;
 }
 async function load(){
  const ticket=epoch,identity=scope(),next=new Map();
  try{
   let after='';
   while(true){const page=await rpc('list',{after},identity);check(ticket,identity);
    if(!Array.isArray(page)||page.length>1000)throw Error('Resposta de organização inválida.');
    for(const item of page){if(!item.document_key||item.document_key<=after)throw Error('Página de organização inválida.');next.set(key(item.document_code),item);}
    if(page.length<1000)break;const cursor=page[page.length-1].document_key;if(cursor<=after)throw Error('Paginação sem avanço.');after=cursor;
   }
   check(ticket,identity);state.items=next;state.error='';state.loaded=true;
  }catch(error){if(ticket===epoch&&identity===scope())state.error=error.message||'Organização indisponível.';}
  return state;
 }
 async function save(document,values){
  const identity=scope(),ticket=epoch,existing=state.items.get(key(document));
  const item=await rpc('save',{document,priority:values.priority,responsible:values.responsible,dueDate:values.dueDate,note:values.note,expectedVersion:values.expectedVersion??existing?.version??0},identity);
  check(ticket,identity);state.items.set(key(document),item);return item;
 }
 function viewKey(){return 'grcon.pendingViews.v1:'+scope();}
 function views(){try{const rows=JSON.parse(root.localStorage.getItem(viewKey())||'[]');return Array.isArray(rows)?rows.slice(0,20):[];}catch(_){return [];}}
 function saveView(name,value){const label=String(name||'').trim().slice(0,80);if(!label)throw Error('Informe o nome da visualização.');const rows=views().filter(v=>v.name!==label);if(rows.length>=20)throw Error('Limite de 20 visualizações neste navegador.');rows.push({name:label,value});root.localStorage.setItem(viewKey(),JSON.stringify(rows));return rows;}
 function removeView(name){root.localStorage.setItem(viewKey(),JSON.stringify(views().filter(v=>v.name!==name)));}
 function filter(rows,options={}){const weight={urgente:2,alta:1,normal:0};const term=String(options.responsible||'').toLocaleLowerCase('pt-BR');return rows.filter(row=>{const task=state.items.get(key(row.document))||{};return (!options.priority||(task.priority||'normal')===options.priority)&&(!term||String(task.responsible||'').toLocaleLowerCase('pt-BR').includes(term));}).sort((a,b)=>{const ta=state.items.get(key(a.document))||{},tb=state.items.get(key(b.document))||{};return (weight[tb.priority]||0)-(weight[ta.priority]||0)||String(ta.due_date||'9999').localeCompare(String(tb.due_date||'9999'))||String(a.document).localeCompare(String(b.document),'pt-BR');});}
 function reset(){epoch++;state.items=new Map();state.error='';state.loaded=false;}
 for(const event of ['grcon:contract-context-changed','grcon:cloud-signed-out'])root.addEventListener(event,reset);
 root.GrconDocumentTasks=Object.freeze({state,key,canEdit,load,save,views,saveView,removeView,filter,get:document=>state.items.get(key(document))});
})(typeof window==='undefined'?globalThis:window);
