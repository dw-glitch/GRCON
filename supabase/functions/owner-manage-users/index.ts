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
const ROLES = new Set(["admin", "operator", "viewer"]);
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

  const { data: actorMemberships, error: actorMembershipError } = await admin
    .from("grcon_memberships")
    .select("workspace_id, role, active")
    .eq("user_id", actorId)
    .eq("active", true);
  if (actorMembershipError) return response(500, { code: "AUTHORIZATION_CHECK_FAILED", message: "Não foi possível validar sua permissão." });

  const activeMemberships = Array.isArray(actorMemberships) ? actorMemberships : [];
  const globalOwner = activeMemberships.some((item) => item.role === "owner");
  const canManage = globalOwner;
  if (!canManage) return response(403, { code: "FORBIDDEN", message: "Acesso restrito ao proprietário." });

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
          active: membership.active,
          joinedAt: membership.joined_at,
          lastSignInAt: authById.get(membership.user_id)?.lastSignInAt || null,
        };
      }),
    });
  }

  if (operation === "create") {
    if (!globalOwner) return response(403, { code: "OWNER_REQUIRED", message: "Somente o proprietário pode criar contas." });
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
    const profile = await admin.from("grcon_profiles").upsert({
      id: userId,
      email,
      display_name: name,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (profile.error) {
      await admin.auth.admin.deleteUser(userId);
      return response(500, { code: "PROFILE_CREATE_FAILED", message: "A conta não foi mantida porque o perfil não pôde ser criado." });
    }

    const membership = await admin.from("grcon_memberships").upsert({
      workspace_id: workspaceId,
      user_id: userId,
      role,
      active,
      invited_by: actorId,
    }, { onConflict: "workspace_id,user_id" });
    if (membership.error) {
      await admin.auth.admin.deleteUser(userId);
      return response(500, { code: "MEMBERSHIP_CREATE_FAILED", message: "A conta não foi mantida porque o vínculo ao contrato falhou." });
    }

    await admin.from("grcon_audit_events").insert({
      workspace_id: workspaceId,
      actor_id: actorId,
      action: "user_created",
      entity_type: "auth_user",
      entity_id: userId,
      metadata: { email, role, contract: contract.code, active },
    });

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

    const { data: targetMembership, error: targetError } = await admin
      .from("grcon_memberships")
      .select("user_id, role, active")
      .eq("workspace_id", workspaceId)
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (targetError || !targetMembership) return response(404, { code: "USER_NOT_FOUND", message: "Usuário não encontrado neste contrato." });
    if (targetMembership.role === "owner") return response(403, { code: "OWNER_PROTECTED", message: "O proprietário global não pode ser rebaixado por esta tela." });

    const profileUpdate = await admin.from("grcon_profiles").update({
      display_name: name,
      updated_at: new Date().toISOString(),
    }).eq("id", targetUserId);
    if (profileUpdate.error) return response(500, { code: "PROFILE_UPDATE_FAILED", message: "Não foi possível atualizar o perfil." });

    const membershipUpdate = await admin.from("grcon_memberships").update({ role, active })
      .eq("workspace_id", workspaceId).eq("user_id", targetUserId);
    if (membershipUpdate.error) return response(500, { code: "MEMBERSHIP_UPDATE_FAILED", message: "Não foi possível atualizar o acesso." });

    await admin.from("grcon_audit_events").insert({
      workspace_id: workspaceId,
      actor_id: actorId,
      action: "user_updated",
      entity_type: "auth_user",
      entity_id: targetUserId,
      metadata: { role, active, contract: contract.code },
    });
    return response(200, { ok: true });
  }

  return response(400, { code: "UNKNOWN_OPERATION", message: "Operação de usuário desconhecida." });
});
