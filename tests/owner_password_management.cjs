"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const cloudPath = path.join(root, "grcon_cloud_app.js");
const edgePath = path.join(root, "supabase", "functions", "owner-change-user-password", "index.ts");

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

assert.match(cloud, /membership\.active && \["admin", "operator"\]\.includes\(membership\.role\)/,
  "ação visual deve existir somente para alvo admin/operator ativo");
assert.match(cloud, /data-member-password=/, "linha do usuário deve ter ação Alterar senha para owner");
assert.match(cloud, /if \(!canManageMembers\(\) \|\| !target \|\| !\["admin", "operator"\]\.includes\(target\.role\)\) return;/,
  "abertura do modal deve repetir a checagem de owner e papel do alvo");
assert.match(cloud, /functions\.invoke\("owner-change-user-password"/, "frontend deve usar Edge Function");
assert.match(cloud, /targetUserId:\s*target\.userId/, "frontend deve enviar targetUserId");
assert.match(cloud, /workspaceId:\s*state\.membership\.workspace_id/, "workspace deve ser enviado apenas como identificador validável");
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
assert.match(edge, /actorMembership\.role !== "owner"/, "backend deve exigir owner independentemente do frontend");
assert.match(edge, /memberships\.find\(\(membership\) => membership\.workspace_id === workspaceId\)/,
  "alvo deve pertencer ao mesmo workspace");
assert.match(edge, /memberships\.some\(\(membership\) => membership\.role === "owner"\)/,
  "contas owner devem ser bloqueadas como alvo, inclusive em outro workspace");
assert.match(edge, /!\["admin", "operator"\]\.includes/, "somente admin/operator podem ser alvo");
assert.match(edge, /auth\.admin\.updateUserById\(targetUserId, \{\s*password: newPassword,/s,
  "alteração deve usar Auth Admin API oficial");
assert.match(edge, /action:\s*"user_password_changed"/, "ação deve ser auditada");
assert.match(edge, /targetEmail,[\s\S]*source:\s*"admin-users"/, "auditoria deve registrar somente metadados seguros");
assert.doesNotMatch(edge, /metadata:\s*\{[^}]*password/is, "auditoria nunca pode conter senha");
assert.doesNotMatch(edge, /console\.(log|error|warn|debug)/, "Edge Function não deve registrar payloads em console");
assert.match(edge, /Cache-Control": "no-store"/, "resposta sensível não deve ser armazenada em cache");

console.log("owner_password_management: ok");
