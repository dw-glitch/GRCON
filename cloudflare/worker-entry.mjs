import legacyWorker from "./worker.mjs";

const PREFIX = "/api/document-vault/";
const SINGLE_UPLOAD_LIMIT = 64 * 1024 * 1024;
const MIB = 1024 * 1024;

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function apiError(message, status = 400, code = "VAULT_ERROR", detail) {
  return json({ ok: false, error: code, message, detail: detail || undefined }, status);
}

function safeText(value, max = 4096) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function safeUuid(value) {
  const text = safeText(value, 64);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : "";
}

function bearerToken(request) {
  const value = request.headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function supabaseConfig(env) {
  const url = safeText(env.SUPABASE_URL, 2048).replace(/\/+$/, "");
  const secret = safeText(env.SUPABASE_SECRET_KEY, 8192);
  if (!url || !secret) throw new Error("Cofre indisponível: SUPABASE_URL/SUPABASE_SECRET_KEY não configurados no Worker.");
  return { url, secret };
}

function serviceHeaders(secret) {
  const headers = {
    apikey: secret,
    "content-type": "application/json",
  };
  // Compatibilidade com o service_role JWT legado. As chaves sb_secret_* novas
  // funcionam pelo cabeçalho apikey e não devem ser tratadas como JWT.
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(secret)) {
    headers.authorization = `Bearer ${secret}`;
  }
  return headers;
}

async function authenticatedUser(request, env) {
  const token = bearerToken(request);
  if (!token) throw Object.assign(new Error("Sessão obrigatória."), { status: 401, code: "AUTH_REQUIRED" });
  const { url, secret } = supabaseConfig(env);
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: secret, authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw Object.assign(new Error("Sessão inválida ou expirada."), { status: 401, code: "AUTH_INVALID" });
  }
  const user = await response.json();
  if (!user?.id) throw Object.assign(new Error("Usuário não identificado."), { status: 401, code: "AUTH_INVALID" });
  return user;
}

async function rpc(env, name, payload) {
  const { url, secret } = supabaseConfig(env);
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: serviceHeaders(secret),
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!response.ok) {
    const message = data?.message || data?.error_description || data?.hint || "Falha no catálogo do Cofre.";
    throw Object.assign(new Error(message), { status: response.status === 403 ? 403 : 400, code: data?.code || "CATALOG_ERROR", detail: data });
  }
  return data;
}

async function catalog(env, workspaceId, actorId, operation, input = {}) {
  return rpc(env, "grcon_document_catalog", {
    target_workspace: workspaceId,
    actor_id: actorId,
    operation,
    input,
  });
}

async function listCatalog(env, workspaceId, actorId, input = {}) {
  return rpc(env, "grcon_document_vault_list", {
    target_workspace: workspaceId,
    actor_id: actorId,
    input,
  });
}

async function lookupCatalog(env, workspaceId, actorId, input = {}) {
  return rpc(env, "grcon_document_vault_lookup", {
    target_workspace: workspaceId,
    actor_id: actorId,
    input,
  });
}

function workspaceFrom(request, body) {
  const url = new URL(request.url);
  return safeUuid(body?.workspaceId || body?.workspace_id || request.headers.get("x-grcon-workspace") || url.searchParams.get("workspace"));
}

function partSizeFor(sizeBytes) {
  const size = Math.max(0, Number(sizeBytes) || 0);
  return Math.max(16 * MIB, Math.ceil(size / 10000 / MIB) * MIB);
}

function cleanEtag(value) {
  return safeText(value, 255).replace(/^"+|"+$/g, "");
}

