#!/usr/bin/env node
/**
 * Mede a estabilidade visual do GRCON: quantas mutações de DOM a interface
 * produz SOZINHA, sem nenhuma interação.
 *
 * Numa aplicação estável esse número é zero. Foi assim que se localizou o ciclo
 * de repintura de 25 Hz do ui-v3.js (729 mutações em 10 s de tela parada).
 *
 * Fica FORA do `npm run verify` de propósito: exige um navegador, e o
 * repositório já retirou os testes E2E do CI. Rode à mão quando suspeitar de
 * piscada:
 *
 *   npm i -D playwright   (ou reaproveite uma instalação existente)
 *   node scripts/medir-estabilidade-visual.mjs
 *
 * Variáveis: GRCON_URL (padrão http://127.0.0.1:8099/index.html),
 * GRCON_CHROMIUM (caminho do executável), GRCON_OCIOSO_MS (padrão 10000).
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const OCIOSO_MS = Number(process.env.GRCON_OCIOSO_MS) || 10000;

let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  console.log("Playwright não instalado — medição ignorada. Instale com: npm i -D playwright");
  process.exit(0);
}

const TIPOS = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon", ".xlsx": "application/octet-stream" };
const servidor = createServer(async (req, res) => {
  const alvo = path.join(RAIZ, decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
  if (!alvo.startsWith(RAIZ)) { res.writeHead(403).end(); return; }
  try {
    const corpo = await readFile(alvo);
    res.writeHead(200, { "content-type": TIPOS[path.extname(alvo)] || "application/octet-stream" }).end(corpo);
  } catch { res.writeHead(404).end(); }
});
await new Promise((pronto) => servidor.listen(0, "127.0.0.1", pronto));
const url = process.env.GRCON_URL || `http://127.0.0.1:${servidor.address().port}/index.html`;

const CONTADOR = `
window.__grconMut = { total: 0, porAlvo: new Map() };
function assinatura(no) {
  if (!no) return "?";
  if (no.nodeType === 3) return assinatura(no.parentNode) + " (texto)";
  if (no.nodeType !== 1) return "no" + no.nodeType;
  if (no.id) return "#" + no.id;
  let s = no.tagName.toLowerCase();
  if (typeof no.className === "string" && no.className) s += "." + no.className.trim().split(/\\s+/).slice(0, 2).join(".");
  const pai = no.parentElement;
  return (pai && pai.id ? "#" + pai.id + " > " : "") + s;
}
new MutationObserver((registros) => {
  for (const r of registros) {
    window.__grconMut.total += 1;
    const chave = assinatura(r.target) + " [" + r.type + (r.type === "attributes" ? ":" + r.attributeName : "") + "]";
    window.__grconMut.porAlvo.set(chave, (window.__grconMut.porAlvo.get(chave) || 0) + 1);
  }
}).observe(document.documentElement || document, { childList: true, subtree: true, attributes: true, characterData: true });
window.__grconZerar = () => { window.__grconMut.total = 0; window.__grconMut.porAlvo.clear(); };
window.__grconLer = () => ({ total: window.__grconMut.total, top: [...window.__grconMut.porAlvo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10) });
`;

const executablePath = process.env.GRCON_CHROMIUM || undefined;
const navegador = await chromium.launch({ args: ["--no-sandbox", "--disable-background-networking"], ...(executablePath ? { executablePath } : {}) });
const contexto = await navegador.newContext();
await contexto.addInitScript(CONTADOR);
const pagina = await contexto.newPage();
const falhas = [];
pagina.on("pageerror", (e) => falhas.push(String(e).slice(0, 200)));

await pagina.goto(url, { waitUntil: "load", timeout: 60000 });
await pagina.waitForTimeout(2500);
await pagina.evaluate(() => window.__grconZerar());
await pagina.waitForTimeout(OCIOSO_MS);
const ocioso = await pagina.evaluate(() => window.__grconLer());

await navegador.close();
servidor.close();

const segundos = Math.round(OCIOSO_MS / 1000);
console.log(`Mutações de DOM em ${segundos}s de tela parada: ${ocioso.total}`);
ocioso.top.forEach(([alvo, n]) => console.log(`   ${n}x ${alvo}`));
if (falhas.length) { console.log(`Erros de página: ${falhas.length}`); falhas.slice(0, 5).forEach((f) => console.log("   -", f)); }

if (ocioso.total > 0) {
  console.error(`\nFALHOU — a interface se repinta sozinha. Um GRCON parado deve produzir 0 mutações.`);
  process.exit(1);
}
console.log("OK — interface estável em repouso (0 mutações).");
