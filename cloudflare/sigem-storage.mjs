import {storageMode, tursoClient, initialize, beginSnapshot, copyPage, sealSnapshot, auditPage, verifiedPage, canonical, fail} from './sigem-turso.mjs';
import {startMigration,migrationStatus,handleJobPage} from './sigem-migration-job.mjs';
import {liveRpc,externalPage,handleLiveImport,serviceRpc} from './sigem-live.mjs';
import {sha256} from './sigem-turso.mjs';
import {documentInventory,purgeDocumentBatch,purgeSigemBase} from './storage-retirement.mjs';
const PREFIX = '/api/sigem-storage/';
const uuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v || '');
const reply = (data, status = 200, headers = {}) => Response.json(data, {status, headers: {'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', ...headers}});
async function call(env, token, name, input) {
  let response;
  try { response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {method: 'POST', headers: {apikey: env.SUPABASE_SECRET_KEY, authorization: token, 'content-type': 'application/json'}, body: JSON.stringify(input), signal: AbortSignal.timeout(30000)}); }
  catch { throw fail('SIGEM_SOURCE_UNAVAILABLE', 503); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw fail(data?.code === '42501' ? 'SIGEM_ACCESS_DENIED' : 'SIGEM_SOURCE_REJECTED', data?.code === '42501' ? 403 : 409);
  return data;
}
function consent(env) { if (env.GRCON_SIGEM_EXTERNAL_STORAGE_AUTHORIZED !== 'true') throw fail('SIGEM_STORAGE_AUTHORIZATION_REQUIRED', 403); }
async function body(request, maxBytes = 16384) {
  const reader = request.body?.getReader();
  if (!reader) throw fail('SIGEM_INPUT_REQUIRED', 400);
  let text = '', size = 0; const decoder = new TextDecoder();
  for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > maxBytes) { await reader.cancel(); throw fail('SIGEM_INPUT_TOO_LARGE', 413); } text += decoder.decode(part.value, {stream: true}); }
  try { return JSON.parse(text + decoder.decode()); } catch { throw fail('SIGEM_INPUT_INVALID', 400); }
}
export async function handleSigemStorage(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  if(url.pathname===PREFIX+'job-page'&&request.method==='POST')return handleJobPage(request,env);
  try {
    const token = request.headers.get('authorization');
    if (!/^Bearer \S+$/i.test(token || '')) throw fail('AUTH_REQUIRED', 401);
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw fail('SIGEM_NOT_CONFIGURED', 503);
    const auth = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {headers: {apikey: env.SUPABASE_SECRET_KEY, authorization: token}, signal: AbortSignal.timeout(10000)});
    const user=auth.ok?await auth.json():null;
    if (!uuid(user?.id)) throw fail('AUTH_INVALID', 401);
    const input = request.method === 'POST' ? await body(request, url.pathname === PREFIX+'import-chunk' ? 4000000 : 100000) : Object.fromEntries(url.searchParams);
    if (!input || Array.isArray(input) || !uuid(input.workspace)) throw fail('SIGEM_WORKSPACE_INVALID', 400);
    const action = url.pathname.slice(PREFIX.length), mode = storageMode(env);
    const control = (operation, data = {}) => call(env, token, 'grcon_sigem_storage_control', {target_workspace: input.workspace, operation, input: data});
    const admin = (operation,data={}) => call(env,token,'grcon_storage_admin',{target_workspace:input.workspace,operation,input:data});
    if(action==='bases'&&request.method==='GET')return reply({ok:true,...await admin('bases')});
    if(action==='release-base'&&request.method==='POST'){
      if(env.GRCON_SIGEM_RELEASE_ENABLED!=='true')throw fail('SIGEM_RELEASE_NOT_APPROVED');
      if(!uuid(input.snapshot)||input.confirm!==input.snapshot)throw fail('SIGEM_RELEASE_CONFIRMATION_REQUIRED',400);
      const source=await admin('base-source',{snapshot:input.snapshot}),inventory=await control('inventory');
      const progress=await migrationStatus(env,input.workspace,inventory);
      if(!progress.complete)throw fail('SIGEM_RELEASE_AUDIT_REQUIRED');
      const proof=[...(progress.completedSnapshots||[]),...progress.reports.flatMap(r=>r.snapshots||[])].find(p=>p.id===source.id&&p.fullAudit===true&&p.count===source.record_count&&p.validatedRecords===source.record_count);
      if(!proof)throw fail('SIGEM_RELEASE_AUDIT_REQUIRED');
      const key=`sigem-backups/v1/${source.workspace_id}/${source.contract_id}/${source.id}/manifest-${proof.manifestHash}.json`;
      if(proof.manifestKey!==key)throw fail('SIGEM_RELEASE_AUDIT_REQUIRED');
      const object=await env.GRCON_DOCUMENTS.get(key),bytes=object?await object.text():'';
      if(await sha256(bytes)!==proof.manifestHash)throw fail('SIGEM_RELEASE_BACKUP_MISMATCH');
      const manifest=JSON.parse(bytes),saved=manifest.source,{status:oldStatus,...oldMeta}=saved||{},{status:newStatus,...newMeta}=source;
      if(canonical(oldMeta)!==canonical(newMeta)||!(oldStatus===newStatus||(oldStatus==='active'&&newStatus==='archived'))||manifest.checksum!==proof.checksum||manifest.recordCount!==source.record_count)throw fail('SIGEM_RELEASE_SOURCE_CHANGED');
      const target=(await tursoClient(env).execute(`SELECT state,checksum,expected_count FROM sigem_snapshots WHERE workspace_id=? AND contract_id=? AND id=?`,[source.workspace_id,source.contract_id,source.id])).rows[0];
      if(target?.state!=='verified'||target.checksum!==proof.checksum||target.expected_count!==source.record_count)throw fail('SIGEM_RELEASE_DESTINATION_MISMATCH');
      // One request performs at most one bounded, durable PostgreSQL stage.
      // The UI calls again using the same independently verified Turso/R2 proof.
      return reply({ok:true,...await serviceRpc(env,'grcon_sigem_release_step',{target_workspace:input.workspace,actor_id:user.id,target_snapshot:source.id,proof})});
    }
    if(action==='document-inventory'&&request.method==='GET'){
      const scope=await admin('document-scope');
      return reply({ok:true,...await documentInventory(env.GRCON_DOCUMENTS,scope.prefix),catalogRecords:scope.records,multipartUploads:scope.multipart.length});
    }
    if(action==='document-purge'&&request.method==='POST'){
      if(input.confirm!=='EXCLUIR ARQUIVOS DO COFRE')throw fail('DOCUMENT_PURGE_CONFIRMATION_REQUIRED',400);
      const scope=await admin('document-scope'),result=await purgeDocumentBatch(env.GRCON_DOCUMENTS,scope);
      if(result.complete)await admin('document-finish');
      return reply({ok:true,...result});
    }
    if(action==='delete-base'&&request.method==='POST'){
      if(!uuid(input.snapshot)||input.confirm!==input.snapshot)throw fail('SIGEM_DELETE_CONFIRMATION_REQUIRED',400);
      const source=await admin('base-source',{snapshot:input.snapshot});
      // Probe the destination before tombstoning; source authorization and the
      // active-base exclusion are rechecked transactionally in begin.
      const db=tursoClient(env);await db.execute('SELECT 1');
      await admin('delete-base-begin',{snapshot:input.snapshot});
      const result=await purgeSigemBase(db,env.GRCON_DOCUMENTS,source);
      if(result.complete)await admin('delete-base-finish',{snapshot:input.snapshot});
      return reply({ok:true,...result});
    }
    if (['import-begin','import-chunk','import-publish'].includes(action) && request.method === 'POST') {
      return reply({ok:true,...await handleLiveImport(env,user,input.workspace,action,input)});
    }
    if (action === 'page' && request.method === 'POST') {
      const after = Number(input.after), size = Number(input.size);
      if (!uuid(input.snapshot) || !Number.isInteger(after) || after < 0 || after > 100000 || !Number.isInteger(size) || size < 1 || size > 1000) throw fail('SIGEM_PAGE_INVALID', 400);
      if (env.GRCON_SIGEM_DIRECT_IMPORTS_ENABLED === 'true') {
        const info = await liveRpc(env,user.id,input.workspace,'metadata',{snapshot:input.snapshot});
        if (info.kind) return reply({ok:true,rows:await externalPage(env,info,after,size),source:'turso',shadow:'disabled'});
      }
      // Definitive cutover stays locked until SQL projections and publication
      // protocol pass their integration gate. A config typo cannot bypass it.
      if (mode === 'turso') throw fail('SIGEM_CUTOVER_NOT_READY', 503);
      const source = await call(env, token, 'grcon_sigem_query_page', {target_workspace: input.workspace, target_snapshot: input.snapshot, after_row: after, page_size: size});
      let shadow = 'disabled';
      if (mode === 'shadow') {
        shadow = 'unavailable';
        try {
          consent(env);
          const metadata = await control('authorize-page', {snapshot: input.snapshot});
          const parallel = await verifiedPage(tursoClient(env), metadata, after, size);
          shadow = canonical(source) === canonical(parallel) ? 'matched' : 'diverged';
        } catch (error) { shadow = error.code === 'SIGEM_SNAPSHOT_NOT_VERIFIED' ? 'not-migrated' : 'unavailable'; }
        if (shadow !== 'matched') console.warn('SIGEM_SHADOW_CHECK', {workspace: input.workspace, snapshot: input.snapshot, after, result: shadow});
      }
      return reply({ok: true, rows: source, source: 'supabase', shadow}, 200, {'x-grcon-sigem-shadow': shadow});
    }
    if (action === 'status' && request.method === 'GET') {
      const status = await control('status'); // database-enforced master check
      const configuration = {databaseUrlPresent: Boolean(String(env.TURSO_DATABASE_URL || '').trim()), authTokenPresent: Boolean(String(env.TURSO_AUTH_TOKEN || '').trim())};
      let turso = {configured: configuration.databaseUrlPresent && configuration.authTokenPresent, connected: false, configuration};
      if (turso.configured) {
        try {
          const db = tursoClient(env);
          await db.execute('SELECT 1 AS connected'); turso.connected = true;
          try {
            consent(env); // connection probe sends no corporate identifiers
            turso.databaseBytes = (await db.execute('PRAGMA page_count')).rows[0]?.page_count * (await db.execute('PRAGMA page_size')).rows[0]?.page_size;
            turso.snapshots = (await db.execute(`SELECT id,state,expected_count,checksum,verified_at FROM sigem_snapshots WHERE workspace_id=? AND contract_id=? ORDER BY id`, [input.workspace, status.contractId])).rows;
            if(env.GRCON_SIGEM_DIRECT_IMPORTS_ENABLED==='true'&&(await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sigem_live_uploads'")).rows.length){
              const live=(await db.execute("SELECT id,CASE WHEN state='sealed' THEN 'verified' ELSE state END state,expected_count,checksum,NULL verified_at FROM sigem_live_uploads WHERE workspace_id=? AND contract_id=? AND state<>'retired'",[input.workspace,status.contractId])).rows;
              turso.snapshots.push(...live);
            }
            turso.initialized = true;
          } catch { turso.initialized = false; }
        } catch (error) {
          // Only locally defined codes are returned, never upstream messages or secrets.
          const allowed = ['TURSO_NOT_CONFIGURED', 'TURSO_URL_INVALID', 'TURSO_TOKEN_FORMAT_INVALID', 'TURSO_AUTH_REJECTED', 'TURSO_DATABASE_NOT_FOUND', 'TURSO_TIMEOUT', 'TURSO_RATE_LIMIT', 'TURSO_UNAVAILABLE', 'TURSO_QUERY_FAILED', 'TURSO_RESPONSE_INVALID', 'TURSO_INTEGER_RANGE', 'TURSO_REDIRECT_REJECTED'];
          turso.error = allowed.includes(error?.code) ? error.code : 'TURSO_UNAVAILABLE';
        }
      } else turso.error = 'TURSO_NOT_CONFIGURED';
      // Optional administrator-entered plan limits. They are NOT provider-reported quotas.
      // Never manufacture a percentage when no independently verified quota is configured.
      const configuredLimit = key => {
        const raw = String(env[key] || '').trim();
        const number = /^[1-9][0-9]*$/.test(raw) ? Number(raw) : NaN;
        return Number.isSafeInteger(number) && number > 0 ? number : null;
      };
      status.supabaseCapacityBytes = configuredLimit('GRCON_SUPABASE_DB_LIMIT_BYTES');
      turso.capacityBytes = configuredLimit('GRCON_TURSO_DB_LIMIT_BYTES');
      turso.capacitySource = turso.capacityBytes ? 'worker_configuration' : null;
      return reply({ok: true, ...status, mode, externalStorageAuthorized: env.GRCON_SIGEM_EXTERNAL_STORAGE_AUTHORIZED === 'true', preflightApproved: env.GRCON_SIGEM_MIGRATION_PREFLIGHT_APPROVED === 'true', turso, backupPrefix: 'sigem-backups/v1/', cutoverReady: false, cleanupAllowed: false});
    }
    if (action === 'inventory' && request.method === 'GET') return reply({ok: true, ...await control('inventory')});
    if(action==='background-copy'&&request.method==='POST'){
      const inventory=await control('inventory');
      return reply({ok:true,...await startMigration(env,input.workspace,user.id,inventory)});
    }
    if(action==='background-status'&&request.method==='GET'){
      const inventory=await control('inventory');
      return reply({ok:true,...await migrationStatus(env,input.workspace,inventory)});
    }
    if (!['copy', 'seal', 'audit'].includes(action) || request.method !== 'POST' || !uuid(input.snapshot)) throw fail('SIGEM_ROUTE_INVALID', 404);
    const source = await control('source', {snapshot: input.snapshot}); // fresh master and contract check on every mutation
    consent(env);
    if (env.GRCON_SIGEM_MIGRATION_PREFLIGHT_APPROVED !== 'true') throw fail('SIGEM_CAPACITY_CHECK_REQUIRED', 409);
    const db = tursoClient(env), bucket = env.GRCON_DOCUMENTS;
    if (!bucket) throw fail('SIGEM_BACKUP_UNAVAILABLE', 503);
    // Prepare the schema and snapshot on its first page, rather than repeating
    // six remote setup statements for every batch. copyPage still rechecks the
    // immutable source metadata before each backup or destination write.
    if (action === 'seal' || (action === 'copy' && Number(input.after) === 0)) { await initialize(db); await beginSnapshot(db, source); }
    if (action === 'copy' || action === 'audit') {
      const after = Number(input.after);
      if (!Number.isInteger(after) || after < 0 || after >= source.record_count || after % 250 !== 0) throw fail('SIGEM_PAGE_INVALID', 400);
      const page = await control('source-page', {snapshot: source.id, after});
      if (canonical(page.source) !== canonical(source)) throw fail('SIGEM_SOURCE_CHANGED');
      return reply({ok: true, ...await (action === 'audit' ? auditPage(db, bucket, source, after, page.rows) : copyPage(db, bucket, source, after, page.rows))});
    }
    return reply({ok: true, ...await sealSnapshot(db, bucket, source)});
  } catch (error) {
    const code = /^[A-Z0-9_]{1,80}$/.test(error.code || '') ? error.code : 'SIGEM_STORAGE_UNAVAILABLE';
    return reply({ok: false, error: code, message: code}, error.status || 503);
  }
}



