const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const Core = require(path.join(root, "document_vault_core.js"));
const coreSource = read("document_vault_core.js");
const app = read("document_vault_app.js");
const appMain = read("app.js");
const html = read("index.html");
const emission = read("emission.js");
const worker = read("cloudflare/worker-entry.mjs");
const wrangler = read("wrangler.jsonc");
const sw = read("sw.js");
const migrations = fs.readdirSync(path.join(root, "supabase", "migrations"))
  .filter(name => /document_vault/.test(name) || /multi_contract_foundation/.test(name))
  .map(name => read(path.join("supabase", "migrations", name)))
  .join("\n");

new vm.Script(coreSource, { filename: "document_vault_core.js" });
new vm.Script(app, { filename: "document_vault_app.js" });
execFileSync(process.execPath, ["--check", path.join(root, "cloudflare", "worker-entry.mjs")], { stdio: "pipe" });


assert.match(html, /document_vault_core\.js/);
assert.match(html, /document_vault_app\.js/);

const rev0 = Core.parseStoredFileIdentity("RL-5290.00-22313-856-C1O-017.pdf");
assert.equal(rev0.documentCode, "RL-5290.00-22313-856-C1O-017");
assert.equal(rev0.revision, "0");
assert.equal(rev0.format, "pdf");

const rev0Explicit = Core.parseStoredFileIdentity("RL-5290.00-22313-856-C1O-017_0.pdf");
assert.equal(rev0Explicit.documentCode, "RL-5290.00-22313-856-C1O-017");
assert.equal(rev0Explicit.revision, "0");

const revA = Core.parseStoredFileIdentity("RL-5290.00-22313-856-C1O-017_A.docx");
assert.equal(revA.documentCode, "RL-5290.00-22313-856-C1O-017");
assert.equal(revA.revision, "A");
assert.equal(revA.format, "docx");

const sequenceRev = Core.parseStoredFileIdentity("RL-5290.00-22313-856-C1O-017_0001_B.pdf");
assert.equal(sequenceRev.documentCode, "RL-5290.00-22313-856-C1O-017");
assert.equal(sequenceRev.revision, "B");

const sequenceOnly = Core.parseStoredFileIdentity("RL-5290.00-22313-856-C1O-017_0001.pdf");
assert.equal(sequenceOnly.documentCode, "RL-5290.00-22313-856-C1O-017");
assert.equal(sequenceOnly.revision, "0");

const sequenceRir = Core.parseStoredFileIdentity("RL-5290.00-22313-856-C1O-017_0001_RIR.pdf");
assert.equal(sequenceRir.documentCode, "RL-5290.00-22313-856-C1O-017");
assert.equal(sequenceRir.revision, "0");
assert.equal(Core.isRevisionToken("RIR"), false);

const numericRev = Core.parseStoredFileIdentity("DOCUMENTO_1.xlsx");
assert.equal(numericRev.documentCode, "DOCUMENTO");
assert.equal(numericRev.revision, "1");

for (const revision of ["01","A1","AA","#1"]) {
  const parsed = Core.parseStoredFileIdentity("DOCUMENTO_" + revision + ".pdf");
  assert.equal(parsed.documentCode, "DOCUMENTO");
  assert.equal(parsed.revision, revision);
}

for (const name of ["DOCUMENTO.xlsx","DOCUMENTO.dwg","DOCUMENTO.dgn","DOCUMENTO.docx","DOCUMENTO.msg","DOCUMENTO.csv","DOCUMENTO.tif","DOCUMENTO.xyz"]) {
  const parsed = Core.parseStoredFileIdentity(name);
  assert.equal(parsed.ignored, false, name + " deve ser aceito");
  assert.equal(parsed.revision, "0", name + " sem sufixo deve ser revisão 0");
}
for (const name of ["DOCUMENTOS.zip","DOCUMENTOS.rar","DOCUMENTOS.7z","DOCUMENTOS.tar","DOCUMENTOS.gz"]) {
  assert.equal(Core.isArchiveFileName(name), true, name + " deve ser ignorado");
}

const lookupPlain = Core.parseLookupInput(" DOC-001 ");
assert.equal(lookupPlain.documentCode, "DOC-001");
assert.equal(lookupPlain.revision, "");
assert.equal(lookupPlain.explicitRevision, false);

const lookupPetrobras = Core.parseLookupInput("RL-5290.00-22313-856-C1O-017");
assert.equal(lookupPetrobras.documentCode, "RL-5290.00-22313-856-C1O-017");
assert.equal(lookupPetrobras.revision, "");

const lookupPetrobrasRev = Core.parseLookupInput("RL-5290.00-22313-856-C1O-017_A.pdf");
assert.equal(lookupPetrobrasRev.documentCode, "RL-5290.00-22313-856-C1O-017");
assert.equal(lookupPetrobrasRev.revision, "A");
const lookupRev = Core.parseLookupInput("DOC-001_A");
assert.equal(lookupRev.documentCode, "DOC-001");
assert.equal(lookupRev.revision, "A");
assert.equal(lookupRev.explicitRevision, true);

const pasted = Core.parseLookupText("DOC-001\n\n DOC-002_A \nDOC-001\n");
assert.equal(pasted.length, 2);
assert.deepEqual(pasted.map(item => [item.documentCode,item.revision]), [["DOC-001",""],["DOC-002","A"]]);

let resolved = Core.resolveLookupSelection({ requestedRevision:"", matches:[{revision:"0"}] });
assert.equal(resolved.selectedRevision, "0");
assert.equal(resolved.needsRevisionChoice, false);
resolved = Core.resolveLookupSelection({ requestedRevision:"", matches:[{revision:"0"},{revision:"A"},{revision:"B"}] });
assert.equal(resolved.selectedRevision, "");
assert.equal(resolved.needsRevisionChoice, true);
resolved = Core.resolveLookupSelection({ requestedRevision:"A", matches:[{revision:"0"},{revision:"A"}] });
assert.equal(resolved.selectedRevision, "A");

