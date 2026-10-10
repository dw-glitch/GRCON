// Standard Power Automate connectors write the list; only the server reads Graph.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SITE = /^[a-z0-9.-]+\.sharepoint\.com,[0-9a-f-]{36},[0-9a-f-]{36}$/i;
const fail = code => Object.assign(new Error(code), {code});
export const sharepointEnabled = env => env.GRCON_TEAMS_TRACEABILITY_ENABLED === 'true' && env.GRCON_TEAMS_TRANSPORT === 'sharepoint';

export function sharepointConfig(env) {
  const tenant = env.GRCON_MICROSOFT_TENANT_ID;
  const client = env.GRCON_GRAPH_CLIENT_ID;
  const site = env.GRCON_SHAREPOINT_SITE_ID;
  const list = env.GRCON_SHAREPOINT_LIST_ID;
  const conversation = env.GRCON_TEAMS_CONVERSATION_ID;
  if (!UUID.test(tenant || '') || !UUID.test(client || '') || !SITE.test(site || '') || !UUID.test(list || '') || !env.GRCON_GRAPH_CLIENT_SECRET || !conversation || !env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw fail('SHAREPOINT_NOT_CONFIGURED');
  const path = `/v1.0/sites/${site}/lists/${list}/items`;
  return {tenant, client, site, list, conversation, path, source:`${tenant}/${site}/${list}`};
}

// Never forward the Graph bearer token to a nextLink on another host or list.
export function graphUrl(value, config) {
  const url = new URL(value);
  if (url.origin !== 'https://graph.microsoft.com' || url.username || url.password || url.hash || ![config.path,`${config.path}/delta`].includes(decodeURI(url.pathname))) throw fail('GRAPH_LINK_REJECTED');
  return url.href;
}

export function sharepointInput(item, config) {
  if (!/^\d+$/.test(item.id || '')) throw fail('SHAREPOINT_ITEM_INVALID');
  const fields = item.fields;
  if (!fields || !['Queued','Processing','Confirmed','Expired','Failed'].includes(fields.State)) throw fail('SHAREPOINT_STATE_INVALID');
  if (['Queued','Processing'].includes(fields.State)) return null;
  if (!UUID.test(fields.RequestKey || '') || !UUID.test(fields.WorkspaceId || '')) throw fail('SHAREPOINT_ID_INVALID');
  const input = {attemptId:fields.RequestKey,workspaceId:fields.WorkspaceId,event:fields.State === 'Confirmed' ? 'confirm' : fields.State === 'Expired' ? 'expired' : 'failed'};
  if (input.event !== 'confirm') return input;
  if (typeof fields.ResponseJson !== 'string' || fields.ResponseJson.length > 32000) throw fail('SHAREPOINT_RESPONSE_INVALID');
  let response;
  try { response = JSON.parse(fields.ResponseJson); } catch { throw fail('SHAREPOINT_RESPONSE_INVALID'); }
  const responder = response.responder;
  if (responder?.tenantId?.toLowerCase() !== config.tenant.toLowerCase() || !UUID.test(responder?.objectId || '') || typeof responder?.displayName !== 'string' || !responder.displayName.trim() || responder.displayName.length > 160) throw fail('SHAREPOINT_RESPONDER_INVALID');
  if (response.conversationId !== config.conversation || !response.messageId || String(response.messageId).length > 255 || !['total','partial'].includes(response.type)) throw fail('SHAREPOINT_CARD_INVALID');
  if (response.messageUrl && !/^https:\/\/teams\.(?:microsoft\.com|cloud\.microsoft)\//.test(response.messageUrl)) throw fail('SHAREPOINT_MESSAGE_URL_INVALID');
  if (typeof response.respondedAt !== 'string' || !Number.isFinite(Date.parse(response.respondedAt))) throw fail('SHAREPOINT_RESPONSE_DATE_INVALID');
  const indices = response.type === 'partial' ? String(response.selection ?? '').split(',') : [];
  if (response.type === 'partial' && (!indices.length || new Set(indices).size !== indices.length || indices.some(index => !/^\d+$/.test(index)))) throw fail('SHAREPOINT_SELECTION_INVALID');
  if (!['pending','sending','sent','uncertain'].includes(fields.NoticeStatus) || (fields.NoticeStatus === 'sent' && !fields.ReplyMessageId)) throw fail('SHAREPOINT_NOTICE_INVALID');
  return {...input, messageId:String(response.messageId), conversationId:response.conversationId,
    ...(response.messageUrl ? {messageUrl:response.messageUrl} : {}), respondedAt:response.respondedAt,
    type:response.type, selectedIndices:indices, responder:{tenantId:responder.tenantId,objectId:responder.objectId,displayName:responder.displayName.trim()},
    noticeStatus:fields.NoticeStatus, replyMessageId:fields.ReplyMessageId || null, cardUpdated:fields.CardUpdated === true};
}

async function syncRpc(env, source, operation, input, fetchImpl) {
  const headers = {'content-type':'application/json',apikey:env.SUPABASE_SECRET_KEY};
  if (!env.SUPABASE_SECRET_KEY.startsWith('sb_secret_')) headers.authorization = `Bearer ${env.SUPABASE_SECRET_KEY}`;
  const response = await fetchImpl(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/grcon_teams_sharepoint_sync`, {method:'POST',headers,
    body:JSON.stringify({source_key:source,operation,input}),signal:AbortSignal.timeout(10000),redirect:'error'});
  if (!response.ok) throw fail('SHAREPOINT_PERSISTENCE_FAILED');
  return response.json();
}

export async function syncSharepoint(env, {fetchImpl = fetch, maxPages = 1} = {}) {
  if (!sharepointEnabled(env)) return {enabled:false};
  const config = sharepointConfig(env);
  const tokenResponse = await fetchImpl(`https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/token`, {method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.client,client_secret:env.GRCON_GRAPH_CLIENT_SECRET,grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'}),signal:AbortSignal.timeout(10000),redirect:'error'});
  if (!tokenResponse.ok) throw fail('GRAPH_AUTH_FAILED');
  const token = await tokenResponse.json();
  if (!token.access_token) throw fail('GRAPH_AUTH_FAILED');
  const state = await syncRpc(env,config.source,'state',{},fetchImpl);
  let cursor = state.cursor || null;
  const initialUrl = `https://graph.microsoft.com${config.path}/delta?$expand=fields&$top=20`;
  let url = graphUrl(cursor || initialUrl,config);
  let imported = 0;
  for (let page = 0; page < Math.min(50,Math.max(1,maxPages)); page++) {
    const response = await fetchImpl(url,{headers:{authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(15000),redirect:'error'});
    if (response.status === 410) {
      // Replay all items after token expiry. Receipts suppress already applied records.
      const reset = await syncRpc(env,config.source,'cursor',{expected:cursor,cursor:null},fetchImpl);
      if (!reset.advanced) return {enabled:true,imported,concurrent:true};
      cursor = null; url = initialUrl; continue;
    }
    if (!response.ok) throw fail(response.status === 429 ? 'GRAPH_THROTTLED' : 'GRAPH_READ_FAILED');
    const data = await response.json();
    if (!Array.isArray(data.value)) throw fail('GRAPH_PAGE_INVALID');
    const next = data['@odata.nextLink'] || data['@odata.deltaLink'];
    if (!next) throw fail('GRAPH_CURSOR_MISSING');
    const checkedNext = graphUrl(next,config);
    for (const item of data.value) {
      if (item.deleted) continue; // Deleting a list row never deletes GRCON audit records.
      let row = item;
      if (!item.fields) {
        if (!/^\d+$/.test(item.id || '')) throw fail('SHAREPOINT_ITEM_INVALID');
        const detail = await fetchImpl(`https://graph.microsoft.com${config.path}/${item.id}?$expand=fields`,{headers:{authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(10000),redirect:'error'});
        if (detail.status === 404) continue;
        if (!detail.ok) throw fail('GRAPH_READ_FAILED');
        row = await detail.json();
      }
      const input = sharepointInput(row,config);
      if (!input) continue;
      const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(input))));
      const fingerprint = Array.from(bytes,b => b.toString(16).padStart(2,'0')).join('');
      const result = await syncRpc(env,config.source,'import',{itemId:item.id,fingerprint,data:input},fetchImpl);
      if (!result.duplicate) imported++;
    }
    const advance = await syncRpc(env,config.source,'cursor',{expected:cursor,cursor:checkedNext},fetchImpl);
    if (!advance.advanced) return {enabled:true,imported,concurrent:true};
    cursor = checkedNext; url = checkedNext;
    if (!data['@odata.nextLink']) return {enabled:true,imported,complete:true};
  }
  return {enabled:true,imported,complete:false};
}