function contentDisposition(name) {
  const fallback = safeText(name, 255).replace(/[\r\n"]/g, "_") || "documento";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fallback)}`;
}

function requireBucket(env) {
  if (!env.GRCON_DOCUMENTS) throw new Error("Binding R2 GRCON_DOCUMENTS não configurado.");
  return env.GRCON_DOCUMENTS;
}

async function parseJson(request) {
  try { return await request.json(); }
  catch (_) { throw Object.assign(new Error("Corpo JSON inválido."), { status: 400, code: "INVALID_JSON" }); }
}

async function getOwnedOrReady(env, workspaceId, actorId, id) {
  const file = await catalog(env, workspaceId, actorId, "get", { id });
  if (!file?.id) throw Object.assign(new Error("Documento não localizado no Cofre."), { status: 404, code: "NOT_FOUND" });
  if (["deleting", "delete_failed"].includes(file.status)) throw Object.assign(new Error("Documento com exclusão pendente."), { status: 409, code: "DELETE_PENDING" });
  return file;
}

function normalizeMetadata(body) {
  const fileName = safeText(body?.fileName || body?.file_name, 255).split(/[\\/]/).pop();
  const relativePath = safeText(body?.relativePath || body?.relative_path || fileName, 4096);
  const documentCode = safeText(body?.documentCode || body?.document_code, 255).toUpperCase();
  const revision = safeText(body?.revision, 40).toUpperCase();
  const lastDot = fileName.lastIndexOf(".");
  const inferredFormat = lastDot > 0 ? fileName.slice(lastDot + 1) : "";
  const format = safeText(body?.format || inferredFormat, 40).toLowerCase();
  const sha256 = safeText(body?.sha256, 64).toLowerCase();
  const sizeBytes = Number(body?.sizeBytes ?? body?.size_bytes);
  if (!fileName || !/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw Object.assign(new Error("Nome, tamanho ou hash do arquivo inválido."), { status: 400, code: "INVALID_FILE" });
  }
  if (["zip","rar","7z","tar","gz"].includes(format)) {
    throw Object.assign(new Error("Arquivo compactado ignorado."), { status: 400, code: "ARCHIVE_IGNORED" });
  }
  return { file_name: fileName, relative_path: relativePath, document_code: documentCode, revision, format, sha256, size_bytes: sizeBytes };
}

async function handleHealth(env) {
  let supabase = false;
  try { supabase = Boolean(supabaseConfig(env)); } catch (_) { supabase = false; }
  return json({
    ok: Boolean(supabase && env.GRCON_DOCUMENTS),
    service: "grcon-document-vault",
    supabaseConfigured: supabase,
    r2Configured: Boolean(env.GRCON_DOCUMENTS),
    bucket: safeText(env.R2_BUCKET_NAME || "grcon-documents", 120),
  }, supabase && env.GRCON_DOCUMENTS ? 200 : 503);
}

async function handleList(request, env) {
  const user = await authenticatedUser(request, env);
  const url = new URL(request.url);
  const workspaceId = workspaceFrom(request);
  if (!workspaceId) return apiError("Workspace inválido.", 400, "WORKSPACE_REQUIRED");
  const data = await listCatalog(env, workspaceId, user.id, {
    after: Math.max(0, Number(url.searchParams.get("after")) || 0),
    limit: Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 100)),
    q: safeText(url.searchParams.get("q"), 160),
    allocation: safeText(url.searchParams.get("allocation") || "all", 32),
  });
  return json({ ok: true, ...data });
}

async function handleLookup(request, env) {
  const user = await authenticatedUser(request, env);
  const body = await parseJson(request);
  const workspaceId = workspaceFrom(request, body);
  if (!workspaceId) return apiError("Workspace inválido.", 400, "WORKSPACE_REQUIRED");
  const sourceItems = Array.isArray(body?.items) ? body.items : [];
  if (!sourceItems.length || sourceItems.length > 500) {
    return apiError("Informe entre 1 e 500 documentos por consulta.", 400, "LOOKUP_SIZE_INVALID");
  }
  const items = sourceItems.map((item, index) => {
    const documentCode = safeText(item?.documentCode || item?.document_code, 255).replace(/\s+/g, "").toUpperCase();
    const revision = safeText(item?.revision, 40).toUpperCase();
    if (!documentCode) {
      throw Object.assign(new Error("Código documental vazio na posição " + (index + 1) + "."), { status: 400, code: "LOOKUP_ITEM_INVALID" });
    }
    return {
      requestId: safeText(item?.requestId || item?.request_id || String(index + 1), 64),
      input: safeText(item?.input || documentCode, 512),
      documentCode,
      revision,
    };
  });
  const data = await lookupCatalog(env, workspaceId, user.id, { items });
  return json({ ok: true, results: Array.isArray(data?.results) ? data.results : [] });
}

