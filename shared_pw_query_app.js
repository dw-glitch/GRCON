(function(root){
  'use strict';
  const state={base:null,versions:[],error:'',stale:false,busy:false,scope:''};
  const snapshots=new Map();let epoch=0,refreshPromise=null;
  const cloud=()=>root.GrconCloud;
  const scope=()=>JSON.stringify([cloud()?.state?.session?.user?.id||'',cloud()?.state?.membership?.workspace_id||'']);
  const core=()=>{if(!root.GrconSigemPwDashboard)throw Error('Motor PW indisponível.');return root.GrconSigemPwDashboard;};
  const connected=()=>Boolean(cloud()?.state?.membership?.workspace_id&&cloud()?.state?.client&&cloud()?.state?.online);
  const canPublish=()=>connected()&&['owner','admin','operator'].includes(cloud()?.state?.membership?.role);
  const canEditDate=()=>connected()&&['owner','admin'].includes(cloud()?.state?.membership?.role);
  function reset(){epoch++;snapshots.clear();state.base=null;state.versions=[];state.error='';state.stale=false;state.scope=scope();refreshPromise=null;}
  function assertContext(ticket,identity){if(ticket!==epoch||identity!==scope()){const e=Error('O contrato ou a conta mudou.');e.name='AbortError';throw e;}}
  async function request(operation,input={},identity=scope()){
    const workspace=cloud()?.state?.membership?.workspace_id;
    if(!workspace||!connected())throw Error('Conecte-se para consultar o PW compartilhado.');
    let timer;
    try{
      const response=await Promise.race([cloud().state.client.rpc('grcon_pw_base',{target_workspace:workspace,operation,input}),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('O banco não respondeu a tempo. A base PW anterior foi preservada.')),45000);})]);
      if(identity!==scope()){const e=Error('O contexto mudou.');e.name='AbortError';throw e;}
      if(response.error)throw response.error;
      return response.data;
    }finally{clearTimeout(timer);}
  }
  function remember(id,base){snapshots.delete(id);snapshots.set(id,base);while(snapshots.size>3)snapshots.delete(snapshots.keys().next().value);return base;}
  function metadata(version){return {...version.metadata,kind:'pw',snapshotId:version.snapshot_id||version.id,
    source:'shared-projectwise',fileName:version.file_name,recordCount:version.record_count,
    sharedWorkspaceId:cloud()?.state?.membership?.workspace_id,
    sharedVersion:version.version,sharedCreatedBy:version.created_by,
    importedAt:version.metadata?.importedAt||version.published_at||version.created_at};}
  async function listVersions(){
    if(state.scope!==scope())reset();
    const identity=scope(),data=await request('list',{},identity);
    state.versions=Array.isArray(data?.versions)?data.versions:[];
    return state.versions;
  }
  async function loadSnapshot(id,versions){
    if(state.scope!==scope())reset();
    const ticket=epoch,identity=scope();
    const catalog=versions||await listVersions();assertContext(ticket,identity);
    const version=catalog.find(v=>v.snapshot_id===id);
    if(!version)throw Error('Esta versão PW não está disponível no contrato atual.');
    const meta=metadata(version),cached=snapshots.get(id);
    if(cached)return remember(id,{...cached,meta});
    const count=Number(version.record_count);
    if(!Number.isInteger(count)||count<1||count>100000)throw Error('Contagem PW inválida.');
    const sourceRecords=new Array(count);
    for(let first=0;first<count;first+=4000){
      assertContext(ticket,identity);
      const offsets=[];for(let offset=first;offset<Math.min(first+4000,count);offset+=1000)offsets.push(offset);
      const pages=await Promise.all(offsets.map(after=>request('page',{id,after},identity)));
      assertContext(ticket,identity);
      pages.forEach((page,i)=>{
        const expected=Math.min(1000,count-offsets[i]);
        if(!Array.isArray(page?.rows)||page.rows.length!==expected)throw Error('Snapshot PW incompleto; a base anterior foi preservada.');
        page.rows.forEach((entry,j)=>{
          const payload=entry.payload;
          const validCode=typeof payload?.document==='string' && payload.document.trim().length>0;
          const traceableInvalid=payload?.pwRawInvalid===true && !validCode
            && Array.isArray(payload.pwRawCells) && payload.pwRawCells.some(v=>String(v??'').trim());
          if(entry.row_number!==offsets[i]+j+1||(!validCode&&!traceableInvalid))
            throw Error('Paginação PW inválida.');
          sourceRecords[offsets[i]+j]=payload;
        });
      });
    }
    return remember(id,{meta,records:sourceRecords.filter(row=>!row.pwRawInvalid && String(row.document||'').trim()),sourceRecords});
  }
  function refresh(){
    if(state.scope!==scope())reset();
    if(refreshPromise)return refreshPromise;
    if(!cloud()?.state?.membership?.workspace_id){reset();return Promise.resolve(null);}
    const ticket=epoch,identity=scope();
    const promise=(async()=>{
      try{
        if(!state.base){const cached=await core().kvGet('shared-pw:'+identity,null);assertContext(ticket,identity);if(cached){state.base=cached;state.stale=true;}}
        if(!connected())throw Error('Sem conexão. Usando o último PW compartilhado disponível neste computador.');
        const catalog=await listVersions();assertContext(ticket,identity);
        const current=catalog.find(v=>v.status==='active');
        if(!current){
          const local=await core().loadPwBase();assertContext(ticket,identity);
          if(local.meta?.source==='shared-projectwise')await core().kvSet(core().PW_BASE_KEY,{meta:null,records:[]});
          state.base=null;state.error='';state.stale=false;
          await core().kvSet('shared-pw:'+identity,null);return null;
        }
        const base=await loadSnapshot(current.snapshot_id,catalog);assertContext(ticket,identity);
        const local=await core().loadPwBase();assertContext(ticket,identity);
        const changed=local.meta?.snapshotId!==base.meta.snapshotId||local.meta?.importedAt!==base.meta.importedAt||local.meta?.source!=='shared-projectwise';
        const saved=changed?await core().savePwBase(base):local;assertContext(ticket,identity);
        state.base=base;state.error='';state.stale=false;
        if(changed)await core().kvSet('shared-pw:'+identity,base);assertContext(ticket,identity);
        if(changed)root.dispatchEvent(new CustomEvent('grcon:pw-base-updated',{detail:{baseMeta:saved.meta,source:'shared-projectwise'}}));
        return base;
      }catch(error){
        if(error.name==='AbortError')return null;
        if(identity===scope()){state.error=error.message||'Não foi possível atualizar o PW compartilhado.';state.stale=Boolean(state.base);}
        return state.base;
      }
    })();
    refreshPromise=promise.finally(()=>{if(refreshPromise===wrapped)refreshPromise=null;});
    const wrapped=refreshPromise;return wrapped;
  }
  async function publish(base,onProgress){
    if(state.scope!==scope())reset();
    if(!canPublish())throw Error('Seu perfil não pode publicar o PW compartilhado.');
    if(state.busy)throw Error('Já existe uma publicação PW em andamento.');
    const records=base?.sourceRecords||base?.records;
    const validRow=r=>r&&typeof r==='object'&&(
      (typeof r.document==='string'&&r.document.trim().length>0)
      ||(r.pwRawInvalid===true && !String(r.document||'').trim()
        && Array.isArray(r.pwRawCells) && r.pwRawCells.some(v=>String(v??'').trim()))
    );
    if(!Array.isArray(records)||!records.length||records.length>100000||records.some(r=>!validRow(r)))
      throw Error('Base PW inválida para compartilhamento.');
    if(!base.sourceRecords&&Number(base.meta?.sourceRecordCount)>records.length)throw Error('Esta base histórica não preservou todos os registros originais. Importe o CSV original antes de compartilhar.');
    const ticket=epoch,identity=scope();state.busy=true;
    try{
      const latest=await request('current',{},identity);assertContext(ticket,identity);
      const {snapshotId,historySourceSnapshotId,...sourceMeta}=base.meta||{};
      const started=await request('begin',{fileName:sourceMeta.fileName,count:records.length,
        metadata:{...sourceMeta,sharedSchemaVersion:2},expectedActive:latest?.snapshot?.snapshot_id||null},identity);
      for(let i=0;i<records.length;i+=250){
        assertContext(ticket,identity);await request('chunk',{id:started.id,first:i+1,rows:records.slice(i,i+250)},identity);
        onProgress?.({done:Math.min(records.length,i+250),total:records.length,message:'Publicando base PW'});
      }
      assertContext(ticket,identity);await request('publish',{id:started.id},identity);assertContext(ticket,identity);
      snapshots.clear();await refresh();
      if(state.error)throw Error('PW publicado, mas a confirmação local falhou. Atualize antes de tentar novamente.');
      return state.base;
    }finally{state.busy=false;}
  }
  async function setReferenceDate(value,id,expectedImportedAt){
    if(!canEditDate())throw Error('Somente proprietário ou administrador pode alterar a data operacional PW.');
    const date=new Date(value);if(Number.isNaN(date.getTime()))throw Error('Data PW inválida.');
    await request('date',{id,importedAt:date.toISOString(),...(expectedImportedAt!==undefined?{expectedImportedAt}:{})});snapshots.delete(id);await refresh();
    if(state.error)throw Error('Data PW salva, mas a atualização local falhou. Atualize a base.');
  }
  async function remove(id){await request('delete',{id});snapshots.delete(id);await refresh();}
  for(const name of ['grcon:contract-context-changed','grcon:cloud-signed-out'])root.addEventListener(name,reset);
  root.GrconSharedPwQuery=Object.freeze({state,refresh,listVersions,loadSnapshot,publish,setReferenceDate,remove,canPublish,canEditDate,current:()=>state.base});
})(window);
