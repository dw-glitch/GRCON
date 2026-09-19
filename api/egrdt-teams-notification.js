"use strict";

const DEFAULT_SUPABASE_URL = "https://kvyrttccwzdhasplfxnr.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_K-6GJbXO-MJMWp9Re5lMmg_l1riCpP-";
const MAX_BODY_BYTES = 64000;
const FLOW_TIMEOUT_MS = 15000;
const ADAPTIVE_CARD_VERSION = "1.2";
const MASCOT_ASSET_PATH = "/assets/mascot/grcon-mascot-teams-thumbsup.png";
const DEFAULT_MASCOT_PUBLIC_URL = "https://raw.githubusercontent.com/dw-glitch/GRCON/90880fac67426e690602803cc712c15e69bbdf2c/assets/mascot/grcon-mascot-teams-thumbsup.png";

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function text(value, max = 500) { return String(value === null || value === undefined ? "" : value).trim().slice(0, max); }

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

function resolveMascotUrl() {
  const candidate = text(process.env.GRCON_TEAMS_MASCOT_URL, 1200) || DEFAULT_MASCOT_PUBLIC_URL;
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
    `👥 ${payload.destination.name}`,
    "Favor realizar a postagem no SIGEM.",
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
      {
        type: "TextBlock",
        text: `${item.document} · Rev. ${item.revision || "—"}`,
        weight: "Bolder",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: item.discipline || "Não informada",
        isSubtle: true,
        size: "Small",
        spacing: "None",
        wrap: true,
      },
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
            items: [{
              type: "Image",
              url: imageUrl,
              size: "Medium",
              altText: "Mascote GRCON dando joia",
              horizontalAlignment: "Center",
            }],
          },
          {
            type: "Column",
            width: "stretch",
            verticalContentAlignment: "Center",
            items: [
              {
                type: "TextBlock",
                text: "✅ eGRDT pronta para postagem",
                weight: "Bolder",
                size: "Medium",
                wrap: true,
              },
              {
                type: "TextBlock",
                text: payload.egrdt.number,
                weight: "Bolder",
                spacing: "Small",
                wrap: true,
              },
              {
                type: "TextBlock",
                text: "Pronta para postagem no SIGEM",
                isSubtle: true,
                spacing: "None",
                wrap: true,
              },
            ],
          },
        ],
      },
      {
        type: "TextBlock",
        text: "Revisões enviadas na GRDT",
        weight: "Bolder",
        spacing: "Medium",
        separator: true,
        wrap: true,
      },
      ...revisionBlocks,
      {
        type: "Container",
        spacing: "Medium",
        separator: true,
        items: [
          {
            type: "TextBlock",
            text: `👥 ${payload.destination.name}`,
            weight: "Bolder",
            wrap: true,
          },
          {
            type: "TextBlock",
            text: "Favor realizar a postagem no SIGEM.",
            spacing: "Small",
            wrap: true,
          },
        ],
      },
      {
        type: "TextBlock",
        text: "Enviado pelo GRCON",
        isSubtle: true,
        size: "Small",
        spacing: "Medium",
        wrap: true,
      },
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

function normalizePayload(input) {
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
  const mascotUrl = resolveMascotUrl();
  normalized.message.mascot = {
    url: mascotUrl,
    altText: "Mascote GRCON dando joia",
    format: "image/png",
    sourcePath: MASCOT_ASSET_PATH,
  };
  normalized.message.fallbackText = buildFallbackText(normalized);
  normalized.message.adaptiveCard = buildAdaptiveCard(normalized, mascotUrl);
  return normalized;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    if (Buffer.byteLength(req.body, "utf8") > MAX_BODY_BYTES) throw Object.assign(new Error("Aviso muito grande."), { status: 413 });
    return JSON.parse(req.body || "{}");
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) throw Object.assign(new Error("Aviso muito grande."), { status: 413 });
  }
  return JSON.parse(raw || "{}");
}