async function handleInit(request, env) {
  const user = await authenticatedUser(request, env);
  const body = await parseJson(request);
  const workspaceId = workspaceFrom(request, body);
  if (!workspaceId) return apiError("Workspace inválido.", 400, "WORKSPACE_REQUIRED");
  const metadata = normalizeMetadata(body);

  const hashMatches = await catalog(env, workspaceId, user.id, "find_hash", {
    sha256: metadata.sha256,
    size_bytes: metadata.size_bytes,
  });
  const reusable = Array.isArray(hashMatches) ? hashMatches.find((item) => item?.id && item?.status === "ready") : null;
  const result = await catalog(env, workspaceId, user.id, "begin", {
    ...metadata,
    reuse_id: reusable?.id || null,
    allow_conflict: Boolean(body?.allowConflict),
  });
  if (result?.conflict) {
    return apiError("Já existe o mesmo documento/revisão/formato com conteúdo diferente. Confirme explicitamente para manter uma variante.", 409, "IDENTITY_CONFLICT", result);
  }
  if (result?.error) return apiError(result.message || "Não foi possível reservar o arquivo.", 409, result.error, result);
  const file = result?.file;
  if (!file?.id) return apiError("O catálogo não retornou a reserva do arquivo.", 500, "CATALOG_INVALID");
  if (["deleting", "delete_failed"].includes(file.status)) return apiError("Conclua a exclusão antes de enviar novamente.", 409, "DELETE_PENDING");
  const ready = file.status === "ready";
  const multipart = !ready && Number(file.size_bytes) > SINGLE_UPLOAD_LIMIT;
  return json({
    ok: true,
    duplicate: Boolean(result.duplicate),
    reused: Boolean(result.reused),
    ready,
    uploadMode: ready ? "none" : multipart ? "multipart" : "single",
    partSize: multipart ? partSizeFor(file.size_bytes) : null,
    file: {
      id: file.id,
      file_name: file.file_name,
      document_code: file.document_code,
      revision: file.revision,
      format: file.format,
      size_bytes: Number(file.size_bytes),
      sha256: file.sha256,
      status: file.status,
      object_key: file.object_key,
      multipart_id: file.multipart_id || null,
      parts: Array.isArray(file.parts) ? file.parts : [],
    },
  });
}

async function handleSingleUpload(request, env) {
  const user = await authenticatedUser(request, env);
  const workspaceId = workspaceFrom(request);
  const id = safeUuid(request.headers.get("x-grcon-file-id") || new URL(request.url).searchParams.get("id"));
  if (!workspaceId || !id || !request.body) return apiError("Upload incompleto.", 400, "UPLOAD_INVALID");
  const file = await getOwnedOrReady(env, workspaceId, user.id, id);
  if (file.status === "ready") return json({ ok: true, file, duplicate: true });
  if (Number(file.size_bytes) > SINGLE_UPLOAD_LIMIT) return apiError("Arquivo exige upload multipart.", 409, "MULTIPART_REQUIRED");

  const bucket = requireBucket(env);
  const object = await bucket.put(file.object_key, request.body, {
    httpMetadata: { contentType: request.headers.get("content-type") || "application/octet-stream" },
    customMetadata: { sha256: file.sha256, fileId: file.id, workspaceId },
  });
  const head = await bucket.head(file.object_key);
  const ok = Boolean(head && Number(head.size) === Number(file.size_bytes));
  const completed = await catalog(env, workspaceId, user.id, "complete", {
    id: file.id,
    object_key: file.object_key,
    ok,
    size: Number(head?.size || 0),
    sha256: file.sha256,
    etag: cleanEtag(object?.httpEtag || object?.etag || head?.httpEtag || head?.etag || "r2"),
  });
  if (!ok || completed?.error) return apiError(completed?.message || "O arquivo chegou ao R2 com tamanho divergente.", 409, completed?.error || "INTEGRITY_ERROR", completed);
  return json({ ok: true, file: completed });
}

async function handleMultipartStart(request, env) {
  const user = await authenticatedUser(request, env);
  const body = await parseJson(request);
  const workspaceId = workspaceFrom(request, body);
  const id = safeUuid(body?.id);
  if (!workspaceId || !id) return apiError("Envio multipart inválido.", 400, "MULTIPART_INVALID");
  const file = await getOwnedOrReady(env, workspaceId, user.id, id);
  if (file.status === "ready") return json({ ok: true, ready: true, file });
  if (file.multipart_id) {
    return json({ ok: true, uploadId: file.multipart_id, partSize: partSizeFor(file.size_bytes), parts: file.parts || [], file });
  }
  const upload = await requireBucket(env).createMultipartUpload(file.object_key, {
    httpMetadata: { contentType: safeText(body?.contentType, 255) || "application/octet-stream" },
    customMetadata: { sha256: file.sha256, fileId: file.id, workspaceId },
  });
  const updated = await catalog(env, workspaceId, user.id, "multipart", {
    id: file.id,
    object_key: file.object_key,
    multipart_id: upload.uploadId,
  });
  if (updated?.error) {
    try { await upload.abort(); } catch (_) {}
    return apiError(updated.message || "Não foi possível iniciar o multipart.", 409, updated.error, updated);
  }
  return json({ ok: true, uploadId: upload.uploadId, partSize: partSizeFor(file.size_bytes), parts: updated.parts || [], file: updated });
}