assert.match(app, /\/api\/document-vault/);
assert.match(app, /allocation:\s*state\.allocation/);
assert.match(app, /value="allocated">Alocados/);
assert.match(app, /value="not_allocated">Não alocados/);
assert.match(app, /value="not_identified">Não identificados/);
assert.match(app, /relativePath:\s*task\.file\.webkitRelativePath\s*\|\|\s*task\.file\.name/);
assert.match(app, /webkitdirectory/);
assert.match(app, /document_hash_worker\.js/);
assert.match(app, /Pausar/);
assert.match(app, /Retomar/);
assert.match(app, /Tentar novamente/);
assert.match(app, /DataTransfer/);
assert.match(app, /input\.dispatchEvent\(new Event\("change"/);
assert.match(app, /\/lookup/);
assert.match(app, /LOOKUP_BATCH_SIZE\s*=\s*500/);
assert.match(app, /UPLOAD_CONCURRENCY\s*=\s*6/);
assert.match(app, /ENQUEUE_CHUNK_SIZE/);
assert.match(app, /compactado\(s\) ignorado\(s\)/);
assert.doesNotMatch(app, /id="vault-use-grdt"/);
assert.doesNotMatch(app, /data-vault-select=/);
assert.doesNotMatch(app, /Cofre conectado · R2 \+ Supabase/);
assert.match(app, /lookupSource/);
assert.match(app, /resolveMissingEntries/);
assert.match(app, /\/usage/);
assert.match(app, /\/reconcile/);
assert.match(app, /Controle de Solicitações/);
assert.match(app, /allocation_label/);
assert.doesNotMatch(app, /name="grdt-document-source"/);
assert.doesNotMatch(app, /SUPABASE_SECRET_KEY|service_role|R2_SECRET|R2_ACCESS_KEY/i);

assert.match(worker, /authenticatedUser/);
assert.match(worker, /SUPABASE_SECRET_KEY/);
assert.match(worker, /GRCON_DOCUMENTS/);
assert.match(worker, /grcon_document_vault_list/);
assert.match(worker, /grcon_document_vault_lookup/);
assert.match(worker, /handleLookup/);
assert.match(worker, /handleUsage/);
assert.match(worker, /handleReconcile/);
assert.match(worker, /r2Inventory/);
assert.match(worker, /grcon_document_vault_storage_catalog/);
assert.match(worker, /grcon_document_vault_storage_usage/);
assert.match(worker, /storageUsageSnapshot/);
assert.match(worker, /grcon_document_vault_reconcile_log/);
assert.match(worker, /ARCHIVE_IGNORED/);
assert.match(worker, /\["zip","rar","7z","tar","gz"\]/);
assert.match(worker, /handleDownload/);
assert.match(worker, /createMultipartUpload/);
assert.match(worker, /find_hash/);
assert.match(worker, /cache-control[^\n]+private, no-store/i);
assert.match(wrangler, /"bucket_name"\s*:\s*"grcon-documents"/);
assert.match(wrangler, /"main"\s*:\s*"\.\/cloudflare\/worker-entry\.mjs"/);

assert.match(migrations, /create table private\.grcon_document_files/i);
assert.match(migrations, /grcon_planned_document_snapshots/i);
assert.match(migrations, /grcon_document_vault_list/i);
assert.match(migrations, /grcon_document_vault_lookup/i);
assert.match(migrations, /grcon_document_files_ready_contract_identity/i);
assert.match(migrations, /d\.contract_id\s*=\s*active_contract/i);
assert.match(migrations, /allocation_filter/i);
assert.match(migrations, /grcon_requests_bases/i);
assert.match(migrations, /Alocação|ALOCAÇÃO/);
assert.match(migrations, /Não identificado/);
assert.match(migrations, /grcon_document_vault_storage_catalog/i);
assert.match(migrations, /grcon_document_vault_storage_usage/i);
assert.match(migrations, /not_identified/i);
assert.match(migrations, /document_vault_storage_reconciled/i);
assert.match(migrations, /grant execute[^;]+service_role/i);
assert.doesNotMatch(migrations, /create table if not exists public\.grcon_document_objects/i);

assert.doesNotMatch(appMain, /result\.virtualFileName\s*=\s*listedName/);
assert.match(appMain, /resolveMissingEntries\(missingFromList\)/);
assert.match(appMain, /missingRequestedFiles/);
assert.match(appMain, /Documentos não encontrados/);
assert.match(appMain, /Copiar códigos não encontrados/);
assert.match(appMain, /fileOrigin:\s*vaultSource\s*\?\s*"Cofre"\s*:\s*"Pasta local"/);
assert.match(appMain, /ORIGEM DO ARQUIVO/);
assert.match(appMain, /ALOCAÇÃO INFORMADA PELO COFRE/);
assert.match(appMain, /csv\|dwg\|dxf\|dgn\|rvt\|ifc/);
assert.match(appMain, /não entram na tabela de resultados, na GRDT nem no histórico/);

assert.match(emission, /vaultFileId:\s*text\(vaultSource/);
assert.match(emission, /fileProvenance:\s*vaultSource/);
assert.match(emission, /sha256:\s*text\(vaultSource\.sha256\)/);
assert.match(history, /fileProvenance:\s*cleanFileProvenance/);
assert.match(history, /catalogSequence/);
assert.match(history, /lastModified/);
assert.match(emission, /historyClassification/);

console.log("Document Vault contracts: OK");
