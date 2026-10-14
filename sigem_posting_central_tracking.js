(function(root){
  'use strict';
  const scope=()=>[root.GrconCloud?.state?.membership?.workspace_id||'',root.GrconCloud?.state?.session?.user?.id||''].join(':');
  const workspace=()=>root.GrconCloud?.state?.membership?.workspace_id||'';
  const labels={MUDANCA_DE_INFORMACOES:'Mudança de informações',SEM_ALTERACAO:'Sem alteração',NOVO_NA_CONSULTA:'Localizado nesta versão',REMOVIDO_DA_CONSULTA:'Ausente nesta versão',ENTROU_EM_ANALISE:'Entrou em análise',SAIU_DE_ANALISE:'Saiu de análise',MUDANCA_DE_STATUS:'Mudança de status'};
  let context='',versions=[],targets=[],request=null,epoch=0;
  function reset(){context=scope();versions=[];targets=[];request=null;epoch++;}
  function ensureScope(){if(context!==scope())reset();}
  async function rpc(name,args){
    const client=root.GrconCloud?.state?.client;if(!client?.rpc||!workspace())throw Error('Conecte-se ao contrato para consultar o monitoramento.');
    const result=await client.rpc(name,args);if(result.error)throw result.error;return result.data;
  }
  async function load(){
    ensureScope();if(request)return request;
    const current=context,token=epoch;
    const task=(async()=>{
      const results=await Promise.all([root.GrconSharedSigemQuery?.listVersions?.()||rpc('grcon_sigem_query_versions',{target_workspace:workspace()}),rpc('grcon_monitor_targets',{target_workspace:workspace(),operation:'list',input:{}})]);
      if(current!==scope()||token!==epoch)return null;
      versions=Array.isArray(results[0])?results[0]:[];targets=Array.isArray(results[1])?results[1]:[];
      return {versions,targets};
    })();request=task;
    try{return await task;}finally{if(request===task)request=null;}
  }
  async function save(input){
    ensureScope();const current=context;
    if(!['owner','admin'].includes(root.GrconCloud?.state?.membership?.role))throw Error('Somente proprietário ou administrador pode alterar monitoramentos.');
    const result=await rpc('grcon_monitor_targets',{target_workspace:workspace(),operation:'save',input});
    if(current!==scope())return null;await load();return result;
  }
  async function modify(operation,input){
    ensureScope();const current=context;
    const result=await rpc('grcon_monitor_targets',{target_workspace:workspace(),operation,input});
    if(current!==scope())return null;await load();return result;
  }
  async function compare(previous,current,history=[]){
    ensureScope();const expected=context,token=epoch;
    if(!previous||!current||previous===current)throw Error('Selecione duas versões diferentes.');
    const previousVersion=versions.find(v=>v.snapshot_id===previous),currentVersion=versions.find(v=>v.snapshot_id===current);
    if(!previousVersion||!currentVersion)throw Error('Atualize as versões disponíveis deste contrato.');
    const id=await rpc('grcon_sigem_compare_versions',{target_workspace:workspace(),previous_snapshot:previous,current_snapshot:current});
    if(expected!==scope()||token!==epoch)return null;
    const rows=[];
    for(let offset=0;;){
      const result=await root.GrconCloud.state.client.rpc('grcon_sigem_comparison_rows',{target_workspace:workspace(),target_comparison:id}).range(offset,offset+999);
      if(result.error)throw result.error;if(expected!==scope()||token!==epoch)return null;
      const page=result.data||[];if(!page.length)break;rows.push(...page);offset+=page.length;
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    const date=v=>v.metadata?.referenceDate||v.published_at||v.created_at||'';
    const C=root.GrconSigemCentralCore.Conference;
    const project=field=>rows.filter(r=>r[field]!==null&&r[field]!==undefined).map(r=>({document:r.document_code,revision:r.revision,status:r[field],title:r.title,discipline:r.discipline}));
    const index=source=>new Map(source.map(r=>[C.documentIdentity(r.document)+'|'+C.normalizeRevision(r.revisionSent),r]));
    const before=index(C.reconcile(history,project('previous_status'),{},{baseReferenceDate:date(previousVersion)}).rows);
    const after=index(C.reconcile(history,project('current_status'),{},{baseReferenceDate:date(currentVersion)}).rows);
    return {meta:{id,previous:previousVersion,current:currentVersion},rows:rows.map((r,i)=>{
      const key=C.documentIdentity(r.document_code)+'|'+C.normalizeRevision(r.revision),p=before.get(key),n=after.get(key);
      return ({
      key:'evolution:'+i,document:r.document_code,documentIdentity:root.GrconSigemCentralCore.identity(r.document_code),title:r.title,discipline:r.discipline,
      revisionSent:r.revision,revisionFound:r.revision,previousStatus:r.previous_status||'',currentStatus:r.current_status||'',sigemStatus:r.current_status||'',
      previousConference:p?C.statusLabel(p.status):'',currentConference:n?C.statusLabel(n.status):'',
      pendingResolved:Boolean(p&&n&&p.status!==C.STATUSES.CONFIRMED&&n.status===C.STATUSES.CONFIRMED),
      divergence:Boolean(p?.status===C.STATUSES.REVISION_DIVERGENT||n?.status===C.STATUSES.REVISION_DIVERGENT),
      changeType:r.change_type,statusLabel:labels[r.change_type]||r.change_type,status:'EVOLUCAO',monitored:Boolean(r.monitored),
      previousBaseDate:date(previousVersion),currentBaseDate:date(currentVersion),note:r.change_type==='REMOVIDO_DA_CONSULTA'?'Ausência nesta versão não comprova cancelamento.':''
    });})};
  }
  root.GrconSigemCentralTracking=Object.freeze({load,save,modify,compare,reset});
  ['grcon:cloud-signed-out','grcon:contract-context-changed'].forEach(name=>root.addEventListener(name,reset));
})(window);
