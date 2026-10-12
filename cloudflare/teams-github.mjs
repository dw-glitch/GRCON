import {githubConfig} from './teams-github-config.mjs';
import {callbackPresentation} from './teams-traceability.mjs';
const ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS = `${ISSUER}/.well-known/jwks`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (code,status=400) => Object.assign(new Error(code),{code,status});
const json = (data,status=200) => Response.json(data,{status,headers:{'cache-control':'no-store'}});
let keyCache;
function bytes(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw fail('OIDC_INVALID',401);
  try {return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0));} catch {throw fail('OIDC_INVALID',401);}
}
function parse(value) {try{return JSON.parse(new TextDecoder().decode(bytes(value)));}catch{throw fail('OIDC_INVALID',401);}}
export async function verifyGithubToken(token,config,{fetchImpl=fetch,now=Date.now(),useCache=true}={}) {
  if (typeof token!=='string' || token.length>24000) throw fail('OIDC_INVALID',401);
  const parts=token.split('.');
  if(parts.length!==3)throw fail('OIDC_INVALID',401);
  const header=parse(parts[0]),claims=parse(parts[1]),clock=Math.floor(now/1000);
  if(header.alg!=='RS256' || header.typ!=='JWT' || typeof header.kid!=='string' || header.kid.length>256)throw fail('OIDC_INVALID',401);
  if(claims.iss!==ISSUER || claims.aud!==config.audience || !Number.isFinite(claims.exp) || !Number.isFinite(claims.iat) || !Number.isFinite(claims.nbf) || claims.exp<=clock || claims.nbf>clock+30 || claims.iat>clock+30 || claims.iat<clock-600 || claims.exp-claims.iat>600)throw fail('OIDC_EXPIRED_OR_INVALID',401);
  const [owner,name]=config.repository.split('/');
  const subjects=[`repo:${config.repository}:ref:refs/heads/main`,`repo:${owner}@${config.ownerId}/${name}@${config.repositoryId}:ref:refs/heads/main`];
  if(claims.repository!==config.repository || String(claims.repository_id)!==config.repositoryId || String(claims.repository_owner_id)!==config.ownerId || String(claims.actor_id)!==config.ownerId || claims.repository_visibility!=='private' || claims.ref!=='refs/heads/main' || claims.workflow_ref!==config.workflow || !subjects.includes(claims.sub) || !['issues','workflow_dispatch'].includes(claims.event_name))throw fail('OIDC_SOURCE_REJECTED',403);
  let keys=useCache && keyCache?.expires>now ? keyCache.keys : null;
  if(!keys || !keys.some(x=>x.kid===header.kid)) {
    const response=await fetchImpl(JWKS,{redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw fail('OIDC_KEYS_UNAVAILABLE',503);
    const data=await response.json();
    if(!Array.isArray(data.keys) || data.keys.length>30)throw fail('OIDC_KEYS_INVALID',503);
    keys=data.keys;if(useCache)keyCache={keys,expires:now+300000};
  }
  const jwk=keys.find(x=>x.kid===header.kid && x.kty==='RSA' && x.use==='sig' && (!x.alg || x.alg==='RS256'));
  if(!jwk)throw fail('OIDC_KEY_UNKNOWN',401);
  let valid=false;
  try {const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));}catch{throw fail('OIDC_SIGNATURE_INVALID',401);}
  if(!valid)throw fail('OIDC_SIGNATURE_INVALID',401);
  return claims;
}
export function githubRecord(record,config) {
  if(!record || record.schema!=='grcon-teams-github-v1' || !['confirm','effects','expired','failed','probe'].includes(record.kind))throw fail('GITHUB_RECORD_INVALID');
  if(record.kind==='probe') {
    if(!UUID.test(record.nonce || ''))throw fail('GITHUB_PROBE_INVALID');
    return {kind:'probe',nonce:record.nonce};
  }
  if(!UUID.test(record.attemptId || '') || !UUID.test(record.workspaceId || ''))throw fail('GITHUB_ID_INVALID');
  const input={kind:record.kind,attemptId:record.attemptId,workspaceId:record.workspaceId};
  if(['expired','failed'].includes(record.kind))return input;
  if(record.conversationId!==config.conversation || typeof record.messageId!=='string' || !record.messageId || record.messageId.length>255)throw fail('GITHUB_CARD_INVALID');
  Object.assign(input,{messageId:record.messageId,conversationId:record.conversationId});
  if(record.messageUrl) {
    let url;try{url=new URL(record.messageUrl);}catch{throw fail('GITHUB_MESSAGE_URL_INVALID');}
    if(!['https://teams.microsoft.com','https://teams.cloud.microsoft'].includes(url.origin) || url.username || url.password)throw fail('GITHUB_MESSAGE_URL_INVALID');
    input.messageUrl=url.href;
  }
  if(record.kind==='confirm') {
    const r=record.responder;
    if(r?.tenantId?.toLowerCase()!==config.tenant.toLowerCase() || !UUID.test(r?.objectId || '') || typeof r?.displayName!=='string' || !r.displayName.trim() || r.displayName.length>160)throw fail('GITHUB_RESPONDER_INVALID',403);
    if(!['total','partial'].includes(record.type) || typeof record.respondedAt!=='string' || !Number.isFinite(Date.parse(record.respondedAt)))throw fail('GITHUB_RESPONSE_INVALID');
    const indices=record.type==='partial' ? String(record.selection ?? '').split(',') : [];
    if(record.type==='partial' && (!indices.length || new Set(indices).size!==indices.length || indices.some(x=>!/^\d+$/.test(x))))throw fail('GITHUB_SELECTION_INVALID');
    Object.assign(input,{type:record.type,selectedIndices:indices,respondedAt:record.respondedAt,responder:{tenantId:r.tenantId,objectId:r.objectId,displayName:r.displayName.trim()}});
  } else {
    if(!/^\d+$/.test(String(record.confirmationIssueId || '')) || !['sent','uncertain','skipped'].includes(record.noticeStatus) || typeof record.cardUpdated!=='boolean' || (record.noticeStatus==='sent' && (typeof record.replyMessageId!=='string' || !record.replyMessageId || record.replyMessageId.length>255)))throw fail('GITHUB_EFFECTS_INVALID');
    Object.assign(input,{confirmationIssueId:String(record.confirmationIssueId),noticeStatus:record.noticeStatus,replyMessageId:record.replyMessageId || null,cardUpdated:record.cardUpdated});
  }
  return input;
}
async function readBody(request) {
  const reader=request.body?.getReader();if(!reader)throw fail('JSON_REQUIRED');
  const chunks=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>64000){await reader.cancel();throw fail('GITHUB_BODY_TOO_LARGE',413);}chunks.push(value);}
  const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(buffer));}catch{throw fail('JSON_INVALID');}
}
export async function handleGithubRoute(request,env,{fetchImpl=fetch,now=Date.now(),useCache=true}={}) {
  if(new URL(request.url).pathname!=='/api/egrdt-teams/github')return null;
  if(request.method!=='POST')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405);
  try {
    const cfg=githubConfig(env);
    const authorization=request.headers.get('authorization') || '';
    if(!/^Bearer\s+\S+$/i.test(authorization))throw fail('OIDC_REQUIRED',401);
    const claims=await verifyGithubToken(authorization.replace(/^Bearer\s+/i,''),cfg,{fetchImpl,now,useCache});
    const data=await readBody(request),record=githubRecord(data.record,cfg);
    if(record.kind==='probe')return json({ok:true,probe:record.nonce,transport:'github'});
    if(claims.event_name!=='issues' || String(data.repositoryId)!==cfg.repositoryId || !/^\d+$/.test(String(data.issueId || '')))throw fail('GITHUB_EVENT_REJECTED',403);
    const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(record))));
    const fingerprint=[...hash].map(x=>x.toString(16).padStart(2,'0')).join('');
    const headers={'content-type':'application/json',apikey:env.SUPABASE_SECRET_KEY};
    if(!env.SUPABASE_SECRET_KEY.startsWith('sb_secret_'))headers.authorization=`Bearer ${env.SUPABASE_SECRET_KEY}`;
    const response=await fetchImpl(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/grcon_teams_github_sync`,{method:'POST',headers,redirect:'error',signal:AbortSignal.timeout(10000),body:JSON.stringify({source_repository:cfg.repositoryId,source_issue:String(data.issueId),fingerprint,input:record})});
    if(!response.ok)throw fail('GITHUB_CONFIRMATION_REJECTED',response.status>=500?503:409);
    const result=await response.json();
    return json({ok:true,...result,...(result.attempt?callbackPresentation(result.attempt):{})});
  }catch(e){console.error('GRCON GitHub bridge',e.code || 'GITHUB_INTERNAL');return json({ok:false,code:e.code || 'GITHUB_INTERNAL'},e.status || 500);}
}
