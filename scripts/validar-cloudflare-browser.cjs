"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.GRCON_CLOUDFLARE_PREVIEW_URL || "http://127.0.0.1:8766";
const expectedCommit = process.env.GRCON_EXPECTED_COMMIT || "";
const outputDir = path.join(process.cwd(), "artifacts/cloudflare-browser");
fs.mkdirSync(outputDir, { recursive: true });

function isExpectedExternalError(message) {
  return /supabase|Failed to fetch|net::ERR_|ERR_CONNECTION|storage.*initialize/i.test(String(message || ""));
}

async function waitForServiceWorker(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const supported = await page.evaluate(() => "serviceWorker" in navigator);
      if (!supported) throw new Error("Service Worker indisponível no Chromium.");
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      if (await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) return;
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      if (!/Execution context was destroyed|navigation|frame was detached/i.test(message)) throw error;
      await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
    }
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 10000 });
}

async function installCloudAuthBypass(page) {
  const content = [
    "html.grcon-cloud-pending body > :not(.grcon-cloud-auth):not(script) { visibility: visible !important; }",
    "#grcon-cloud-auth { display: none !important; }",
  ].join("\n");
  await page.addInitScript((css) => {
    const styleId = "grcon-cloud-qa-auth-bypass";
    const ensureStyle = () => {
      const host = document.head || document.documentElement;
      if (!host || document.getElementById(styleId)) return;
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = css;
      host.appendChild(style);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", ensureStyle, { once: true });
    }
    ensureStyle();
  }, content);
}

async function waitForCloudAuthBypass(page) {
  let lastError = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 30000 });
      await page.waitForFunction(
        () => Boolean(document.getElementById("grcon-cloud-qa-auth-bypass")),
        null,
        { timeout: 5000 }
      );
      return;
    } catch (error) {
      lastError = error;
      const message = String(error && error.message ? error.message : error);
      if (!/Execution context was destroyed|navigation|frame was detached|Timeout/i.test(message)) throw error;
      await page.waitForTimeout(150);
    }
  }
  throw lastError || new Error("Não foi possível estabilizar a página após o Service Worker.");
}

async function probe(page, pathname) {
  return page.evaluate(async (target) => {
    const response = await fetch(target, { cache: "no-store" });
    return {
      target,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      cacheControl: response.headers.get("cache-control") || "",
      csp: response.headers.get("content-security-policy") || "",
      nosniff: response.headers.get("x-content-type-options") || "",
    };
  }, pathname);
}



