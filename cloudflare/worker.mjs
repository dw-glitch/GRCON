const DEFAULT_SUPABASE_URL = "https://kvyrttccwzdhasplfxnr.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_K-6GJbXO-MJMWp9Re5lMmg_l1riCpP-";
const MAX_BODY_BYTES = 64_000;
const FLOW_TIMEOUT_MS = 15_000;
const ADAPTIVE_CARD_VERSION = "1.2";
const MASCOT_ASSET_PATH = "/assets/mascot/grcon-mascot-teams-thumbsup.png";
const DEFAULT_MASCOT_PUBLIC_URL = "https://raw.githubusercontent.com/dw-glitch/GRCON/034c4270f0e7585ba77010f26e4880c128c934e0/assets/mascot/grcon-mascot-teams-thumbsup.png";
const API_PATH = "/api/egrdt-teams-notification";

const API_SECURITY_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
});

function json(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...API_SECURITY_HEADERS, ...extraHeaders },
  });
}

function text(value, max = 500) {
  return String(value === null || value === undefined ? "" : value).trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildTableHtml(egrdtNumber, items) {
  const rows = items.map((item) => `<tr><td>${escapeHtml(egrdtNumber)}</td><td>${escapeHtml(item.document)} · Rev. ${escapeHtml(item.revision || "—")}</td><td>${escapeHtml(item.discipline || "Não informada")}</td></tr>`).join("");
  return `<table><thead><tr><th>EGRDT</th><th>REVISÕES ENVIADAS NA GRDT (DOCUMENTO · REVISÃO)</th><th>DISCIPLINAS</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function resolveMascotUrl(env) {
  const candidate = text(env.GRCON_TEAMS_MASCOT_URL, 1200) || DEFAULT_MASCOT_PUBLIC_URL;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password) return DEFAULT_MASCOT_PUBLIC_URL;
    return url.href;
  } catch (_) {
    return DEFAULT_MASCOT_PUBLIC_URL;
  }
}

function buildFallbackText(payload) {
  const revisions = payload.egrdt.items.map((item) => `- ${item.document} · Rev. ${item.revision || "—"} · ${item.discipline || "Não informada"}`).join("\n");
  return [
    "✅ eGRDT pronta para postagem",
    `eGRDT: ${payload.egrdt.number}`,
    "",
    "Revisões enviadas na GRDT:",
    revisions,
    "",
    "Enviado pelo GRCON",
  ].join("\n");
}

function buildAdaptiveCard(payload, imageUrl) {
  const revisionBlocks = payload.egrdt.items.map((item) => ({
    type: "Container",
    spacing: "Small",
    separator: true,
    items: [
      { type: "TextBlock", text: `${item.document} · Rev. ${item.revision || "—"}`, weight: "Bolder", wrap: true },
      { type: "TextBlock", text: item.discipline || "Não informada", isSubtle: true, size: "Small", spacing: "None", wrap: true },
    ],
  }));

  return {
    type: "AdaptiveCard",
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    version: ADAPTIVE_CARD_VERSION,
    body: [
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "auto",
            verticalContentAlignment: "Center",
            items: [{ type: "Image", url: imageUrl, size: "Medium", altText: "Mascote GRCON dando joia", horizontalAlignment: "Center" }],
          },
          {
            type: "Column",
            width: "stretch",
            verticalContentAlignment: "Center",
            items: [
              { type: "TextBlock", text: "✅ eGRDT pronta para postagem", weight: "Bolder", size: "Medium", wrap: true },
              { type: "TextBlock", text: payload.egrdt.number, weight: "Bolder", spacing: "Small", wrap: true },
              { type: "TextBlock", text: "Pronta para postagem no SIGEM", isSubtle: true, spacing: "None", wrap: true },
            ],
          },
        ],
      },
      { type: "TextBlock", text: "Revisões enviadas na GRDT", weight: "Bolder", spacing: "Medium", separator: true, wrap: true },
      ...revisionBlocks,
      { type: "TextBlock", text: "Enviado pelo GRCON", isSubtle: true, size: "Small", spacing: "Medium", wrap: true },
    ],
  };
}

function isAllowedFlowUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return host.endsWith(".logic.azure.com")
      || host.endsWith(".api.powerplatform.com")
      || host.endsWith(".powerautomate.com");
  } catch (_) {
    return false;
  }
}

function normalizePayload(input, env) {
  const source = input && input.source || {};
  const egrdt = input && input.egrdt || {};
  const confirmation = input && input.confirmation || {};
  const destination = input && input.destination || {};
  const items = Array.isArray(egrdt.items) ? egrdt.items.slice(0, 48).map((item) => ({
    document: text(item && item.document, 180),
    revision: text(item && item.revision, 20),
    discipline: text(item && item.discipline, 120),
  })).filter((item) => item.document) : [];
  const eventId = text(input && input.eventId, 240);
  const egrdtNumber = text(egrdt.number, 120);
  const workspaceId = text(source.workspaceId, 80);
  if (text(input && input.eventType, 80) !== "EGRDT_READY_FOR_SIGEM") throw new Error("Tipo de evento inválido.");
  if (!/^egrdt-ready:/i.test(eventId)) throw new Error("Identificador do aviso inválido.");
  if (!/^0130870-C1O-PGV-G-\d{4}-\d{4}\s*-\s*eGRDT$/i.test(egrdtNumber)) throw new Error("Número da eGRDT inválido.");
  if (!workspaceId) throw new Error("Área compartilhada não informada.");
  if (confirmation.folderConfirmed !== true) throw new Error("A colocação da eGRDT na pasta não foi confirmada.");
  if (text(destination.name, 120) !== "Qualidade - Documentação") throw new Error("Destino do Teams inválido.");
  if (!items.length) throw new Error("Nenhum documento foi informado no aviso.");
  const normalized = {
    schemaVersion: 1,
    eventType: "EGRDT_READY_FOR_SIGEM",
    eventId,
    requestedAt: text(input.requestedAt, 40) || new Date().toISOString(),
    destination: { type: "teams-group", name: "Qualidade - Documentação" },
    mentions: [
      { key: "adriana", displayName: "Adriana Nojosa da Silva" },
      { key: "janecleide", displayName: "Janecleide Maria de Oliveira" },
    ],
    egrdt: {
      number: egrdtNumber,
      generatedAt: text(egrdt.generatedAt, 40),
      outputType: text(egrdt.outputType, 80) || "eGRDT final",
      documentCount: items.length,
      items,
    },
    confirmation: {
      folderConfirmed: true,
      confirmedBy: text(confirmation.confirmedBy, 160),
      confirmedByEmail: text(confirmation.confirmedByEmail, 200),
    },
    source: {
      app: "GRCON",
      appVersion: text(source.appVersion, 30),
      workspaceId,
      historyRecordId: text(source.historyRecordId, 240),
      clientRecordId: text(source.clientRecordId, 240),
    },
    message: {
      heading: "eGRDT pronta para postagem no SIGEM",
      instruction: "A eGRDT abaixo já foi criada e colocada na pasta. Por favor, efetuem a postagem no SIGEM.",
      columns: ["EGRDT", "REVISÕES ENVIADAS NA GRDT (DOCUMENTO · REVISÃO)", "DISCIPLINAS"],
      tableHtml: buildTableHtml(egrdtNumber, items),
    },
  };
  const mascotUrl = resolveMascotUrl(env);
  normalized.message.mascot = { url: mascotUrl, altText: "Mascote GRCON dando joia", format: "image/png", sourcePath: MASCOT_ASSET_PATH };
  normalized.message.fallbackText = buildFallbackText(normalized);
  normalized.message.adaptiveCard = buildAdaptiveCard(normalized, mascotUrl);
  return normalized;
}

async function readJsonBody(request) {
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > MAX_BODY_BYTES) throw Object.assign(new Error("Aviso muito grande."), { status: 413, code: "PAYLOAD_TOO_LARGE" });
  const raw = new TextDecoder().decode(buffer);
  return JSON.parse(raw || "{}");
}

async function verifyUserAndMembership(accessToken, workspaceId, env, fetchImpl = fetch) {
  const supabaseUrl = String(env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, "");
  const supabaseKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY;
  const headers = { Authorization: `Bearer ${accessToken}`, apikey: supabaseKey, Accept: "application/json" };
  const userResponse = await fetchImpl(`${supabaseUrl}/auth/v1/user`, { headers, signal: AbortSignal.timeout(10_000) });
  if (!userResponse.ok) throw Object.assign(new Error("Sessão inválida ou expirada."), { status: 401, code: "INVALID_SESSION" });
  const user = await userResponse.json();
  if (!user || !user.id) throw Object.assign(new Error("Usuário não identificado."), { status: 401, code: "INVALID_SESSION" });
  const query = new URL(`${supabaseUrl}/rest/v1/grcon_memberships`);
  query.searchParams.set("select", "workspace_id,role,active");
  query.searchParams.set("user_id", `eq.${user.id}`);
  query.searchParams.set("workspace_id", `eq.${workspaceId}`);
  query.searchParams.set("active", "eq.true");
  query.searchParams.set("limit", "1");
  const membershipResponse = await fetchImpl(query, { headers, signal: AbortSignal.timeout(10_000) });
  const rows = membershipResponse.ok ? await membershipResponse.json() : [];
  if (!Array.isArray(rows) || !rows.length || !["owner", "admin", "operator"].includes(rows[0].role)) {
    throw Object.assign(new Error("Seu perfil não tem permissão para avisar a postagem desta eGRDT."), { status: 403, code: "NOT_ALLOWED" });
  }
  return { id: user.id, email: text(user.email, 200), role: rows[0].role };
}

async function handleTeamsNotification(request, env) {
  if (request.method !== "POST") {
    return json(405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Use POST para enviar o aviso." }, { Allow: "POST" });
  }
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) return json(413, { ok: false, code: "PAYLOAD_TOO_LARGE", message: "O aviso excedeu o limite permitido." });
    const authorization = text(request.headers.get("authorization"), 5000);
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return json(401, { ok: false, code: "MISSING_SESSION", message: "Sessão do GRCON não informada." });
    const payload = normalizePayload(await readJsonBody(request), env);
    const flowUrl = text(env.POWER_AUTOMATE_EGRDT_WEBHOOK_URL, 4000);
    if (!flowUrl) return json(503, { ok: false, code: "POWER_AUTOMATE_NOT_CONFIGURED", message: "O fluxo do Power Automate ainda não foi conectado ao GRCON." });
    if (!isAllowedFlowUrl(flowUrl)) return json(500, { ok: false, code: "INVALID_FLOW_URL", message: "A URL configurada para o Power Automate não é válida." });
    payload.requester = await verifyUserAndMembership(match[1], payload.source.workspaceId, env);
    const flowResponse = await fetch(flowUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": payload.eventId, "User-Agent": "GRCON-eGRDT-Teams/1.0" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(FLOW_TIMEOUT_MS),
    });
    if (!flowResponse.ok) {
      const diagnostic = text(await flowResponse.text().catch(() => ""), 300);
      console.error("Power Automate recusou o aviso", flowResponse.status, diagnostic);
      return json(502, { ok: false, code: "FLOW_REJECTED", message: "O fluxo do Power Automate recusou o aviso. Tente novamente ou confira o fluxo." });
    }
    return json(200, { ok: true, eventId: payload.eventId, destination: payload.destination.name, notifiedAt: new Date().toISOString() });
  } catch (error) {
    const status = Number(error && error.status) || (error && (error.name === "AbortError" || error.name === "TimeoutError") ? 504 : 400);
    const code = text(error && error.code, 80) || (status === 504 ? "FLOW_TIMEOUT" : "INVALID_REQUEST");
    console.error("Falha ao enviar aviso de eGRDT", code, error && error.message);
    return json(status, {
      ok: false,
      code,
      message: status >= 500 ? "Não foi possível concluir o aviso ao Teams agora." : text(error && error.message, 300) || "Aviso inválido.",
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === API_PATH) return handleTeamsNotification(request, env);
    if (url.pathname.startsWith("/api/")) return json(404, { ok: false, code: "NOT_FOUND", message: "Endpoint não encontrado." });
    return env.ASSETS.fetch(request);
  },
};

export const _internal = Object.freeze({
  isAllowedFlowUrl,
  normalizePayload,
  verifyUserAndMembership,
  escapeHtml,
  buildTableHtml,
  buildAdaptiveCard,
  buildFallbackText,
  resolveMascotUrl,
  handleTeamsNotification,
  ADAPTIVE_CARD_VERSION,
  MASCOT_ASSET_PATH,
  DEFAULT_MASCOT_PUBLIC_URL,
});