async function verifyUserAndMembership(accessToken, workspaceId, fetchImpl) {
  const supabaseUrl = String(process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, "");
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY;
  const headers = { Authorization: `Bearer ${accessToken}`, apikey: supabaseKey, Accept: "application/json" };
  const userResponse = await fetchImpl(`${supabaseUrl}/auth/v1/user`, { headers, signal: AbortSignal.timeout(10000) });
  if (!userResponse.ok) throw Object.assign(new Error("Sessão inválida ou expirada."), { status: 401, code: "INVALID_SESSION" });
  const user = await userResponse.json();
  if (!user || !user.id) throw Object.assign(new Error("Usuário não identificado."), { status: 401, code: "INVALID_SESSION" });
  const query = new URL(`${supabaseUrl}/rest/v1/grcon_memberships`);
  query.searchParams.set("select", "workspace_id,role,active");
  query.searchParams.set("user_id", `eq.${user.id}`);
  query.searchParams.set("workspace_id", `eq.${workspaceId}`);
  query.searchParams.set("active", "eq.true");
  query.searchParams.set("limit", "1");
  const membershipResponse = await fetchImpl(query, { headers, signal: AbortSignal.timeout(10000) });
  const rows = membershipResponse.ok ? await membershipResponse.json() : [];
  if (!Array.isArray(rows) || !rows.length || !["owner", "admin", "operator"].includes(rows[0].role)) {
    throw Object.assign(new Error("Seu perfil não tem permissão para avisar a postagem desta eGRDT."), { status: 403, code: "NOT_ALLOWED" });
  }
  return { id: user.id, email: text(user.email, 200), role: rows[0].role };
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Use POST para enviar o aviso." });
  }
  try {
    const contentLength = Number(req.headers["content-length"] || 0);
    if (contentLength > MAX_BODY_BYTES) return send(res, 413, { ok: false, code: "PAYLOAD_TOO_LARGE", message: "O aviso excedeu o limite permitido." });
    const authorization = text(req.headers.authorization, 5000);
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return send(res, 401, { ok: false, code: "MISSING_SESSION", message: "Sessão do GRCON não informada." });
    const payload = normalizePayload(await readBody(req));
    const flowUrl = process.env.POWER_AUTOMATE_EGRDT_WEBHOOK_URL || "";
    if (!flowUrl) return send(res, 503, { ok: false, code: "POWER_AUTOMATE_NOT_CONFIGURED", message: "O fluxo do Power Automate ainda não foi conectado ao GRCON." });
    if (!isAllowedFlowUrl(flowUrl)) return send(res, 500, { ok: false, code: "INVALID_FLOW_URL", message: "A URL configurada para o Power Automate não é válida." });
    const requester = await verifyUserAndMembership(match[1], payload.source.workspaceId, fetch);
    payload.requester = requester;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FLOW_TIMEOUT_MS);
    let flowResponse;
    try {
      flowResponse = await fetch(flowUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": payload.eventId, "User-Agent": "GRCON-eGRDT-Teams/1.0" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!flowResponse.ok) {
      const diagnostic = text(await flowResponse.text().catch(() => ""), 300);
      console.error("Power Automate recusou o aviso", flowResponse.status, diagnostic);
      return send(res, 502, { ok: false, code: "FLOW_REJECTED", message: "O fluxo do Power Automate recusou o aviso. Tente novamente ou confira o fluxo." });
    }
    return send(res, 200, { ok: true, eventId: payload.eventId, destination: payload.destination.name, notifiedAt: new Date().toISOString() });
  } catch (error) {
    const status = Number(error && error.status) || (error && error.name === "AbortError" ? 504 : 400);
    const code = text(error && error.code, 80) || (status === 504 ? "FLOW_TIMEOUT" : "INVALID_REQUEST");
    console.error("Falha ao enviar aviso de eGRDT", code, error && error.message);
    return send(res, status, { ok: false, code, message: status >= 500 ? "Não foi possível concluir o aviso ao Teams agora." : text(error && error.message, 300) || "Aviso inválido." });
  }
}

module.exports = handler;
module.exports._internal = { isAllowedFlowUrl, normalizePayload, verifyUserAndMembership, readBody, escapeHtml, buildTableHtml, buildAdaptiveCard, buildFallbackText, resolveMascotUrl, ADAPTIVE_CARD_VERSION, MASCOT_ASSET_PATH, DEFAULT_MASCOT_PUBLIC_URL };
