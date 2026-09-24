import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outDir = path.join(root, "dist-cloudflare");
const runtimeDirs = ["assets", "workers", "react-dist"];
const rootRuntimeExtensions = new Set([
  ".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico",
  ".webm", ".wasm", ".xlsx", ".xls", ".csv", ".woff", ".woff2", ".ttf", ".otf",
]);
const explicitRootFiles = new Set(["manifest.json"]);
const forbiddenNames = new Set([".git", ".github", "node_modules", "tests", "src", ".env"]);
const CLOUDFLARE_FREE_FILE_LIMIT = 20_000;
const CLOUDFLARE_FILE_SIZE_LIMIT = 25 * 1024 * 1024;

async function exists(target) {
  try { await stat(target); return true; } catch (_) { return false; }
}

function isRuntimeRootFile(name) {
  if (explicitRootFiles.has(name)) return true;
  return rootRuntimeExtensions.has(path.extname(name).toLowerCase());
}

async function copyRuntimeRootFiles() {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !isRuntimeRootFile(entry.name)) continue;
    await cp(path.join(root, entry.name), path.join(outDir, entry.name));
  }
}

async function copyRuntimeDirectory(relative) {
  const source = path.join(root, relative);
  if (!await exists(source)) throw new Error(`Diretório obrigatório ausente: ${relative}. Execute npm run build antes do empacotamento.`);
  await cp(source, path.join(outDir, relative), { recursive: true });
}

async function walk(dir, prefix = "") {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = path.posix.join(prefix, entry.name);
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full, rel));
    else if (entry.isFile()) files.push({ relative: rel, size: (await stat(full)).size });
  }
  return files;
}

async function assertNoForbiddenContent() {
  const entries = await readdir(outDir, { withFileTypes: true });
  for (const entry of entries) {
    if (forbiddenNames.has(entry.name) || /^\.env(?:\.|$)/.test(entry.name)) {
      throw new Error(`Conteúdo proibido no pacote Cloudflare: ${entry.name}`);
    }
  }
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await copyRuntimeRootFiles();
for (const dir of runtimeDirs) await copyRuntimeDirectory(dir);
await cp(path.join(root, "cloudflare", "_headers"), path.join(outDir, "_headers"));

const deploymentMeta = {
  commit: process.env.GITHUB_SHA || process.env.GRCON_DEPLOY_COMMIT || "local",
  provider: "cloudflare",
  build: process.env.GITHUB_RUN_ID || process.env.GRCON_DEPLOY_BUILD || "local",
  generatedAt: new Date().toISOString(),
};
await writeFile(path.join(outDir, "deployment-meta.json"), `${JSON.stringify(deploymentMeta, null, 2)}\n`, "utf8");
await assertNoForbiddenContent();

const files = await walk(outDir);
const oversized = files.filter((file) => file.size > CLOUDFLARE_FILE_SIZE_LIMIT);
if (oversized.length) {
  throw new Error(`Cloudflare rejeitaria ${oversized.length} arquivo(s) acima de 25 MiB: ${oversized.map((file) => `${file.relative} (${file.size} bytes)`).join(", ")}`);
}
if (files.length > CLOUDFLARE_FREE_FILE_LIMIT) {
  throw new Error(`Pacote possui ${files.length} arquivos, acima do limite portátil de ${CLOUDFLARE_FREE_FILE_LIMIT} arquivos do Workers Free.`);
}
const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
const largest = [...files].sort((a, b) => b.size - a.size).slice(0, 10);
console.log(JSON.stringify({ directory: "dist-cloudflare", files: files.length, totalBytes, largest }, null, 2));
