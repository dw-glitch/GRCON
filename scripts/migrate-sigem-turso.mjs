// Administrative driver. The user session is read from the process environment;
// the Turso secret stays in the Worker and is never needed by this process.
import {writeFile} from 'node:fs/promises';
import {canonical, sha256, ZERO_HASH} from '../cloudflare/sigem-turso.mjs';
const args = process.argv.slice(2), workspace = args[1];
const usage = 'Usage: node scripts/migrate-sigem-turso.mjs <inventory|copy> <workspace-uuid> [report.json]';
if (!['inventory','copy'].includes(args[0]) || !/^[0-9a-f-]{36}$/i.test(workspace || '')) throw Error(usage);
const token = process.env.GRCON_ACCESS_TOKEN;
if (!token) throw Error('GRCON_ACCESS_TOKEN must be provided through a secure process environment, never a command argument or chat.');
const origin = new URL(process.env.GRCON_URL || 'https://grcon-cloudflare.grcon-qualidade.workers.dev');
if (origin.protocol !== 'https:' || origin.username || origin.password || !origin.hostname.endsWith('.workers.dev')) throw Error('Expected an HTTPS workers.dev origin.');
async function api(action, data) {
 for (let attempt = 0; attempt < 4; attempt++) {
  const response = await fetch(new URL('/api/sigem-storage/' + action + (data ? '' : '?workspace=' + workspace), origin), {method: data ? 'POST' : 'GET', redirect: 'error', headers: {authorization: `Bearer ${token}`, ...(data ? {'content-type':'application/json'} : {})}, ...(data ? {body:JSON.stringify({workspace,...data})} : {}), signal:AbortSignal.timeout(45000)});
  const result = await response.json();
  if (response.ok && result.ok) return result;
  if ([429,502,503,504].includes(response.status) && attempt < 3) {await new Promise(resolve=>setTimeout(resolve,1000*2**attempt));continue;}
  throw Error(result.error || 'SIGEM_MIGRATION_FAILED');
 }
}
const before = await api('inventory'), result = {startedAt:new Date().toISOString(),workspace,mode:args[0],inventoryCount:before.snapshots.length,records:before.snapshots.reduce((n,s)=>n+s.record_count,0),snapshots:[],complete:false};
console.log(JSON.stringify({snapshots:result.inventoryCount,records:result.records,pending:before.pendingSnapshots}));
if (args[0] === 'copy') {
 for (const s of before.snapshots) {
  for (let after=0;after<s.record_count;after+=250) await api('copy',{snapshot:s.id,after});
  const sealed = await api('seal',{snapshot:s.id});
  let digest=ZERO_HASH,validatedRecords=0;
  for (let after=0;after<s.record_count;after+=250) {
   const audit=await api('audit',{snapshot:s.id,after});
   const expected=Math.min(250,s.record_count-after);
   if(audit.after!==after+expected||audit.count!==expected||audit.snapshotChecksum!==sealed.checksum||!/^[a-f0-9]{64}$/.test(audit.checksum))throw Error('SIGEM_AUDIT_INCOMPLETE');
   digest=await sha256(digest+'\n'+audit.checksum);validatedRecords+=audit.count;
  }
  if(digest!==sealed.checksum||validatedRecords!==s.record_count)throw Error('SIGEM_AUDIT_HASH_MISMATCH');
  result.snapshots.push({id:s.id,...sealed,validatedRecords,fullAudit:true});
  console.log(JSON.stringify({verifiedSnapshots:result.snapshots.length,totalSnapshots:before.snapshots.length}));
 }
 const after = await api('inventory');
 result.inventoryStable = canonical(before) === canonical(after);
 result.pendingSnapshots=after.pendingSnapshots;
 result.validatedRecords=result.snapshots.reduce((n,s)=>n+s.validatedRecords,0);
 result.complete = result.inventoryStable && before.pendingSnapshots===0 && after.pendingSnapshots===0 && result.validatedRecords===result.records;
 if (!result.inventoryStable) console.log('Source inventory changed. Reconcile new publications and metadata before any cutover.');
}
result.finishedAt=new Date().toISOString();
if (args[2]) await writeFile(args[2],JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({complete:result.complete,officialSource:'supabase',cutoverReady:false,cleanupAllowed:false}));
if(args[0]==='copy'&&!result.complete)process.exitCode=2;

