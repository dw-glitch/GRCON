const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8765";

function record(id, sequence, generatedAt) {
  const code = "RL-5290.00-22313-91B-C1O-" + String(sequence).padStart(3, "0");
  return {
    id,
    egrdtNumber: "0130870-C1O-PGV-G-" + String(sequence).padStart(4, "0") + "-2026 - eGRDT",
    generatedAt,
    outputType: "ZIP + PDFs",
    ldName: "LD_001",
    sourceName: "Fixture Chromium",
    allocations: ["3.1.1.1"],
    files: [{
      document: code,
      originalName: code + "_0.pdf",
      finalName: code + "_0.pdf",
      revision: "0",
      grdtRevision: "0",
      sigemStatus: "POSTADO",
      allocation: "3.1.1.1",
      ldPrazo: "A01",
      sheet: "N-1710",
    }],
  };
}

const fixtures = [
  record("fixture-a", 1, "2026-09-01T12:00:00-03:00"),
  record("fixture-b", 2, "2026-09-15T12:00:00-03:00"),
  record("fixture-c", 3, "2026-09-30T12:00:00-03:00"),
];

async function revealApp(page) {
  await page.addStyleTag({ content: [
    "html.grcon-cloud-pending body > :not(.grcon-cloud-auth):not(script) { visibility: visible !important; }",
    "#grcon-cloud-auth { display: none !important; }",
  ].join("\n") });
}

async function openHistory(page) {
  await page.evaluate(async () => {
    if (window.GRCONModuleLoader?.ensureModule) await window.GRCONModuleLoader.ensureModule("history");
    window.GrconHistoryUi?.activate?.("history");
  });
  await page.locator("#history-date-start").waitFor({ state: "visible", timeout: 30000 });
}

async function seed(page) {
  await page.evaluate((rows) => {
    localStorage.removeItem(window.GrconHistory.STORAGE_KEY);
    const result = window.GrconHistory.saveMany(rows);
    if (!result || result.saved !== rows.length) throw new Error("Fixture do Histórico não pôde ser salva.");
    window.dispatchEvent(new CustomEvent("grcon:history-updated", { detail: { fixture: true } }));
  }, fixtures);
  await page.waitForFunction(() => document.querySelector("#history-result-count")?.textContent?.includes("3 eGRDT"));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await revealApp(page);
    await openHistory(page);
    await seed(page);

    assert.match(await page.locator("#history-result-count").innerText(), /^3 eGRDT/);
    assert.equal(await page.locator("#history-list [data-history-id]").count(), 3);

    await page.locator("#history-date-start").fill("2026-09-10");
    await page.locator("#history-date-end").fill("2026-09-20");

    await page.waitForFunction(() => document.querySelector("#history-result-count")?.textContent?.startsWith("1 eGRDT"));
    const listText = await page.locator("#history-list").innerText();
    assert.match(listText, /0130870-C1O-PGV-G-0002-2026/);
    assert.doesNotMatch(listText, /0130870-C1O-PGV-G-0001-2026/);
    assert.doesNotMatch(listText, /0130870-C1O-PGV-G-0003-2026/);

    const summary = await page.locator("#history-summary").innerText();
    assert.match(summary, /eGRDTs localizadas\s*1/, "Resumo precisa usar o mesmo recorte da lista.");

    const compatibility = await page.evaluate(() => ({
      filtered: Array.isArray(window.GrconHistoryUi?.state?.filtered)
        ? window.GrconHistoryUi.state.filtered.map((item) => item.egrdtNumber)
        : null,
      selectedId: window.GrconHistoryUi?.state?.selectedId || "",
    }));
    assert.deepEqual(compatibility.filtered, ["0130870-C1O-PGV-G-0002-2026 - eGRDT"]);
    assert.ok(compatibility.selectedId, "selectedId precisa continuar exposto na fachada.");

    assert.deepEqual(errors, []);
    console.log("historico-egrdt-browser reprodução central: PASS");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
