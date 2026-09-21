const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const html = read("index.html");
const loader = read("grcon_module_loader.js");
const sw = read("sw.js");
const vite = read("vite.config.ts");
const packageJson = read("package.json");
const index = read("src/react/pdf-tools/index.tsx");
const app = read("src/react/pdf-tools/PdfMergeApp.tsx");
const hook = read("src/react/pdf-tools/hooks/usePdfMerge.ts");
const adapter = read("src/react/pdf-tools/services/pdfMergeAdapter.ts");
const domain = read("src/react/pdf-tools/types/domain.ts");
const drop = read("src/react/pdf-tools/components/PdfDropZone.tsx");
const list = read("src/react/pdf-tools/components/PdfFileList.tsx");
const output = read("src/react/pdf-tools/components/PdfOutputPanel.tsx");
const progress = read("src/react/pdf-tools/components/PdfProgress.tsx");
const result = read("src/react/pdf-tools/components/PdfResult.tsx");
const worker = read("workers/pdf-merge.worker.js");
const css = read("pdf-merge.css");
const phaseB = read("docs/phase-b-pdf-tools-parity.md");

assert.match(html, /id="pdf-tools-module"/);
assert.match(html, /id="grcon-pdf-tools-root"/);
assert.doesNotMatch(html, /id="pdf-merge-drop"/, "A UI legada não deve continuar duplicada no HTML estático.");

assert.match(loader, /"pdf-tools":\s*\["pdf_merge_core\.js",\s*"react-dist\/pdf-tools-app\.js"\]/);
assert.doesNotMatch(loader, /"pdf-tools":\s*\[[^\]]*"pdf_merge_app\.js"/);
assert.match(sw, /"react-dist\/pdf-tools-app\.js"/);
assert.doesNotMatch(sw, /"pdf_merge_app\.js"/);

assert.match(vite, /"pdf-tools":\s*\{/);
assert.match(vite, /entry:\s*"src\/react\/pdf-tools\/index\.tsx"/);
assert.match(vite, /fileName:\s*"pdf-tools-app\.js"/);
assert.match(packageJson, /vite build --mode pdf-tools/);
assert.match(packageJson, /tests\/pdf_tools_react\.cjs/);

assert.match(index, /containerId:\s*"grcon-pdf-tools-root"/);
assert.match(index, /window\.GrconPdfMergeUi\s*=\s*Object\.freeze/);
assert.match(index, /GrconPdfMergeReact/);

for (const delegated of [
  "isAcceptedFile", "fileSignature", "reorder", "summarize", "formatBytes", "outputFileName"
]) {
  assert.match(adapter, new RegExp("api\\." + delegated + "|core\\(\\)\\." + delegated));
}
assert.match(adapter, /new Worker\("workers\/pdf-merge\.worker\.js"\)/);
assert.match(adapter, /removeEventListener\("message"/);
assert.match(adapter, /removeEventListener\("error"/);
assert.match(adapter, /worker\.terminate\(\)/);
assert.match(adapter, /URL\.createObjectURL/);
assert.match(adapter, /URL\.revokeObjectURL/);
assert.match(adapter, /type:\s*"cancel"/);

assert.match(hook, /MutationObserver/);
assert.match(hook, /module\.hidden && Adapter\.hasActiveWorker\(\)/);
assert.match(hook, /Adapter\.dispose\(\)/);
assert.match(hook, /pdfMergeBridge\.register/);
assert.match(hook, /Adapter\.merge\(/);
assert.doesNotMatch(hook, /new Worker\(/);

assert.match(app, /Combinar PDFs/);
assert.match(app, /Processamento local/);
assert.match(app, /UiPageHeader/);
assert.match(app, /UiMetaPill/);
assert.match(app, /Adicionar/);
assert.match(app, /Organizar/);
assert.match(app, /Gerar/);

assert.match(drop, /id="pdf-merge-drop"/);
assert.match(drop, /role="button"/);
assert.match(drop, /event\.key === "Enter"/);
assert.match(drop, /event\.key === " "/);
assert.match(drop, /hasFiles/);
assert.match(drop, /Adicionar PDFs/);

assert.match(list, /id="pdf-merge-list"/);
assert.match(list, /data-pdf-action="up"/);
assert.match(list, /data-pdf-action="down"/);
assert.match(list, /data-pdf-action="remove"/);
assert.match(list, /padStart\(2, "0"\)/);
assert.match(list, /title="Remover"/);

assert.match(output, /id="pdf-merge-output-name"/);
assert.match(output, /maxLength=\{124\}/);
assert.match(output, /props\.itemCount >= 2/);
assert.match(output, /Adicione pelo menos 2 PDFs/);
assert.match(output, /Combinar e baixar/);

assert.match(progress, /role="progressbar"/);
assert.match(progress, /aria-valuenow=\{value\}/);
assert.match(progress, /pdf-merge-progress-percent/);
assert.match(result, /id="pdf-merge-download"/);
assert.match(result, /PDF combinado com sucesso/);

assert.match(css, /pdf-merge-drop\.has-files/);
assert.match(css, /max-height:\s*min\(55vh,\s*600px\)/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /@media \(max-width:\s*44rem\)/);
assert.match(phaseB, /Core, Worker e Engine sem alteração/);

const reactSource = [index, app, hook, adapter, domain, drop, list, output, progress, result].join("\n");
assert.doesNotMatch(reactSource, /PDFLib|pdf-lib\.min\.js/);
assert.doesNotMatch(reactSource, /\bfetch\s*\(|supabase|localStorage/i);
assert.match(worker, /importScripts\("\.\.\/pdf-lib\.min\.js",\s*"\.\.\/pdf_merge_engine\.js"\)/);

console.log("pdf_tools_react: ok");
