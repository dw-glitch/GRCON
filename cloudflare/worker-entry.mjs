import legacyWorker from "./worker.mjs";

const VAULT_PREFIX = "/api/document-vault/";
const R2_BUCKET = "grcon-documents";
const URL_TTL_SECONDS = 15 * 60;
const MAX_JSON_BYTES = 256_000;

const API_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
});

function json(status, payload, extra = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { ...API_HEADERS, ...extra } });
}

function text(value, max = 600) {
  return String(value === null || value === undefined ? "" : value).trim().slice(0, max);
}

async function readJsonBody(request) {
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_JSON_BYTES) throw Object.assign(new Error("Solicitação muito grande."), { status: 413, code: "PAYLOAD_TOO_LARGE" });
  return JSON.parse(new TextDecoder().decode(bytes) || "{}");
}

function bearerToken(request) {
  const match = text(request.headers.get("authorization"), 6000).match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error("Sessão do GRCON não informada."), { status: 401, code: "MISSING_SESSION" });
  return match[1];
}

function supabaseConfig(env) {
  const url = text(env.SUPABASE_URL, 1000).replace(/\/$/, "");
  const key = text(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY, 2000);
  if (!url || !key) throw Object.assign(new Error("Supabase do GRCON não configurado no Worker."), { status: 503, code: "SUPABASE_NOT_CONFIGURED" });
  return { url, key };
}

function restHeaders(token, env, prefer) {
  const config = supabaseConfig(env);
  return {
    Authorization: `Bearer ${token}`,
    apikey: config.key,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function restJson(path, token, env, options = {}) {
  const { url } = supabaseConfig(env);
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: restHeaders(token, env, options.prefer),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(12_000),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = raw; }
  if (!response.ok) {
    const message = data && (data.message || data.hint || data.details) || raw || "Falha ao registrar metadados do Cofre.";
    throw Object.assign(new Error(text(message, 500)), { status: response.status, code: "VAULT_DATABASE_ERROR" });
  }
  return data;
}

async function verifyMembership(token, workspaceId, env, allowedRoles) {
  const { url } = supabaseConfig(env);
  const headers = restHeaders(token, env);
  const userResponse = await fetch(`${url}/auth/v1/user`, { headers, signal: AbortSignal.timeout(10_000) });
  if (!userResponse.ok) throw Object.assign(new Error("Sessão inválida ou expirada."), { status: 401, code: "INVALID_SESSION" });
  const user = await userResponse.json();
  if (!user || !user.id) throw Object.assign(new Error("Usuário não identificado."), { status: 401, code: "INVALID_SESSION" });

  const query = new URLSearchParams({
    select: "workspace_id,role,active",
    user_id: `eq.${user.id}`,
    workspace_id: `eq.${workspaceId}`,
    active: "eq.true",
    limit: "1",
  });
  const rows = await restJson(`grcon_memberships?${query}`, token, env);
  if (!Array.isArray(rows) || !rows.length || !allowedRoles.includes(rows[0].role)) {
    throw Object.assign(new Error("Seu perfil não tem permissão para esta operação no Cofre."), { status: 403, code: "NOT_ALLOWED" });
  }
  return { id: user.id, email: text(user.email, 200), role: rows[0].role };
}

function normalizeHash(value) {
  const hash = text(value, 80).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) throw Object.assign(new Error("SHA-256 inválido."), { status: 400, code: "INVALID_SHA256" });
  return hash;
}

