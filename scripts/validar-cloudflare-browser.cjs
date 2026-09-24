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
  await page.waitForFunction(() => "serviceWorker" in navigator, null, { timeout: 10000 });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 10000 });
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
  const results = { viewports: {}, probes: {}, api: null, pwa: null, mascot: null };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
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

    await page.addStyleTag({ content: [
      "html.grcon-cloud-pending body > :not(.grcon-cloud-auth):not(script) { visibility: visible !important; }",
      "#grcon-cloud-auth { display: none !important; }",
    ].join("\n") });

    await page.waitForFunction(() => Boolean(window.GRCONModuleLoader), null, { timeout: 15000 });
    await page.waitForFunction(() => Boolean(window.GrconMascot), null, { timeout: 15000 });
    await waitForServiceWorker(page);

    const targets = [
      "/", "/index.html", "/sw.js", "/manifest.json", "/grcon_cloud_config.js",
      "/grcon_mascot_controller_v4.js", "/deployment-meta.json",
      "/react-dist/consultas-app.js", "/react-dist/cover-document-app.js",
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

    results.mascot = await page.evaluate(() => ({
      version: window.GrconMascot?.version || "",
      instances: window.GrconMascot?.diagnostics?.().instances ?? null,
      enabled: window.GrconMascot?.diagnostics?.().enabled ?? null,
    }));
    assert.match(results.mascot.version, /^5\./);

    results.api = await page.evaluate(async () => {
      const getResponse = await fetch("/api/egrdt-teams-notification", { method: "GET" });
      const postResponse = await fetch("/api/egrdt-teams-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      return {
        get: { status: getResponse.status, allow: getResponse.headers.get("allow") || "" },
        post: { status: postResponse.status, body: await postResponse.json().catch(() => ({})) },
      };
    });
    assert.equal(results.api.get.status, 405);
    assert.equal(results.api.get.allow, "POST");
    assert.equal(results.api.post.status, 401);
    assert.equal(results.api.post.body.code, "MISSING_SESSION");

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
