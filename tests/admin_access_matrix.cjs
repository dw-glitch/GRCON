"use strict";
// A tabela "Quem pode o quê" da Administração não pode divergir das regras que o GRCON aplica de fato.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const admin = read("contract_admin_app.js");
const cloud = read("grcon_cloud_app.js");

const start = admin.indexOf("const ACCESS_ROLES");
const end = admin.indexOf("async function usersApi");
assert.ok(start > 0 && end > start, "bloco da tabela localizado");
const labels = { owner: "Proprietário", admin: "Administrador", operator: "Operador", viewer: "Consulta" };
const escape = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const { ACCESS_ROLES, ACCESS_RULES, accessMatrixHtml } = new Function("labels", "escape", `${admin.slice(start, end)}\nreturn { ACCESS_ROLES, ACCESS_RULES, accessMatrixHtml };`)(labels, escape);

// Regras reais, lidas do código que decide (não de uma cópia).
const writeRoles = cloud.match(/function canWriteHistory\(\) \{\s*return \[([^\]]*)\]\.includes\(state\.membership\?\.role\);/)[1].split(",").map((item) => item.trim().replace(/"/g, ""));
assert.match(cloud, /function canManageWorkspace\(\) \{ return state\.membership\?\.role === "owner"; \}/);
assert.match(cloud, /function canManageHistory\(\) \{ return isMasterOwner\(\); \}/);
assert.match(cloud, /function canManageMembers\(\) \{ return isMasterOwner\(\); \}/);
const real = { canWriteHistory: writeRoles, canManageWorkspace: ["owner"], canManageHistory: "master", canManageMembers: "master" };

assert.deepEqual([...ACCESS_ROLES], ["owner", "admin", "operator", "viewer"]);
assert.equal(ACCESS_RULES.length, Object.keys(real).length, "todas as regras explícitas estão na tabela");
for (const rule of ACCESS_RULES) {
  assert.ok(rule.rule in real, `regra conhecida: ${rule.rule}`);
  if (real[rule.rule] === "master") assert.equal(rule.masterOnly, true, `${rule.rule} é só do Proprietário ADM`);
  else assert.deepEqual([...rule.roles].sort(), [...real[rule.rule]].sort(), `${rule.rule}: funções iguais às do código`);
}
// A tela diz com texto (não só ícone/cor) e nomeia as quatro funções.
const html = accessMatrixHtml();
for (const label of Object.values(labels)) assert.ok(html.includes(`>${label}</th>`), `coluna ${label}`);
assert.match(html, /Pode<\/span>/);
assert.match(html, /Não pode<\/span>/);
assert.match(html, /Somente o Proprietário ADM/);
assert.match(admin, /\$\{accessMatrixHtml\(\)\}/, "inserida em Usuários e acessos");
assert.match(read("grcon_cloud.css"), /\.grcon-admin-matrix table/);
console.log("admin_access_matrix: OK");
