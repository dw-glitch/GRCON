export function passwordProblem(password) {
  const value = String(password || "");
  if (value.length < 12) return "Use pelo menos 12 caracteres.";
  if (!/[a-z]/.test(value)) return "Inclua pelo menos uma letra minúscula.";
  if (!/[A-Z]/.test(value)) return "Inclua pelo menos uma letra maiúscula.";
  if (!/\d/.test(value)) return "Inclua pelo menos um número.";
  if (!/[^A-Za-z0-9]/.test(value)) return "Inclua pelo menos um símbolo.";
  return "";
}

export function authorizeActor(input) {
  const workspaceId = String(input?.workspaceId || "");
  if (!input?.authenticated) {
    return { ok: false, status: 401, code: "SESSION_EXPIRED", message: "Sua sessão expirou. Entre novamente." };
  }

  const actorMembership = input?.actorMembership || null;
  if (!actorMembership || actorMembership.active !== true || actorMembership.workspace_id !== workspaceId || actorMembership.role !== "owner") {
    return { ok: false, status: 403, code: "OWNER_REQUIRED", message: "Somente o proprietário pode alterar senhas de usuários." };
  }

  return { ok: true, status: 200 };
}

export function authorizeTarget(input) {
  const workspaceId = String(input?.workspaceId || "");
  if (!input?.targetExists) {
    return { ok: false, status: 404, code: "USER_NOT_FOUND", message: "Usuário não encontrado." };
  }

  const targetMemberships = Array.isArray(input?.targetMemberships) ? input.targetMemberships : [];
  const activeMemberships = targetMemberships.filter((membership) => membership?.active === true);
  const workspaceMembership = activeMemberships.find((membership) => membership.workspace_id === workspaceId);

  if (!workspaceMembership) {
    return { ok: false, status: 403, code: "TARGET_OUTSIDE_WORKSPACE", message: "Usuário não pertence a este workspace." };
  }

  if (activeMemberships.some((membership) => membership.role === "owner")) {
    return {
      ok: false,
      status: 403,
      code: "TARGET_OWNER_FORBIDDEN",
      message: "A senha de outro proprietário não pode ser alterada por esta função.",
    };
  }

  if (!["admin", "operator"].includes(String(workspaceMembership.role || ""))) {
    return {
      ok: false,
      status: 403,
      code: "TARGET_ROLE_FORBIDDEN",
      message: "Somente usuários administradores ou operadores podem ter a senha alterada por esta ação.",
    };
  }

  return { ok: true, status: 200, workspaceMembership };
}

export function authorizePasswordChange(input) {
  const actor = authorizeActor(input);
  if (!actor.ok) return actor;
  return authorizeTarget(input);
}