function normalizeMeta(input) {
  const sizeBytes = Number(input && input.sizeBytes);
  const workspaceId = text(input && input.workspaceId, 80);
  const originalFileName = text(input && input.originalFileName, 500);
  if (!workspaceId) throw Object.assign(new Error("Workspace não informado."), { status: 400, code: "WORKSPACE_REQUIRED" });
  if (!originalFileName) throw Object.assign(new Error("Nome do arquivo não informado."), { status: 400, code: "FILE_NAME_REQUIRED" });
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) throw Object.assign(new Error("Tamanho de arquivo inválido."), { status: 400, code: "INVALID_FILE_SIZE" });
  return {
    workspaceId,
    originalFileName,
    sizeBytes,
    mimeType: text(input && input.mimeType, 180) || "application/octet-stream",
    sha256: normalizeHash(input && input.sha256),
    documentCode: text(input && input.documentCode, 300),
    documentCodeNormalized: text(input && input.documentCodeNormalized, 300),
    revision: text(input && input.revision, 40),
    revisionNormalized: text(input && input.revisionNormalized, 40),
    sourceKind: ["upload", "folder-import", "grdt"].includes(text(input && input.sourceKind, 30)) ? text(input.sourceKind, 30) : "upload",
    originalRelativePath: text(input && input.originalRelativePath, 1000),
  };
}

