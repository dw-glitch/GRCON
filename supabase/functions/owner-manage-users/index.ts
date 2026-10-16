import { createClient } from "npm:@supabase/supabase-js@2.117.2";

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
const ROLES = new Set(["owner", "admin", "operator", "viewer"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function response(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}
function clean(value: unknown) { return String(value ?? "").trim(); }
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
function temporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const body = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
  return `Grc!${body}9a`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return response(405, { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." });

  const authorization = req.headers.get("Authorization") || "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch?.[1]) return response(401, { code: "SESSION_EXPIRED", message: "Sua sessão expirou. Entre novamente." });

  let body: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    return response(400, { code: "INVALID_REQUEST", message: "Solicitação inválida." });
  }

  const operation = clean(body.operation || "list").toLowerCase();
  const workspaceId = clean(body.workspaceId);
  if (!UUID_RE.test(workspaceId)) return response(400, { code: "INVALID_WORKSPACE", message: "Contrato inválido." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const adminKey = secretKey() || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !adminKey) return response(500, { code: "SERVER_CONFIGURATION", message: "Administração indisponível agora." });

  const admin = createClient(supabaseUrl, adminKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: actorAuth, error: actorAuthError } = await admin.auth.getUser(tokenMatch[1]);
  const actorId = actorAuth?.user?.id || "";
  if (actorAuthError || !actorId) return response(401, { code: "SESSION_EXPIRED", message: "Sua sessão expirou. Entre novamente." });

  // Verify the live database capability with the caller's JWT, never user_metadata.
  const caller = createClient(supabaseUrl, adminKey, {
    global: { headers: { Authorization: `Bearer ${tokenMatch[1]}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: masterOwner, error: masterError } = await caller.rpc("grcon_is_master_owner");
  if (masterError) return response(503, { code: "AUTHORIZATION_CHECK_FAILED", message: "Não foi possível validar sua permissão." });
  if (masterOwner !== true) return response(403, { code: "MASTER_OWNER_REQUIRED", message: "Acesso restrito ao proprietário master." });

  const { data: contract, error: contractError } = await admin
    .from("grcon_contracts")
    .select("id, code, display_name, active")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (contractError || !contract) return response(400, { code: "INVALID_CONTRACT", message: "Contrato não encontrado." });

  if (operation === "list") {
    const { data: memberships, error: membershipError } = await admin
      .from("grcon_memberships")
      .select("user_id, role, active, joined_at")
      .eq("workspace_id", workspaceId)
      .order("joined_at");
    if (membershipError) return response(500, { code: "LIST_FAILED", message: "Não foi possível carregar os usuários." });

    const ids = (memberships || []).map((item) => item.user_id);
    const { data: profiles, error: profileError } = ids.length
      ? await admin.from("grcon_profiles").select("id,email,display_name").in("id", ids)
      : { data: [], error: null };
    if (profileError) return response(500, { code: "LIST_FAILED", message: "Não foi possível carregar os perfis." });

    const authById = new Map<string, { lastSignInAt: string | null }>();
    let page = 1;
    while (page <= 20) {
      const listed = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (listed.error) break;
      for (const user of listed.data.users || []) {
        if (ids.includes(user.id)) authById.set(user.id, { lastSignInAt: user.last_sign_in_at || null });
      }
      if ((listed.data.users || []).length < 1000) break;
      page += 1;
    }
    const profileMap = new Map((profiles || []).map((item) => [item.id, item]));
    return response(200, {
      ok: true,
      contract,
      users: (memberships || []).map((membership) => {
        const profile = profileMap.get(membership.user_id) || {};
        return {
          id: membership.user_id,
          name: profile.display_name || "",
          email: profile.email || "",
          role: membership.role,
          isMaster: membership.user_id === actorId,
          active: membership.active,
          joinedAt: membership.joined_at,
          lastSignInAt: authById.get(membership.user_id)?.lastSignInAt || null,
        };
      }),
    });
  }

  if (operation === "create") {
    if (!contract.active) return response(400, { code: "INACTIVE_CONTRACT", message: "Ative o contrato antes de criar usuários." });
    const email = clean(body.email).toLowerCase();
    const name = clean(body.name);
    const role = clean(body.role || "operator").toLowerCase();
    const active = body.active !== false;
    if (!EMAIL_RE.test(email) || !name || name.length > 160 || !ROLES.has(role)) {
      return response(400, { code: "INVALID_USER", message: "Nome, e-mail e perfil válidos são obrigatórios." });
    }

    const password = temporaryPassword();
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, display_name: name },
    });
    if (created.error || !created.data.user) {
      const code = String(created.error?.code || "").toLowerCase();
      if (code.includes("email_exists") || code.includes("user_already_exists")) {
        return response(409, { code: "USER_EXISTS", message: "Já existe uma conta com este e-mail. Use a edição/vínculo em vez de criar novamente." });
      }
      return response(502, { code: "AUTH_CREATE_FAILED", message: created.error?.message || "Não foi possível criar a conta." });
    }

    const userId = created.data.user.id;
    const saved = await caller.rpc("grcon_master_save_user", {
      target_workspace: workspaceId, target_user: userId, user_name: name,
      target_role: role, is_active: active, creating: true,
    });
    if (saved.error) {
      await admin.auth.admin.deleteUser(userId);
      return response(500, { code: "MEMBERSHIP_CREATE_FAILED", message: "A conta não foi mantida porque o vínculo ao contrato falhou." });
    }

    return response(201, {
      ok: true,
      user: { id: userId, name, email, role, active },
      temporaryPassword: password,
      message: "Usuário criado. A senha temporária é exibida somente nesta resposta.",
    });
  }

  if (operation === "update") {
    const targetUserId = clean(body.userId);
    const role = clean(body.role).toLowerCase();
    const active = body.active !== false;
    const name = clean(body.name);
    if (!UUID_RE.test(targetUserId) || !ROLES.has(role) || !name || name.length > 160) {
      return response(400, { code: "INVALID_USER", message: "Usuário, nome e perfil válidos são obrigatórios." });
    }
    if (targetUserId === actorId && !active) {
      return response(400, { code: "SELF_DISABLE", message: "Você não pode desativar seu próprio acesso." });
    }

    // The master account cannot be edited or downgraded through any admin route.
    if (targetUserId === actorId) return response(403, { code: "MASTER_OWNER_PROTECTED", message: "Esta conta é protegida." });
    const saved = await caller.rpc("grcon_master_save_user", {
      target_workspace: workspaceId, target_user: targetUserId, user_name: name,
      target_role: role, is_active: active, creating: false,
    });
    if (saved.error) return response(400, { code: "USER_UPDATE_FAILED", message: saved.error.message || "Não foi possível atualizar o acesso." });
    return response(200, { ok: true });
  }

  return response(400, { code: "UNKNOWN_OPERATION", message: "Operação de usuário desconhecida." });
});
