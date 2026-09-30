"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "artifacts", "owner-password-management");
fs.mkdirSync(outputDir, { recursive: true });

const source = fs.readFileSync(path.join(root, "grcon_cloud_app.js"), "utf8");
const styles = [
  fs.readFileSync(path.join(root, "design-system.css"), "utf8"),
  fs.readFileSync(path.join(root, "grcon_cloud.css"), "utf8"),
].join("\n");

function instrument(value) {
  const marker = /\n  init\(\);\n\}\)\(\);\s*$/;
  assert.match(value, marker);
  return value.replace(marker, `
  window.__OwnerPasswordQa = { state, createAccountMenu, updateAccountMenu, loadMembers, openAdminPasswordModal };
})();
`);
}

let browser;

(async () => {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.setContent("<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><style>" + styles + "</style></head><body><div class='runtime-status'></div></body></html>");
  await page.addScriptTag({ content: instrument(source) });

  await page.evaluate(() => {
    const memberships = [
      { user_id: "11111111-1111-4111-8111-111111111111", role: "owner", active: true, joined_at: "2026-01-01" },
      { user_id: "22222222-2222-4222-8222-222222222222", role: "admin", active: true, joined_at: "2026-01-02" },
      { user_id: "33333333-3333-4333-8333-333333333333", role: "operator", active: true, joined_at: "2026-01-03" },
      { user_id: "44444444-4444-4444-8444-444444444444", role: "viewer", active: true, joined_at: "2026-01-04" },
    ];
    const profiles = [
      { id: memberships[0].user_id, email: "owner@example.test", display_name: "Owner QA" },
      { id: memberships[1].user_id, email: "admin@example.test", display_name: "Admin QA" },
      { id: memberships[2].user_id, email: "operator@example.test", display_name: "Operator QA" },
      { id: memberships[3].user_id, email: "viewer@example.test", display_name: "Viewer QA" },
    ];

    window.__qa = { requestCount: 0, requestValid: false, notice: "" };
    window.GrconNotify = (message) => { window.__qa.notice = String(message || ""); };

    const api = window.__OwnerPasswordQa;
    api.state.session = { user: { id: memberships[0].user_id, email: profiles[0].email } };
    api.state.membership = {
      workspace_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      workspace_name: "Workspace QA",
      role: "owner",
    };
    api.state.client = {
      from(table) {
        if (table === "grcon_memberships") {
          let activeOnly = false;
          return {
            select() { return this; },
            eq(field, value) { if (field === "active" && value === true) activeOnly = true; return this; },
            async order() { return { data: activeOnly ? memberships.filter((item) => item.active) : memberships.slice(), error: null }; },
          };
        }
        if (table === "grcon_profiles") {
          return {
            select() { return this; },
            async in(_field, ids) { return { data: profiles.filter((item) => ids.includes(item.id)), error: null }; },
          };
        }
        throw new Error("Tabela inesperada");
      },
      functions: {
        async invoke(name, options) {
          window.__qa.requestCount += 1;
          const body = options?.body || {};
          window.__qa.requestValid = name === "owner-change-user-password"
            && body.targetUserId === memberships[1].user_id
            && body.workspaceId === api.state.membership.workspace_id
            && typeof body.newPassword === "string"
            && body.newPassword.length >= 12;
          return { data: { ok: true }, error: null };
        },
      },
    };
    api.createAccountMenu();
    api.updateAccountMenu();
  });

  await page.evaluate(() => window.__OwnerPasswordQa.loadMembers());
  assert.equal(await page.locator("[data-member-password]").count(), 2);
  assert.equal(await page.locator('[data-member-user-id="11111111-1111-4111-8111-111111111111"] [data-member-password]').count(), 0);
  assert.equal(await page.locator('[data-member-user-id="44444444-4444-4444-8444-444444444444"] [data-member-password]').count(), 0);

  await page.locator('[data-member-password="22222222-2222-4222-8222-222222222222"]').click();
  await page.locator("#grcon-admin-password-modal").waitFor({ state: "visible" });

  const password = page.locator("#grcon-admin-new-password");
  const confirmation = page.locator("#grcon-admin-confirm-password");
  const next = page.locator("#grcon-admin-password-next");

  await password.fill("Fraca1!");
  await confirmation.fill("Fraca1!");
  assert.equal(await next.isDisabled(), true);
  assert.match(await page.locator("#grcon-admin-password-message").innerText(), /12 caracteres/);

  await password.fill("NovaSenha123!");
  await confirmation.fill("OutraSenha123!");
  assert.equal(await next.isDisabled(), true);
  assert.equal(await page.locator("#grcon-admin-password-message").innerText(), "As senhas informadas não coincidem.");

  await confirmation.fill("NovaSenha123!");
  assert.equal(await next.isEnabled(), true);
  await next.click();

  assert.equal(await page.locator("#grcon-admin-password-confirm").isVisible(), true);
  assert.equal(await password.inputValue(), "");
  assert.equal(await confirmation.inputValue(), "");

  await page.locator("#grcon-admin-password-submit").click();
  await page.waitForFunction(() => document.querySelector("#grcon-admin-password-modal")?.hidden === true);

  const qa = await page.evaluate(() => ({ ...window.__qa }));
  assert.equal(qa.requestCount, 1);
  assert.equal(qa.requestValid, true);
  assert.equal(qa.notice, "Senha alterada com sucesso.");

  for (const role of ["admin", "operator"]) {
    await page.evaluate(async (nextRole) => {
      const api = window.__OwnerPasswordQa;
      api.state.membership.role = nextRole;
      document.querySelector("#grcon-cloud-members").innerHTML = "";
      await api.loadMembers();
    }, role);
    assert.equal(await page.locator("[data-member-password]").count(), 0, role + " não deve visualizar Alterar senha");
    const remainedClosed = await page.evaluate(() => {
      const api = window.__OwnerPasswordQa;
      api.openAdminPasswordModal({
        userId: "33333333-3333-4333-8333-333333333333",
        role: "operator",
        name: "Operator QA",
        email: "operator@example.test",
      });
      return document.querySelector("#grcon-admin-password-modal")?.hidden !== false;
    });
    assert.equal(remainedClosed, true, role + " não deve abrir o modal por chamada direta");
  }

  await page.screenshot({ path: path.join(outputDir, "owner-password-management.png"), fullPage: true });
  fs.writeFileSync(path.join(outputDir, "result.json"), JSON.stringify({ passed: true, requests: qa.requestCount }, null, 2));
  console.log("owner_password_browser: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) {
    await browser.close().catch(() => {});
  }
});
