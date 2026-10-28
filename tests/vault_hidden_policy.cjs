"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const html = read("index.html");
const app = read("app.js");
const vault = read("document_vault_app.js");
const master = read("document_master_app.js");
const worker = read("cloudflare/worker-entry.mjs");
const sw = read("sw.js");
const policySource = read("grcon_storage_policy.js");
const sandbox = { window: {} };
vm.runInNewContext(policySource, sandbox);
const flags = sandbox.window.GrconStorageFeatures;
assert.equal(flags.showStorageUI, false);
assert.equal(flags.enableAutomaticUpload, false);
assert.equal(flags.enableManualUpload, false);
assert.equal(flags.enableAutomaticLookup, false);
assert.equal(flags.storageProvider, "r2");
assert.equal(flags.futureOneDriveSupport, true);
assert.equal(Object.isFrozen(flags), true);

assert.doesNotMatch(html, /id="grdt-save-to-vault"/);
assert.match(html, /grcon_storage_policy\\.js/);
assert.match(sw, /"grcon_storage_policy\\.js"/);
assert.match(vault, /if \(storageFeatures\.showStorageUI !== true\) return;/);
assert.match(vault, /if \(storageFeatures\.enableAutomaticUpload !== true\) return null;/);
assert.match(vault, /if \(storageFeatures\.enableManualUpload !== true\) return;/);
assert.match(app, /GrconStorageFeatures\?\.enableAutomaticLookup === true/);
assert.match(app, /GrconStorageFeatures\?\.enableAutomaticUpload !== true/);
assert.doesNotMatch(master, /data-master-target="vault"/);
assert.doesNotMatch(master, /\['vault','Arquivos no Cofre'\]/);
for (const action of ["init", "upload", "multipart/start", "multipart/part", "multipart/complete", "restart", "delete", "metadata"]) {
  assert.ok(worker.includes('"' + action + '"'), "missing guarded storage route: " + action);
}
assert.match(worker, /GRCON_DOCUMENT_UPLOADS_ENABLED === "true"/);
assert.match(worker, /STORAGE_WRITE_ACTIONS\.has\(action\)/);
assert.match(worker, /STORAGE_WRITES_DISABLED/);
assert.match(worker, /if \(action === "download"/);
console.log("vault_hidden_policy: OK — hidden UI, suspended writes and preserved legacy reads");
