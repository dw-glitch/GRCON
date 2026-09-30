"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const cloudPath = path.join(root, "grcon_cloud_app.js");
const edgePath = path.join(root, "supabase", "functions", "owner-change-user-password", "index.ts");
const policyPath = path.join(root, "supabase", "functions", "owner-change-user-password", "policy.mjs");

const cloud = fs.readFileSync(cloudPath, "utf8");
const edge = fs.readFileSync(edgePath, "utf8");

function instrumentCloud(source) {
  const marker = /\n  init\(\);\n\}\)\(\);\s*$/;
  assert.match(source, marker, "grcon_cloud_app.js precisa manter o init final esperado pelo teste");
  return source.replace(marker, `
  window.__ownerPasswordTest = { passwordProblem, adminPasswordFormProblem, canManageMembers, state };
})();
`);
}

(async () => {
  const context = {
    window: {
      GRCON_CLOUD_CONFIG: {},
      GrconHistory: null,
    },
    navigator: { onLine: true },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(instrumentCloud(cloud), context, { filename: "grcon_cloud_app.js" });

  const api = context.window.__ownerPasswordTest;
  assert.ok(api, "hook isolado de teste não foi injetado");

  api.state.membership = { role: "owner" };
  assert.equal(api.canManageMembers(), true, "owner deve poder gerenciar usuários");
  api.state.membership = { role: "admin" };
  assert.equal(api.canManageMembers(), false, "admin não pode gerenciar senhas");
  api.state.membership = { role: "operator" };
  assert.equal(api.canManageMembers(), false, "operator não pode gerenciar senhas");
  api.state.membership = null;
  assert.equal(api.canManageMembers(), false, "não autenticado/sem membership não pode gerenciar senhas");

  assert.match(api.passwordProblem("Curta1!"), /12 caracteres/, "senha curta deve ser bloqueada");
  assert.match(api.passwordProblem("senhafraca123!"), /maiúscula/, "senha sem maiúscula deve ser bloqueada");
  assert.match(api.passwordProblem("SENHAFRACA123!"), /minúscula/, "senha sem minúscula deve ser bloqueada");
  assert.match(api.passwordProblem("SenhaSemNumero!"), /número/, "senha sem número deve ser bloqueada");
  assert.match(api.passwordProblem("NovaSenha1234"), /símbolo/, "senha sem símbolo deve ser bloqueada");
  assert.equal(api.passwordProblem("NovaSenha123!"), "", "senha forte deve ser aceita");
  assert.equal(
    api.adminPasswordFormProblem("NovaSenha123!", "OutraSenha123!"),
    "As senhas informadas não coincidem.",
    "senhas diferentes devem ser bloqueadas"
  );
  assert.equal(api.adminPasswordFormProblem("NovaSenha123!", "NovaSenha123!"), "", "senhas válidas e iguais devem passar");

  const policy = await import(pathToFileURL(policyPath).href + "?qa=" + Date.now());
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const otherWorkspaceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const ownerMembership = { workspace_id: workspaceId, role: "owner", active: true };
  const adminMembership = { workspace_id: workspaceId, role: "admin", active: true };
  const operatorMembership = { workspace_id: workspaceId, role: "operator", active: true };
  const viewerMembership = { workspace_id: workspaceId, role: "viewer", active: true };

  const allowedAdmin = policy.authorizePasswordChange({
    authenticated: true,
    actorMembership: ownerMembership,
    targetExists: true,
    targetMemberships: [adminMembership],
    workspaceId,
  });
  assert.equal(allowedAdmin.ok, true, "owner deve ser autorizado para alvo admin");

  const allowedOperator = policy.authorizePasswordChange({
    authenticated: true,
    actorMembership: ownerMembership,
    targetExists: true,
    targetMemberships: [operatorMembership],
    workspaceId,
  });
  assert.equal(allowedOperator.ok, true, "owner deve ser autorizado para alvo operator");

  for (const role of ["admin", "operator"]) {
    const denied = policy.authorizePasswordChange({
      authenticated: true,
      actorMembership: { workspace_id: workspaceId, role, active: true },
      targetExists: true,
      targetMemberships: [operatorMembership],
      workspaceId,
    });
    assert.equal(denied.ok, false, role + " não pode alterar senha");
    assert.equal(denied.status, 403);
    assert.equal(denied.code, "OWNER_REQUIRED");
  }

  const unauthenticated = policy.authorizePasswordChange({
    authenticated: false,
    actorMembership: null,
    targetExists: true,
    targetMemberships: [operatorMembership],
    workspaceId,
  });
  assert.equal(unauthenticated.status, 401, "não autenticado deve receber 401");
  assert.equal(unauthenticated.code, "SESSION_EXPIRED");

  const outsideWorkspace = policy.authorizePasswordChange({
    authenticated: true,
    actorMembership: ownerMembership,
    targetExists: true,
    targetMemberships: [{ workspace_id: otherWorkspaceId, role: "operator", active: true }],
    workspaceId,
  });
  assert.equal(outsideWorkspace.status, 403, "usuário fora do workspace deve ser bloqueado");
  assert.equal(outsideWorkspace.code, "TARGET_OUTSIDE_WORKSPACE");

  const targetOwner = policy.authorizePasswordChange({
    authenticated: true,
    actorMembership: ownerMembership,
    targetExists: true,
    targetMemberships: [
      operatorMembership,
      { workspace_id: otherWorkspaceId, role: "owner", active: true },
    ],
    workspaceId,
  });
  assert.equal(targetOwner.status, 403, "conta owner em qualquer workspace deve ser protegida");
  assert.equal(targetOwner.code, "TARGET_OWNER_FORBIDDEN");

  const targetViewer = policy.authorizePasswordChange({
    authenticated: true,
    actorMembership: ownerMembership,
    targetExists: true,
    targetMemberships: [viewerMembership],
    workspaceId,
  });
  assert.equal(targetViewer.status, 403, "viewer não faz parte dos alvos permitidos");
  assert.equal(targetViewer.code, "TARGET_ROLE_FORBIDDEN");

  const missingTarget = policy.authorizePasswordChange({
    authenticated: true,
    actorMembership: ownerMembership,
    targetExists: false,
    targetMemberships: [],
    workspaceId,
  });
  assert.equal(missingTarget.status, 404);
  assert.equal(missingTarget.code, "USER_NOT_FOUND");

  assert.match(policy.passwordProblem("Curta1!"), /12 caracteres/);
  assert.equal(policy.passwordProblem("NovaSenha123!"), "", "backend deve aceitar senha forte");

  assert.match(cloud, /membership\.active && \["admin", "operator"\]\.includes\(membership\.role\)/,
    "ação visual deve existir somente para alvo admin/operator ativo");
  assert.match(cloud, /data-member-password=/, "linha do usuário deve ter ação Alterar senha para owner");
  assert.match(cloud, /functions\.invoke\("owner-change-user-password"/, "frontend deve usar Edge Function");
  assert.match(cloud, /targetUserId:\s*target\.userId/, "frontend deve enviar targetUserId");
  assert.match(cloud, /workspaceId:\s*state\.membership\.workspace_id/, "workspace deve ser identificado pelo contexto atual");
  assert.match(cloud, /newPassword:\s*pendingAdminPassword/, "senha deve existir somente na chamada em memória");
  assert.match(cloud, /autocomplete="new-password"/g, "campos administrativos devem usar autocomplete new-password");
  assert.match(cloud, /aria-modal="true"/, "modal deve ser acessível");
  assert.match(cloud, /event\.key === "Escape"/, "ESC deve fechar o modal quando seguro");
  assert.match(cloud, /event\.key !== "Tab"/, "modal deve prender o foco com Tab");

  const passwordLogLines = cloud.split(/\r?\n/).filter((line) => /console\.(log|error|warn|debug)/.test(line) && /(password|senha|pendingAdminPassword|newPassword)/i.test(line));
  assert.deepEqual(passwordLogLines, [], "frontend não pode escrever senha em console");

  assert.match(edge, /Deno\.env\.get\("SUPABASE_SECRET_KEYS"\)/, "backend deve usar segredo server-side moderno");
  assert.doesNotMatch(edge, /SUPABASE_SERVICE_ROLE_KEY/, "nova função não deve depender da chave administrativa legada");
  assert.match(edge, /admin\.auth\.getUser\(tokenMatch\[1\]\)/, "JWT deve ser validado no servidor");
  assert.match(edge, /\.eq\("workspace_id", workspaceId\)[\s\S]*\.eq\("user_id", actorId\)[\s\S]*\.eq\("active", true\)/,
    "membership do ator deve ser consultada no banco");
  assert.match(edge, /authorizeActor\(/, "autorização do ator deve ocorrer no backend");
  assert.match(edge, /authorizeTarget\(/, "autorização do alvo deve ocorrer no backend");
  assert.match(edge, /auth\.admin\.updateUserById\(targetUserId, \{\s*password: newPassword,/s,
    "alteração deve usar Auth Admin API oficial");
  assert.match(edge, /action:\s*"user_password_changed"/, "ação deve ser auditada");
  assert.match(edge, /targetEmail,[\s\S]*source:\s*"admin-users"/, "auditoria deve registrar somente metadados seguros");
  assert.doesNotMatch(edge, /metadata:\s*\{[^}]*password/is, "auditoria nunca pode conter senha");
  assert.doesNotMatch(edge, /console\.(log|error|warn|debug)/, "Edge Function não deve registrar payloads em console");
  assert.match(edge, /Cache-Control": "no-store"/, "resposta sensível não deve ser armazenada em cache");

  console.log("owner_password_management: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