(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = { viewports: {}, probes: {}, api: null, vault: null, pwa: null, mascot: null };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await installCloudAuthBypass(page);
    const pageErrors = [];
    const consoleErrors = [];
    const badLocalResponses = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !isExpectedExternalError(message.text())) consoleErrors.push(message.text());
    });
    page.on("response", (response) => {
      try {
        const url = new URL(response.url());
        const base = new URL(baseUrl);
        if (url.origin === base.origin && response.status() >= 400 && !url.pathname.startsWith("/api/")) {
          badLocalResponses.push(`${response.status()} ${url.pathname}`);
        }
      } catch (_) {}
    });

    const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    assert.equal(response.status(), 200, "A raiz do pacote Cloudflare deve responder 200.");

    await waitForServiceWorker(page);
    await waitForCloudAuthBypass(page);

    await page.waitForFunction(() => Boolean(window.GRCONModuleLoader), null, { timeout: 15000 });
    await page.waitForFunction(() => Boolean(window.GrconMascot), null, { timeout: 15000 });

    const targets = [
      "/", "/index.html", "/sw.js", "/manifest.json", "/grcon_cloud_config.js",
      "/grcon_mascot_controller_v4.js", "/deployment-meta.json",
      "/react-dist/consultas-app.js", "/react-dist/cover-document-app.js",
      "/document_vault_app.js", "/document_hash_worker.js", "/document-vault.css",
      "/assets/mascot/video/grcon-mascot-idle-alpha.webm",
      "/workers/sigem_pw_dashboard.worker.js",
    ];
    for (const target of targets) {
      const item = await probe(page, target);
      results.probes[target] = item;
      assert.equal(item.status, 200, target + " deve responder 200.");
      assert.ok(item.nosniff === "nosniff", target + " deve herdar X-Content-Type-Options.");
    }

    assert.match(results.probes["/index.html"].cacheControl, /no-(?:cache|store)/);
    assert.match(results.probes["/index.html"].csp, /kvyrttccwzdhasplfxnr\.supabase\.co/);
    assert.match(results.probes["/assets/mascot/video/grcon-mascot-idle-alpha.webm"].contentType, /video\/webm/);
    assert.match(results.probes["/assets/mascot/video/grcon-mascot-idle-alpha.webm"].cacheControl, /immutable/);

    const metadata = await page.evaluate(async () => (await fetch("/deployment-meta.json", { cache: "no-store" })).json());
    assert.equal(metadata.provider, "cloudflare");
    if (expectedCommit) assert.equal(metadata.commit, expectedCommit);

    const manifest = await page.evaluate(async () => (await fetch("/manifest.json", { cache: "no-store" })).json());
    const swInfo = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return {
        scope: registration.scope,
        controlled: Boolean(navigator.serviceWorker.controller),
        scriptURL: registration.active?.scriptURL || "",
      };
    });
    results.pwa = { manifestName: manifest.name, startUrl: manifest.start_url, scope: manifest.scope, serviceWorker: swInfo };
    assert.equal(swInfo.controlled, true);
    assert.match(swInfo.scriptURL, /\/sw\.js$/);
    assert.equal(new URL(swInfo.scope).pathname, "/");

    results.mascot = await page.evaluate(() => {
      const diagnostics = window.GrconMascot?.diagnostics?.() || {};
      return {
        version: diagnostics.version || "",
        instances: diagnostics.instances ?? null,
        enabled: diagnostics.enabled ?? null,
      };
    });
    assert.match(results.mascot.version, /^5\./);

    const apiGetResponse = await context.request.get(baseUrl + "/api/egrdt-teams-notification");
    const apiPostResponse = await context.request.post(baseUrl + "/api/egrdt-teams-notification", {
      headers: { "Content-Type": "application/json" },
      data: {},
    });
    results.api = {
      get: { status: apiGetResponse.status(), allow: apiGetResponse.headers()["allow"] || "" },
      post: { status: apiPostResponse.status(), body: await apiPostResponse.json().catch(() => ({})) },
    };
    assert.equal(results.api.get.status, 405);
    assert.equal(results.api.get.allow, "POST");
    assert.equal(results.api.post.status, 401);
    assert.equal(results.api.post.body.code, "MISSING_SESSION");

    const vaultHealth = await context.request.get(baseUrl + "/api/document-vault/health");
    const vaultHealthBody = await vaultHealth.json().catch(() => ({}));
    assert.ok([200, 503].includes(vaultHealth.status()), "Health do Cofre deve responder 200 configurado ou 503 sem secrets locais.");
    assert.equal(vaultHealthBody.service, "grcon-document-vault");

    await page.waitForFunction(() => Boolean(window.GrconDocumentVault && document.querySelector("[data-vault-open]")), null, { timeout: 15000 });
    await page.evaluate(() => {
      const target = Array.from(document.querySelectorAll("[data-vault-open]")).find((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      });
      if (!target) throw new Error("Navegação do Cofre não localizada.");
      target.click();
    });
    await page.locator("#document-vault-module").waitFor({ state: "visible", timeout: 10000 });
    const vaultUi = await page.evaluate(() => ({
      moduleVisible: !document.getElementById("document-vault-module")?.hidden,
      folderPicker: Boolean(document.getElementById("vault-folder-input")?.hasAttribute("webkitdirectory")),
      allocationOptions: Array.from(document.querySelectorAll("#vault-allocation option")).map(option => option.value),
      oldReissueCard: Boolean(document.querySelector('#additional-tools-module .additional-tool-card[data-grcon-view="grdt-reissue"]')),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    assert.equal(vaultUi.moduleVisible, true);
    assert.equal(vaultUi.folderPicker, true);
    assert.deepEqual(vaultUi.allocationOptions, ["all", "allocated", "not_allocated"]);
    assert.equal(vaultUi.oldReissueCard, false);
    assert.ok(vaultUi.overflow <= 1, "Cofre não pode gerar overflow horizontal global.");
    results.vault = { health: { status: vaultHealth.status(), body: vaultHealthBody }, ui: vaultUi };

    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(250);
      const metrics = await page.evaluate(() => ({
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
        title: document.title,
        moduleLoader: Boolean(window.GRCONModuleLoader),
        mascot: Boolean(window.GrconMascot),
      }));
      assert.ok(metrics.documentOverflow <= 1, `Overflow horizontal global em ${viewport.width}x${viewport.height}`);
      assert.ok(metrics.bodyOverflow <= 1, `Overflow horizontal no body em ${viewport.width}x${viewport.height}`);
      assert.equal(metrics.moduleLoader, true);
      assert.equal(metrics.mascot, true);
      results.viewports[`${viewport.width}x${viewport.height}`] = metrics;
      await page.screenshot({ path: path.join(outputDir, `cloudflare-${viewport.width}x${viewport.height}.png`), fullPage: false });
    }

    assert.deepEqual([...new Set(badLocalResponses)], [], "Não pode haver resposta local 4xx/5xx fora da rota API.");
    assert.deepEqual(pageErrors.filter((message) => !isExpectedExternalError(message)), []);
    assert.deepEqual(consoleErrors, []);

    fs.writeFileSync(path.join(outputDir, "metrics.json"), JSON.stringify({ passed: true, ...results }, null, 2));
    console.log("cloudflare_browser: ok", JSON.stringify({ metadata, ...results }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