async function handleMultipartPart(request, env) {
  const user = await authenticatedUser(request, env);
  const url = new URL(request.url);
  const workspaceId = workspaceFrom(request);
  const id = safeUuid(request.headers.get("x-grcon-file-id") || url.searchParams.get("id"));
  const partNumber = Number(request.headers.get("x-grcon-part-number") || url.searchParams.get("part"));
  if (!workspaceId || !id || !Number.isInteger(partNumber) || partNumber < 1 || !request.body) {
    return apiError("Parte de upload inválida.", 400, "PART_INVALID");
  }
  const file = await getOwnedOrReady(env, workspaceId, user.id, id);
  if (!file.multipart_id) return apiError("Sessão multipart não iniciada.", 409, "MULTIPART_NOT_STARTED");
  const expectedSize = Number(request.headers.get("x-grcon-part-size") || request.headers.get("content-length"));
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0) return apiError("Tamanho da parte ausente.", 411, "PART_SIZE_REQUIRED");

  const upload = requireBucket(env).resumeMultipartUpload(file.object_key, file.multipart_id);
  const part = await upload.uploadPart(partNumber, request.body);
  const etag = cleanEtag(part.etag);
  const updated = await catalog(env, workspaceId, user.id, "part", {
    id: file.id,
    object_key: file.object_key,
    multipart_id: file.multipart_id,
    part: { partNumber, etag, size: expectedSize },
  });
  if (updated?.error) return apiError(updated.message || "A sessão multipart mudou.", 409, updated.error, updated);
  return json({ ok: true, part: { partNumber, etag, size: expectedSize } });
}

async function handleMultipartComplete(request, env) {
  const user = await authenticatedUser(request, env);
  const body = await parseJson(request);
  const workspaceId = workspaceFrom(request, body);
  const id = safeUuid(body?.id);
  if (!workspaceId || !id) return apiError("Conclusão multipart inválida.", 400, "MULTIPART_INVALID");
  const file = await getOwnedOrReady(env, workspaceId, user.id, id);
  if (file.status === "ready") return json({ ok: true, file });
  if (!file.multipart_id) return apiError("Sessão multipart não iniciada.", 409, "MULTIPART_NOT_STARTED");
  const parts = (Array.isArray(file.parts) ? file.parts : [])
    .map((part) => ({ partNumber: Number(part.partNumber), etag: safeText(part.etag, 255) }))
    .filter((part) => Number.isInteger(part.partNumber) && part.partNumber > 0 && part.etag)
    .sort((a, b) => a.partNumber - b.partNumber);
  const expected = Math.max(1, Math.ceil(Number(file.size_bytes) / partSizeFor(file.size_bytes)));
  if (parts.length !== expected) return apiError(`Upload incompleto: ${parts.length} de ${expected} partes confirmadas.`, 409, "PARTS_MISSING");

  const object = await requireBucket(env).resumeMultipartUpload(file.object_key, file.multipart_id).complete(parts);
  const head = await requireBucket(env).head(file.object_key);
  const ok = Boolean(head && Number(head.size) === Number(file.size_bytes));
  const completed = await catalog(env, workspaceId, user.id, "complete", {
    id: file.id,
    object_key: file.object_key,
    ok,
    size: Number(head?.size || 0),
    sha256: file.sha256,
    etag: cleanEtag(object?.httpEtag || object?.etag || head?.httpEtag || head?.etag || "multipart"),
  });
  if (!ok || completed?.error) return apiError(completed?.message || "Integridade final divergente.", 409, completed?.error || "INTEGRITY_ERROR", completed);
  return json({ ok: true, file: completed });
}

async function handleRestart(request, env) {
  const user = await authenticatedUser(request, env);
  const body = await parseJson(request);
  const workspaceId = workspaceFrom(request, body);
  const id = safeUuid(body?.id);
  if (!workspaceId || !id) return apiError("Reinício inválido.", 400, "RESTART_INVALID");
  const file = await getOwnedOrReady(env, workspaceId, user.id, id);
  if (file.multipart_id && file.status !== "ready") {
    try { await requireBucket(env).resumeMultipartUpload(file.object_key, file.multipart_id).abort(); } catch (_) {}
  }
  const restarted = await catalog(env, workspaceId, user.id, "restart", { id: file.id });
  return json({ ok: true, file: restarted });
}

