#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const migrationFiles = fs.readdirSync(root)
  .filter((file) => /^SUPABASE_MIGRACAO_.*\.sql$/i.test(file))
  .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
const failures = [];
const allSql = migrationFiles.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");

for (const file of migrationFiles) {
  const sql = fs.readFileSync(path.join(root, file), "utf8");
  const functions = [...sql.matchAll(/create\s+or\s+replace\s+function[\s\S]*?\$\$[\s\S]*?\$\$\s*;/gi)].map((match) => match[0]);
  functions.forEach((definition, index) => {
    if (/security\s+definer/i.test(definition) && !/set\s+search_path\s*=/i.test(definition)) {
      failures.push(`${file}: função SECURITY DEFINER ${index + 1} não fixa search_path`);
    }
  });
}

for (const match of allSql.matchAll(/create\s+table\s+if\s+not\s+exists\s+private\.([a-z0-9_]+)/gi)) {
  const table = match[1];
  const revoke = new RegExp(`revoke\\s+all\\s+on\\s+table\\s+private\\.${table}\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, "i");
  if (!revoke.test(allSql)) failures.push(`private.${table}: falta revogar acesso de public, anon e authenticated`);
}

const cloudConfig = fs.readFileSync(path.join(root, "grcon_cloud_config.js"), "utf8");
if (/sb_secret_|service[_-]?role/i.test(cloudConfig)) failures.push("grcon_cloud_config.js contém uma chave secreta/service_role");
if (!/publishableKey:\s*["']sb_publishable_/i.test(cloudConfig)) failures.push("grcon_cloud_config.js não usa chave publishable explícita");

// O modelo de e-mail saiu junto com a aba "E-mails de evidência" na 5.32.7. As
// migrações 5.31.10 e 5.31.14 continuam no repositório como registro histórico
// do que já foi aplicado, mas não devem mais descrever estruturas vivas: se
// alguma delas reaparecer no banco, é sinal de que a remoção foi desfeita.
const removalMigration = fs.readFileSync(path.join(root, "SUPABASE_MIGRACAO_5.32.7.sql"), "utf8");
for (const name of ["grcon_get_email_template", "grcon_set_email_template"]) {
  if (!new RegExp(`drop\\s+function\\s+if\\s+exists\\s+public\\.${name}`, "i").test(removalMigration)) {
    failures.push(`SUPABASE_MIGRACAO_5.32.7.sql: falta remover o wrapper public.${name}`);
  }
}
if (!/drop\s+table\s+if\s+exists\s+private\.grcon_email_template/i.test(removalMigration)) {
  failures.push("SUPABASE_MIGRACAO_5.32.7.sql: falta remover a tabela private.grcon_email_template");
}
// A remoção precisa ser reversível: os dados vão para uma cópia antes do descarte.
if (!/create\s+table\s+if\s+not\s+exists\s+private\.grcon_email_template_backup/i.test(removalMigration)) {
  failures.push("SUPABASE_MIGRACAO_5.32.7.sql: a remoção precisa preservar os dados numa cópia");
}
// Estruturas compartilhadas não podem sair junto.
for (const preservado of ["grcon_profiles", "grcon_invitations", "grcon_audit_events"]) {
  if (new RegExp(`drop\\s+(table|column)[^;]*${preservado}`, "i").test(removalMigration)) {
    failures.push(`SUPABASE_MIGRACAO_5.32.7.sql: ${preservado} é compartilhado e não pode ser removido`);
  }
}

// A central de alocação segue o mesmo padrão do antigo modelo de e-mail: invólucro
// público INVOKER, implementação privada DEFINER que confere o papel, e escrita
// restrita ao proprietário.
const centerMigration = fs.readFileSync(path.join(root, "SUPABASE_MIGRACAO_5.32.6.sql"), "utf8");
for (const name of ["grcon_get_allocation_center", "grcon_set_allocation_center"]) {
  const wrapper = centerMigration.match(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}[\\s\\S]*?\\$\\$\\s*;`, "i"));
  if (!wrapper || !/security\s+invoker/i.test(wrapper[0]) || /security\s+definer/i.test(wrapper[0])) {
    failures.push(`SUPABASE_MIGRACAO_5.32.6.sql: wrapper public.${name} precisa ser SECURITY INVOKER`);
  }
  if (!new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${name}[\\s\\S]*?from\\s+public\\s*,\\s*anon`, "i").test(centerMigration)) {
    failures.push(`public.${name}: falta revogar EXECUTE de public/anon`);
  }
  if (!new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${name}[\\s\\S]*?to\\s+authenticated`, "i").test(centerMigration)) {
    failures.push(`public.${name}: falta conceder EXECUTE somente a authenticated`);
  }
}
if (!/private\.grcon_has_role\(target_workspace,\s*array\['owner'\]\)/i.test(centerMigration)) {
  failures.push("SUPABASE_MIGRACAO_5.32.6.sql: gravação da central precisa exigir owner");
}
if (!/private\.grcon_is_member\(target_workspace\)/i.test(centerMigration)) {
  failures.push("SUPABASE_MIGRACAO_5.32.6.sql: leitura da central precisa exigir membro ativo");
}

const deletionMigration = fs.readFileSync(path.join(root, "SUPABASE_MIGRACAO_5.32.2.sql"), "utf8");
const publicDeleteWrapper = deletionMigration.match(/create\s+or\s+replace\s+function\s+public\.grcon_delete_history_record[\s\S]*?\$\$\s*;/i);
if (!publicDeleteWrapper || !/security\s+invoker/i.test(publicDeleteWrapper[0]) || /security\s+definer/i.test(publicDeleteWrapper[0])) {
  failures.push("SUPABASE_MIGRACAO_5.32.2.sql: wrapper público de exclusão precisa ser SECURITY INVOKER");
}
if (!/private\.grcon_has_role\(target_workspace,\s*array\['owner',\s*'admin'\]\)/i.test(deletionMigration)) {
  failures.push("SUPABASE_MIGRACAO_5.32.2.sql: exclusão precisa exigir owner/admin");
}
if (!/create\s+unique\s+index\s+grcon_history_workspace_egrdt_number_uidx[\s\S]*?deleted_at\s+is\s+null/i.test(deletionMigration)) {
  failures.push("SUPABASE_MIGRACAO_5.32.2.sql: índice eGRDT precisa ignorar registros excluídos");
}
if ((deletionMigration.match(/history_row\.deleted_at\s+is\s+null/gi) || []).length < 2) {
  failures.push("SUPABASE_MIGRACAO_5.32.2.sql: reserva precisa ignorar tombstones nas duas verificações");
}
if (!/revoke\s+all\s+on\s+function\s+public\.grcon_delete_history_record[\s\S]*?from\s+public\s*,\s*anon\s*,\s*authenticated/i.test(deletionMigration)
    || !/grant\s+execute\s+on\s+function\s+public\.grcon_delete_history_record[\s\S]*?to\s+authenticated/i.test(deletionMigration)) {
  failures.push("public.grcon_delete_history_record: privilégios EXECUTE incorretos");
}

if (failures.length) {
  console.error("Falha na auditoria estática do Supabase:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`OK — ${migrationFiles.length} migrações auditadas: search_path, privilégios privados, wrappers e chave pública.`);