function rfc3986(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

function bytesToHex(value) {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digestHex(value) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function hmac(keyBytes, value) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

async function signR2Url(method, objectKey, env, expires = URL_TTL_SECONDS) {
  const accountId = text(env.CLOUDFLARE_ACCOUNT_ID, 100);
  const accessKey = text(env.R2_ACCESS_KEY_ID, 300);
  const secretKey = text(env.R2_SECRET_ACCESS_KEY, 500);
  const bucket = text(env.R2_BUCKET_NAME, 100) || R2_BUCKET;
  if (!accountId || !accessKey || !secretKey) {
    throw Object.assign(new Error("Credenciais temporárias do Cofre ainda não foram configuradas no Worker."), { status: 503, code: "R2_SIGNING_NOT_CONFIGURED" });
  }

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${rfc3986(bucket)}/${String(objectKey).split("/").map(rfc3986).join("/")}`;
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const params = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKey}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.max(1, Math.min(3600, Number(expires) || URL_TTL_SECONDS))),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${rfc3986(key)}=${rfc3986(value)}`)
    .join("&");
  const canonicalRequest = [method.toUpperCase(), canonicalUri, canonicalQuery, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await digestHex(canonicalRequest)].join("\n");

  const kDate = await hmac(new TextEncoder().encode(`AWS4${secretKey}`), dateStamp);
  const kRegion = await hmac(kDate, "auto");
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  const signingKey = await crypto.subtle.importKey("raw", kSigning, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = bytesToHex(await crypto.subtle.sign("HMAC", signingKey, new TextEncoder().encode(stringToSign)));

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

async function findStoredObject(meta, token, env) {
  const query = new URLSearchParams({
    select: "id,object_key,sha256,size_bytes,mime_type,original_file_name,state",
    workspace_id: `eq.${meta.workspaceId}`,
    sha256: `eq.${meta.sha256}`,
    size_bytes: `eq.${meta.sizeBytes}`,
    state: "eq.available",
    limit: "1",
  });
  const rows = await restJson(`grcon_document_objects?${query}`, token, env);
  return Array.isArray(rows) && rows[0] || null;
}

async function conflictFor(meta, objectId, token, env) {
  if (!meta.documentCodeNormalized || !meta.revisionNormalized) return false;
  const query = new URLSearchParams({
    select: "object_id",
    workspace_id: `eq.${meta.workspaceId}`,
    document_code_normalized: `eq.${meta.documentCodeNormalized}`,
    revision_normalized: `eq.${meta.revisionNormalized}`,
    deleted_at: "is.null",
  });
  const rows = await restJson(`grcon_vault_documents?${query}`, token, env);
  return Array.isArray(rows) && rows.some((row) => row.object_id && row.object_id !== objectId);
}

async function ensureVaultDocument(meta, objectId, user, token, env) {
  const conflict = await conflictFor(meta, objectId, token, env);
  const state = !meta.documentCodeNormalized || !meta.revisionNormalized ? "unidentified" : conflict ? "conflict" : "identified";
  const payload = {
    workspace_id: meta.workspaceId,
    object_id: objectId,
    document_code: meta.documentCode || null,
    document_code_normalized: meta.documentCodeNormalized || null,
    revision: meta.revision || null,
    revision_normalized: meta.revisionNormalized || null,
    identification_state: state,
    source_kind: meta.sourceKind,
    original_relative_path: meta.originalRelativePath || null,
    created_by: user.id,
  };
  const rows = await restJson("grcon_vault_documents?on_conflict=workspace_id,object_id,document_code_normalized,revision_normalized", token, env, {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=representation",
    body: payload,
  });
  if (Array.isArray(rows) && rows[0]) return rows[0];
  const lookup = new URLSearchParams({ select: "*", workspace_id: `eq.${meta.workspaceId}`, object_id: `eq.${objectId}`, limit: "1" });
  const found = await restJson(`grcon_vault_documents?${lookup}`, token, env);
  return Array.isArray(found) && found[0] || { identification_state: state };
}

async function audit(workspaceId, user, action, entityType, entityId, metadata, token, env) {
  await restJson("grcon_document_audit", token, env, {
    method: "POST",
    prefer: "return=minimal",
    body: { workspace_id: workspaceId, actor_id: user.id, action, entity_type: entityType, entity_id: String(entityId || ""), metadata: metadata || {} },
  });
}

async function handleInit(request, env) {
  const token = bearerToken(request);
  const meta = normalizeMeta(await readJsonBody(request));
  const user = await verifyMembership(token, meta.workspaceId, env, ["owner", "admin", "operator"]);
  const existing = await findStoredObject(meta, token, env);
  if (existing) {
    const document = await ensureVaultDocument(meta, existing.id, user, token, env);
    await audit(meta.workspaceId, user, "reuse", "document_object", existing.id, { sha256: meta.sha256, vaultDocumentId: document.id || null }, token, env);
    return json(200, { ok: true, deduplicated: true, object: existing, document });
  }

  const objectKey = `documents/${crypto.randomUUID()}`;
  const inserted = await restJson("grcon_document_objects", token, env, {
    method: "POST",
    prefer: "return=representation",
    body: {
      workspace_id: meta.workspaceId,
      object_key: objectKey,
      sha256: meta.sha256,
      size_bytes: meta.sizeBytes,
      mime_type: meta.mimeType,
      original_file_name: meta.originalFileName,
      storage_bucket: text(env.R2_BUCKET_NAME, 100) || R2_BUCKET,
      state: "pending",
      created_by: user.id,
    },
  });
  const object = Array.isArray(inserted) && inserted[0];
  if (!object) throw Object.assign(new Error("Não foi possível iniciar o upload."), { status: 500, code: "VAULT_INIT_FAILED" });
  await audit(meta.workspaceId, user, "upload_started", "document_object", object.id, { sha256: meta.sha256, sizeBytes: meta.sizeBytes }, token, env);
  return json(200, { ok: true, deduplicated: false, object, uploadUrl: await signR2Url("PUT", objectKey, env), expiresIn: URL_TTL_SECONDS });
}

async function handleComplete(request, env) {
  const token = bearerToken(request);
  const input = await readJsonBody(request);
  const meta = normalizeMeta(input);
  const objectId = text(input && input.objectId, 100);
  const objectKey = text(input && input.objectKey, 700);
  if (!objectId || !objectKey) throw Object.assign(new Error("Objeto do upload não informado."), { status: 400, code: "VAULT_OBJECT_REQUIRED" });
  const user = await verifyMembership(token, meta.workspaceId, env, ["owner", "admin", "operator"]);

  if (!env.GRCON_DOCUMENTS || typeof env.GRCON_DOCUMENTS.head !== "function") {
    throw Object.assign(new Error("Binding R2 do Cofre não configurado."), { status: 503, code: "R2_BINDING_NOT_CONFIGURED" });
  }
  const stored = await env.GRCON_DOCUMENTS.head(objectKey);
  if (!stored) throw Object.assign(new Error("O arquivo ainda não foi localizado no Cofre."), { status: 409, code: "R2_OBJECT_MISSING" });
  if (Number(stored.size) !== meta.sizeBytes) throw Object.assign(new Error("O tamanho armazenado difere do arquivo original."), { status: 409, code: "R2_SIZE_MISMATCH" });

  const filter = new URLSearchParams({ id: `eq.${objectId}`, workspace_id: `eq.${meta.workspaceId}`, object_key: `eq.${objectKey}` });
  const updated = await restJson(`grcon_document_objects?${filter}`, token, env, {
    method: "PATCH",
    prefer: "return=representation",
    body: { state: "available", updated_at: new Date().toISOString() },
  });
  const object = Array.isArray(updated) && updated[0];
  if (!object) throw Object.assign(new Error("Metadados do objeto não foram localizados."), { status: 409, code: "VAULT_OBJECT_METADATA_MISSING" });
  const document = await ensureVaultDocument(meta, objectId, user, token, env);
  await audit(meta.workspaceId, user, document.identification_state === "conflict" ? "conflict" : "upload_completed", "vault_document", document.id || objectId, {
    sha256: meta.sha256, objectId, objectKey,
  }, token, env);
  return json(200, { ok: true, object, document, integrity: { sizeVerified: true, sha256Recorded: meta.sha256 } });
}

async function handleDownload(request, env) {
  const token = bearerToken(request);
  const input = await readJsonBody(request);
  const workspaceId = text(input && input.workspaceId, 80);
  const vaultDocumentId = text(input && input.vaultDocumentId, 100);
  if (!workspaceId || !vaultDocumentId) throw Object.assign(new Error("Documento do Cofre não informado."), { status: 400, code: "VAULT_DOCUMENT_REQUIRED" });
  const user = await verifyMembership(token, workspaceId, env, ["owner", "admin", "operator", "viewer"]);

  const docsQuery = new URLSearchParams({ select: "id,object_id,document_code,revision,identification_state", id: `eq.${vaultDocumentId}`, workspace_id: `eq.${workspaceId}`, deleted_at: "is.null", limit: "1" });
  const docs = await restJson(`grcon_vault_documents?${docsQuery}`, token, env);
  const document = Array.isArray(docs) && docs[0];
  if (!document) throw Object.assign(new Error("Documento não localizado no Cofre."), { status: 404, code: "VAULT_DOCUMENT_NOT_FOUND" });

  const objectQuery = new URLSearchParams({ select: "id,object_key,original_file_name,mime_type,size_bytes,sha256,state", id: `eq.${document.object_id}`, workspace_id: `eq.${workspaceId}`, state: "eq.available", limit: "1" });
  const objects = await restJson(`grcon_document_objects?${objectQuery}`, token, env);
  const object = Array.isArray(objects) && objects[0];
  if (!object) throw Object.assign(new Error("Arquivo do documento está indisponível."), { status: 404, code: "VAULT_OBJECT_NOT_FOUND" });

  await audit(workspaceId, user, "download_authorized", "vault_document", vaultDocumentId, { objectId: object.id }, token, env);
  return json(200, { ok: true, document, object, downloadUrl: await signR2Url("GET", object.object_key, env, 300), expiresIn: 300 });
}

async function handleVault(request, env, pathname) {
  if (request.method !== "POST") return json(405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Use POST nesta operação." }, { Allow: "POST" });
  try {
    if (pathname === `${VAULT_PREFIX}init`) return await handleInit(request, env);
    if (pathname === `${VAULT_PREFIX}complete`) return await handleComplete(request, env);
    if (pathname === `${VAULT_PREFIX}download`) return await handleDownload(request, env);
    return json(404, { ok: false, code: "NOT_FOUND", message: "Operação do Cofre não encontrada." });
  } catch (error) {
    const status = Number(error && error.status) || 400;
    const code = text(error && error.code, 80) || "VAULT_REQUEST_FAILED";
    console.error("GRCON Document Vault", code, error && error.message);
    return json(status, { ok: false, code, message: status >= 500 ? "Não foi possível concluir a operação do Cofre agora." : text(error && error.message, 400) || "Operação inválida." });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith(VAULT_PREFIX)) return handleVault(request, env, url.pathname);
    return legacyWorker.fetch(request, env, ctx);
  },
};

export const _internal = Object.freeze({
  normalizeMeta,
  signR2Url,
  verifyMembership,
  handleVault,
});