async function handleDownload(request, env) {
  const user = await authenticatedUser(request, env);
  const url = new URL(request.url);
  const workspaceId = workspaceFrom(request);
  const id = safeUuid(url.searchParams.get("id"));
  if (!workspaceId || !id) return apiError("Documento inválido.", 400, "DOWNLOAD_INVALID");
  const file = await getOwnedOrReady(env, workspaceId, user.id, id);
  if (file.status !== "ready") return apiError("Documento ainda não está disponível.", 409, "NOT_READY");
  const object = await requireBucket(env).get(file.object_key);
  if (!object?.body) return apiError("Arquivo não encontrado no R2. O catálogo foi preservado para recuperação.", 409, "OBJECT_MISSING");
  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set("content-type", headers.get("content-type") || "application/octet-stream");
  headers.set("content-length", String(object.size));
  headers.set("content-disposition", contentDisposition(file.file_name));
  headers.set("cache-control", "private, no-store");
  headers.set("x-grcon-document-id", file.id);
  return new Response(object.body, { status: 200, headers });
}

async function handleDelete(request, env) {
  const user = await authenticatedUser(request, env);
  const body = await parseJson(request);
  const workspaceId = workspaceFrom(request, body);
  const id = safeUuid(body.id);
  if (!workspaceId || !id) return apiError("Documento inválido.", 400, "DELETE_INVALID");
  const operate = (operation, input = {}) => rpc(env, "grcon_document_delete", {
    target_workspace: workspaceId, actor_id: user.id, operation, input: { id, ...input },
  });
  const bucket = requireBucket(env);
  const job = await operate("begin");
  if (job.completed) return json({ ok: true, id });
  try {
    // A reused binary may back another catalog entry. Preserve that entry first.
    if (job.shared_object) {
      if (!await bucket.head(job.retained_key)) {
        const original = await bucket.get(job.object_key);
        if (!original?.body) throw new Error("Arquivo compartilhado indisponível. A exclusão pode ser tentada novamente.");
        await bucket.put(job.retained_key, original.body, {
          httpMetadata: original.httpMetadata, customMetadata: original.customMetadata,
        });
      }
      await operate("retain");
    }
    await bucket.delete(job.object_key);
    if (await bucket.head(job.object_key)) throw new Error("O armazenamento ainda não confirmou a exclusão.");
    await operate("finish");
    return json({ ok: true, id });
  } catch (error) {
    try { await operate("fail", { error: String(error.message || error) }); }
    catch (auditError) { console.error("Falha ao registrar exclusão pendente", auditError.message); }
    return apiError("A exclusão não foi concluída. O documento ficou indisponível para GRDT. Tente excluir novamente.", 409, "DELETE_INCOMPLETE");
  }
}

async function routeVault(request, env) {
  const url = new URL(request.url);
  const action = url.pathname.slice(PREFIX.length).replace(/\/+$/, "");
  if (action === "health" && request.method === "GET") return handleHealth(env);
  if (action === "list" && request.method === "GET") return handleList(request, env);
  if (action === "lookup" && request.method === "POST") return handleLookup(request, env);
  if (action === "delete" && request.method === "POST") return handleDelete(request, env);
  if (action === "init" && request.method === "POST") return handleInit(request, env);
  if (action === "upload" && request.method === "PUT") return handleSingleUpload(request, env);
  if (action === "multipart/start" && request.method === "POST") return handleMultipartStart(request, env);
  if (action === "multipart/part" && request.method === "PUT") return handleMultipartPart(request, env);
  if (action === "multipart/complete" && request.method === "POST") return handleMultipartComplete(request, env);
  if (action === "restart" && request.method === "POST") return handleRestart(request, env);
  if (action === "download" && request.method === "GET") return handleDownload(request, env);
  return apiError("Rota do Cofre não encontrada.", 404, "NOT_FOUND");
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith(PREFIX)) return await routeVault(request, env, ctx);
      return legacyWorker.fetch(request, env, ctx);
    } catch (error) {
      console.error("GRCON document vault:", error?.code || error?.name || "error", error?.message || error);
      return apiError(
        error?.message || "Falha interna no Cofre.",
        Number(error?.status) || 500,
        error?.code || "VAULT_INTERNAL",
        error?.status && error?.status < 500 ? error?.detail : undefined,
      );
    }
  },
};
