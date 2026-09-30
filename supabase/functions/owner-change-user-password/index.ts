import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { authorizeActor, authorizeTarget, passwordProblem } from "./policy.mjs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

function response(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function secretKey() {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS") || "";
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (parsed.default) return parsed.default;
    return Object.values(parsed).find(Boolean) || "";
  } catch {
    return "";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return response(405, { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." });
  }

  const authorization = req.headers.get("Authorization") || "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch?.[1]) {
    return response(401, { code: "SESSION_EXPIRED", message: "Sua sessão expirou. Entre novamente." });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return response(400, { code: "INVALID_REQUEST", message: "Solicitação inválida." });
  }

  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const targetUserId = String(input.targetUserId || "").trim();
  const workspaceId = String(input.workspaceId || "").trim();
  const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";

  if (!validUuid(targetUserId)) {
    return response(404, { code: "USER_NOT_FOUND", message: "Usuário não encontrado." });
  }
  if (!validUuid(workspaceId)) {
    return response(400, { code: "INVALID_WORKSPACE", message: "Workspace inválido." });
  }

  const weakPassword = passwordProblem(newPassword);
  if (weakPassword) {
    return response(400, { code: "WEAK_PASSWORD", message: weakPassword });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const adminKey = secretKey();
  if (!supabaseUrl || !adminKey) {
    return response(500, { code: "SERVER_CONFIGURATION", message: "Não foi possível concluir a alteração agora." });
  }

  const admin = createClient(supabaseUrl, adminKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data: actorAuth, error: actorAuthError } = await admin.auth.getUser(tokenMatch[1]);
  const actorId = actorAuth?.user?.id || "";
  if (actorAuthError || !actorId) {
    return response(401, { code: "SESSION_EXPIRED", message: "Sua sessão expirou. Entre novamente." });
  }

  const { data: actorMembership, error: actorMembershipError } = await admin
    .from("grcon_memberships")
    .select("workspace_id, role, active")
    .eq("workspace_id", workspaceId)
    .eq("user_id", actorId)
    .eq("active", true)
    .maybeSingle();

  if (actorMembershipError) {
    return response(500, { code: "AUTHORIZATION_CHECK_FAILED", message: "Não foi possível validar sua permissão agora." });
  }

  const actorAuthorization = authorizeActor({
    authenticated: true,
    actorMembership,
    workspaceId,
  });
  if (!actorAuthorization.ok) {
    return response(actorAuthorization.status, {
      code: actorAuthorization.code,
      message: actorAuthorization.message,
    });
  }

  const { data: targetAuth, error: targetAuthError } = await admin.auth.admin.getUserById(targetUserId);
  if (targetAuthError || !targetAuth?.user) {
    return response(404, { code: "USER_NOT_FOUND", message: "Usuário não encontrado." });
  }

  const { data: targetMemberships, error: targetMembershipsError } = await admin
    .from("grcon_memberships")
    .select("workspace_id, role, active")
    .eq("user_id", targetUserId)
    .eq("active", true);

  if (targetMembershipsError) {
    return response(500, { code: "TARGET_CHECK_FAILED", message: "Não foi possível validar o usuário agora." });
  }

  const authorizationResult = authorizeTarget({
    targetExists: true,
    targetMemberships: Array.isArray(targetMemberships) ? targetMemberships : [],
    workspaceId,
  });
  if (!authorizationResult.ok) {
    return response(authorizationResult.status, {
      code: authorizationResult.code,
      message: authorizationResult.message,
    });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, {
    password: newPassword,
  });

  if (updateError) {
    const code = String(updateError.code || "").toLowerCase();
    if (code.includes("weak_password")) {
      return response(400, { code: "WEAK_PASSWORD", message: "A senha não atende aos requisitos de segurança do projeto." });
    }
    return response(502, { code: "AUTH_UPDATE_FAILED", message: "Não foi possível alterar a senha agora." });
  }

  const targetEmail = String(targetAuth.user.email || "").trim().toLowerCase();
  const { error: auditError } = await admin.from("grcon_audit_events").insert({
    workspace_id: workspaceId,
    actor_id: actorId,
    action: "user_password_changed",
    entity_type: "auth_user",
    entity_id: targetUserId,
    metadata: {
      targetEmail,
      source: "admin-users",
    },
  });

  if (auditError) {
    return response(500, {
      code: "AUDIT_FAILED",
      message: "A senha foi alterada, mas o registro de auditoria não pôde ser concluído. Não repita a ação sem verificar o suporte.",
    });
  }

  return response(200, { ok: true });
});
