import {canonical,sha256,tursoClient,fail,verifiedPage} from './sigem-turso.mjs';
const scope=s=>[s.workspace_id,s.contract_id,s.id];
const TABLES=[
 `CREATE TABLE IF NOT EXISTS sigem_live_uploads(workspace_id TEXT NOT NULL,contract_id TEXT NOT NULL,id TEXT NOT NULL,expected_count INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'importing',checksum TEXT,PRIMARY KEY(workspace_id,contract_id,id)) WITHOUT ROWID`,
 `CREATE TABLE IF NOT EXISTS sigem_live_rows(workspace_id TEXT NOT NULL,contract_id TEXT NOT NULL,snapshot_id TEXT NOT NULL,row_number INTEGER NOT NULL,payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),PRIMARY KEY(workspace_id,contract_id,snapshot_id,row_number))`,
 `CREATE TABLE IF NOT EXISTS sigem_live_batches(workspace_id TEXT NOT NULL,contract_id TEXT NOT NULL,snapshot_id TEXT NOT NULL,first_row INTEGER NOT NULL,last_row INTEGER NOT NULL,checksum TEXT NOT NULL,PRIMARY KEY(workspace_id,contract_id,snapshot_id,first_row)) WITHOUT ROWID`
];
export async function serviceRpc(env,name,input){
 const key=env.SUPABASE_SECRET_KEY,headers={apikey:key,'content-type':'application/json'};
 if(!key.startsWith('sb_secret_'))headers.authorization='Bearer '+key;
 let response;
 try{response=await fetch(env.SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(input),signal:AbortSignal.timeout(30000)});}catch{throw fail('SIGEM_CONTROL_UNAVAILABLE',503);}
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw fail(data?.code==='42501'?'SIGEM_ACCESS_DENIED':'SIGEM_IMPORT_REJECTED',data?.code==='42501'?403:409);
 return data;
}
export const liveRpc=(env,actor,workspace,operation,input={})=>serviceRpc(env,'grcon_sigem_live_service',{target_workspace:workspace,actor_id:actor,operation,input});
export async function beginLive(db,s){
 for(const sql of TABLES)await db.execute(sql);
 await db.execute(`INSERT INTO sigem_live_uploads(workspace_id,contract_id,id,expected_count) VALUES(?,?,?,?) ON CONFLICT DO NOTHING`,[...scope(s),s.expected_count]);
 const saved=(await db.execute(`SELECT expected_count FROM sigem_live_uploads WHERE workspace_id=? AND contract_id=? AND id=?`,scope(s))).rows[0];
 if(saved?.expected_count!==s.expected_count)throw fail('SIGEM_IMPORT_CONFLICT');
}
export function projectRows(rows){
 if(!Array.isArray(rows)||rows.length<1||rows.length>500)throw fail('SIGEM_IMPORT_INPUT_INVALID',400);
 return rows.map(r=>{
  if(!r||Array.isArray(r)||typeof r!=='object'||typeof r.document!=='string'||!r.document.trim()||r.document.length>255||typeof r.revision!=='string'||!r.revision.trim()||r.revision.length>16||String(r.status??'').length>1024||String(r.title??'').length>10000||String(r.discipline??'').length>1024)throw fail('SIGEM_IMPORT_INPUT_INVALID',400);
  return {document:r.document,revision:r.revision,status:String(r.status??''),title:String(r.title??''),discipline:String(r.discipline??'')};
 });
}
export async function writeLiveChunk(db,s,first,rows){
 projectRows(rows);
 if(!Number.isInteger(first)||first<1||first+rows.length-1>s.expected_count||(first-1)%250!==0||rows.length!==Math.min(250,s.expected_count-first+1))throw fail('SIGEM_IMPORT_PAGE_INVALID',400);
 const last=first+rows.length-1,bytes=canonical(rows),checksum=await sha256(bytes);
 const read=async()=>(await db.execute(`SELECT row_number,payload_json FROM sigem_live_rows WHERE workspace_id=? AND contract_id=? AND snapshot_id=? AND row_number>=? AND row_number<=? ORDER BY row_number`,[...scope(s),first,last])).rows;
 let saved=await read();
 if(!saved.length){
  await db.execute(`INSERT INTO sigem_live_rows(workspace_id,contract_id,snapshot_id,row_number,payload_json)
   SELECT ?,?,?,?+CAST(key AS INTEGER),value FROM json_each(?) WHERE EXISTS(SELECT 1 FROM sigem_live_uploads WHERE workspace_id=? AND contract_id=? AND id=? AND state='importing') ON CONFLICT DO NOTHING`,[...scope(s),first,bytes,...scope(s)]);
  saved=await read();
 }
 if(saved.length!==rows.length||saved.some((r,i)=>r.row_number!==first+i)||canonical(saved.map(r=>JSON.parse(r.payload_json)))!==bytes)throw fail('SIGEM_IMPORT_CONTENT_CONFLICT');
 await db.execute(`INSERT INTO sigem_live_batches VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING`,[...scope(s),first,last,checksum]);
 const proof=(await db.execute(`SELECT last_row,checksum FROM sigem_live_batches WHERE workspace_id=? AND contract_id=? AND snapshot_id=? AND first_row=?`,[...scope(s),first])).rows[0];
 if(proof?.last_row!==last||proof.checksum!==checksum)throw fail('SIGEM_IMPORT_CHECKPOINT_CONFLICT');
 return {count:rows.length,checksum};
}
export async function sealLive(db,s){
 const batches=(await db.execute(`SELECT first_row,last_row,checksum FROM sigem_live_batches WHERE workspace_id=? AND contract_id=? AND snapshot_id=? ORDER BY first_row`,scope(s))).rows;
 let count=0,digest='0'.repeat(64);
 for(const b of batches){if(b.first_row!==count+1||b.last_row!==Math.min(count+250,s.expected_count)||!/^[a-f0-9]{64}$/.test(b.checksum))throw fail('SIGEM_IMPORT_INCOMPLETE');count=b.last_row;digest=await sha256(digest+'\n'+b.checksum);}
 if(count!==s.expected_count)throw fail('SIGEM_IMPORT_INCOMPLETE');
 await db.execute(`UPDATE sigem_live_uploads SET state='sealed',checksum=? WHERE workspace_id=? AND contract_id=? AND id=? AND expected_count=? AND (SELECT count(*) FROM sigem_live_rows WHERE workspace_id=? AND contract_id=? AND snapshot_id=?)=? AND (SELECT max(row_number) FROM sigem_live_rows WHERE workspace_id=? AND contract_id=? AND snapshot_id=?)=?`,[digest,...scope(s),count,...scope(s),count,...scope(s),count]);
 const saved=(await db.execute(`SELECT state,checksum FROM sigem_live_uploads WHERE workspace_id=? AND contract_id=? AND id=?`,scope(s))).rows[0];
 if(saved?.state!=='sealed'||saved.checksum!==digest)throw fail('SIGEM_IMPORT_INCOMPLETE');
 return {count,checksum:digest};
}
export async function externalPage(env,info,after,size){
 const db=tursoClient(env),s=info.snapshot;
 if(!info.ready)throw fail('SIGEM_IMPORT_NOT_VERIFIED');
 if(info.kind==='legacy')return verifiedPage(db,s,after,size);
 const state=(await db.execute(`SELECT state,expected_count FROM sigem_live_uploads WHERE workspace_id=? AND contract_id=? AND id=?`,scope(s))).rows[0];
 if(state?.state!=='sealed'||state.expected_count!==s.record_count)throw fail('SIGEM_IMPORT_NOT_VERIFIED');
 const result=(await db.execute(`SELECT row_number,payload_json FROM sigem_live_rows WHERE workspace_id=? AND contract_id=? AND snapshot_id=? AND row_number>? ORDER BY row_number LIMIT ?`,[...scope(s),after,size])).rows;
 if(result.length!==Math.min(size,Math.max(0,s.record_count-after))||result.some((r,i)=>r.row_number!==after+i+1))throw fail('SIGEM_IMPORT_INCOMPLETE');
 return result.map(r=>({row_number:r.row_number,payload:JSON.parse(r.payload_json)}));
}
export async function externalRowsByNumber(env,info,numbers){
 if(!info.ready||!Array.isArray(numbers)||numbers.length>100||numbers.some(n=>!Number.isInteger(n)||n<1||n>info.snapshot.record_count))throw fail('SIGEM_PAGE_INVALID');
 if(!numbers.length)return [];
 const db=tursoClient(env),s=info.snapshot,legacy=info.kind==='legacy';
 const result=(await db.execute(`SELECT row_number,${legacy?'row_json':'payload_json'} AS value FROM ${legacy?'sigem_rows':'sigem_live_rows'} WHERE workspace_id=? AND contract_id=? AND snapshot_id=? AND row_number IN(SELECT value FROM json_each(?)) ORDER BY row_number`,[...scope(s),JSON.stringify(numbers)])).rows;
 if(result.length!==numbers.length||result.some((r,i)=>r.row_number!==numbers[i]))throw fail('SIGEM_IMPORT_INCOMPLETE');
 return result.map(r=>legacy?JSON.parse(r.value).payload:JSON.parse(r.value));
}
export async function handleLiveImport(env,user,workspace,action,input){
 if(env.GRCON_SIGEM_EXTERNAL_STORAGE_AUTHORIZED!=='true')throw fail('SIGEM_STORAGE_AUTHORIZATION_REQUIRED',403);
 const db=tursoClient(env);
 if(action==='import-begin'){
  const requestKey=await sha256(canonical({actor:user.id,workspace,fileName:input.fileName,count:input.count,metadata:input.metadata,expectedActive:input.expectedActive||null}));
  const info=await liveRpc(env,user.id,workspace,'begin',{...input,requestKey});
  await beginLive(db,info.snapshot);return {id:info.snapshot.id};
 }
 const info=await liveRpc(env,user.id,workspace,'metadata',{snapshot:input.snapshot}),s=info.snapshot;
 if(info.kind!=='live'||s.created_by!==user.id)throw fail('SIGEM_ACCESS_DENIED',403);
 if(action==='import-chunk'){
  if(s.status!=='pending')throw fail('SIGEM_IMPORT_ALREADY_PUBLISHED');
  const rows=projectRows(input.rows);await writeLiveChunk(db,s,input.first,input.rows);
  return liveRpc(env,user.id,workspace,'chunk',{snapshot:s.id,first:input.first,rows});
 }
 if(action==='import-publish'){
  if(info.ready&&['active','archived'].includes(s.status))return {id:s.id,published:true};
  const sealed=await sealLive(db,s);
  return liveRpc(env,user.id,workspace,'publish',{snapshot:s.id,...sealed});
 }
 throw fail('SIGEM_ROUTE_INVALID',404);
}
