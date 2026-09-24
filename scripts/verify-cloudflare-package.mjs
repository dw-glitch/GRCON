import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "dist-cloudflare");
const REQUIRED = [
  "index.html", "sw.js", "manifest.json", "grcon_cloud_config.js", "grcon_mascot_controller_v4.js",
  "deployment-meta.json", "_headers", "react-dist", "assets", "workers",
];
const FORBIDDEN = [".git", ".github", "node_modules", "tests", "src"];
const MAX_FILES = 20_000;
const MAX_FILE_SIZE = 25 * 1024 * 1024;

async function exists(relative) {
  try { await stat(path.join(outDir, relative)); return true; } catch (_) { return false; }
}

async function walk(dir, prefix = "") {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = path.posix.join(prefix, entry.name);
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full, rel));
    else if (entry.isFile()) files.push(rel);
  }
  return files;
}

function normalizeRef(value) {
  const clean = String(value || "").trim().replace(/[?#].*$/, "").replace(/^\.\//, "").replace(/^\//, "");
  if (!clean || /^(?:https?:|data:|blob:|mailto:|#)/i.test(clean)) return "";
  return clean;
}

function collectReferences(file, source) {
  const refs = new Set();
  const patterns = [
    /(?:src|href)=["']([^"'#?]+)["']/g,
    /\bensure\(["']([^"']+)["']\)/g,
    /new\s+Worker\(\s*["']([^"']+)["']/g,
    /new\s+Worker\(\s*new\s+URL\(\s*["']([^"']+)["']/g,
    /navigator\.serviceWorker\.register\(\s*["']([^"']+)["']/g,
    /\bfetch\(\s*["'`]([^"'`${}]+)["'`]/g,
    /url\(\s*["']?([^"')]+)["']?\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      const ref = normalizeRef(match[1]);
      if (!ref || ref.startsWith("api/")) continue;
      if (!/\.[a-z0-9]{1,8}(?:\.\d+)?$/i.test(ref)) continue;
      refs.add(`${file} -> ${ref}`);
    }
  }
  return refs;
}

function serviceWorkerAssetRefs(source) {
  const block = source.match(/const\s+ASSETS\s*=\s*\[([\s\S]*?)\];/);
  if (!block) throw new Error("Não foi possível localizar const ASSETS no sw.js.");
  return [...block[1].matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
}

for (const item of REQUIRED) if (!await exists(item)) throw new Error(`Pacote Cloudflare incompleto: ${item}`);
for (const item of FORBIDDEN) if (await exists(item)) throw new Error(`Pacote Cloudflare contém diretório proibido: ${item}`);
for (const item of await readdir(outDir)) if (/^\.env(?:\.|$)/.test(item)) throw new Error(`Pacote Cloudflare contém segredo potencial: ${item}`);

const allFiles = await walk(outDir);
if (allFiles.length > MAX_FILES) throw new Error(`Pacote excede ${MAX_FILES} arquivos: ${allFiles.length}`);
for (const relative of allFiles) {
  const info = await stat(path.join(outDir, relative));
  if (info.size > MAX_FILE_SIZE) throw new Error(`Arquivo excede 25 MiB: ${relative} (${info.size} bytes)`);
}

const broken = [];
for (const relative of allFiles.filter((name) => /\.(?:html|js|css)$/i.test(name))) {
  const source = await readFile(path.join(outDir, relative), "utf8");
  for (const item of collectReferences(relative, source)) {
    const ref = item.slice(item.indexOf(" -> ") + 4);
    if (!await exists(ref)) broken.push(item);
  }
}
const sw = await readFile(path.join(outDir, "sw.js"), "utf8");
for (const ref of serviceWorkerAssetRefs(sw)) if (!await exists(ref)) broken.push(`sw.js ASSETS -> ${ref}`);
if (broken.length) throw new Error(`Referências locais quebradas no pacote Cloudflare:\n${broken.slice(0, 80).join("\n")}`);

const metadata = JSON.parse(await readFile(path.join(outDir, "deployment-meta.json"), "utf8"));
if (metadata.provider !== "cloudflare" || !metadata.commit || !metadata.build) throw new Error("deployment-meta.json inválido.");
const headers = await readFile(path.join(outDir, "_headers"), "utf8");
for (const header of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security", "Cross-Origin-Opener-Policy", "Cross-Origin-Resource-Policy", "Content-Security-Policy"]) {
  if (!headers.includes(header)) throw new Error(`Header de segurança ausente: ${header}`);
}
if (!headers.includes("kvyrttccwzdhasplfxnr.supabase.co")) throw new Error("CSP Cloudflare não preserva o Supabase do GRCON.");

console.log(`Pacote Cloudflare validado: ${allFiles.length} arquivo(s), referências locais íntegras e sem diretórios proibidos.`);
