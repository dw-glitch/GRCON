"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const Core = require("../document_vault_core.js");
const source = fs.readFileSync(require.resolve("../document_vault_app.js"), "utf8");
const tick = () => new Promise(resolve => setImmediate(resolve));
const file = (name, body = "same content") => ({ name, size: Buffer.byteLength(body), body });
const entry = (f, revision = Core.parseStoredFileIdentity(f.name).revision) => ({ file: f, document: Core.parseStoredFileIdentity(f.name).documentCode, revision, fileProvenance: { source: "local" } });

function harness({ failure = false, existing = true, conflict = false } = {}) {
  const calls = [], puts = [], notices = [], records = new Map();
  let active = 0, maxActive = 0, hashes = 0, queueLookups = 0;
  const root = {
    GrconDocumentVaultCore: Core,
    GrconCloud: { state: { session: { access_token: "test" }, membership: { workspace_id: "contract-1", role: "operator" } } },
    GrconNotify: (message, kind) => notices.push({ message, kind }),
    crypto, setTimeout,
  };
  class HashWorker {
    constructor() { this.listeners = {}; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    terminate() {}
    postMessage({ id, file }) {
      hashes++;
      setImmediate(() => this.listeners.message({ data: { id, type: "done", sha256: crypto.createHash("sha256").update(file.body).digest("hex") } }));
    }
  }
  class Xhr {
    constructor() { this.upload = {}; this.headers = {}; }
    open(method, path) { this.path = path; }
    setRequestHeader(k, v) { this.headers[k] = v; }
    send(blob) {
      puts.push(blob);
      const record = [...records.values()].find(item => item.id === this.headers["x-grcon-file-id"]);
      record.ready = true;
      this.status = 200;
      this.responseText = JSON.stringify({ ok: true, file: record });
      setImmediate(() => this.onload());
    }
  }
  const fetch = async (url, options) => {
    if (!url.endsWith("/init")) return { ok: true, text: async () => JSON.stringify({ ok: true, files: [] }) };
    const body = JSON.parse(options.body);
    calls.push(body);
    active++; maxActive = Math.max(maxActive, active);
    await tick(); active--;
    if (failure) return { ok: false, status: 503, text: async () => JSON.stringify({ ok: false, error: "CATALOG_ERROR", message: "offline" }) };
    if (conflict) return { ok: false, status: 409, text: async () => JSON.stringify({ ok: false, error: "IDENTITY_CONFLICT", message: "different binary" }) };
    const key = JSON.stringify([body.documentCode, body.revision, body.format, body.sha256, body.sizeBytes]);
    const old = records.get(key);
    const record = old || { id: "vault-" + (records.size + 1), file_version: 1, ready: existing };
    records.set(key, record);
    // Existing content must return a ready file: no PUT, no failure.
    return { ok: true, text: async () => JSON.stringify({ ok: true, file: record, ready: record.ready, duplicate: Boolean(old && record.ready), uploadMode: record.ready ? "none" : "single" }) };
  };
  vm.runInNewContext(source, { window: root, document: { readyState: "loading", addEventListener() {}, getElementById(id) { if (id === "vault-queue-body") queueLookups++; return null; } },
    Worker: HashWorker, XMLHttpRequest: Xhr, fetch, AbortController, DOMException, setTimeout, clearTimeout, console });
  return { vault: root.GrconDocumentVault, root, calls, puts, notices, get hashes() { return hashes; }, get maxActive() { return maxActive; }, get queueLookups() { return queueLookups; } };
}
async function drain(h) {
  for (let i = 0; i < 15000; i++) {
    if (!h.vault.state.active && (h.vault.state.paused || !h.vault.state.queue.some(t => t.status === "pending"))) return;
    await tick();
  }
  throw new Error("Queue did not drain");
}

(async () => {
  const h = harness();
  const files = Array.from({ length: 1200 }, (_, i) => file("DOC-" + String(i).padStart(4, "0") + "_A.pdf"));
  const archives = ["zip", "rar", "7z", "tar", "gz", "ZIP"].map(ext => file("DOC-ARCHIVE_A." + ext));
  const plan = { entries: files.concat(archives).map(f => entry(f)) };
  const start = h.vault.prepareEmissionFiles(plan);
  assert.equal(h.calls.length, 0, "package preparation performs no network IO");
  assert.equal(h.hashes, 0, "package does not wait for vault hashing");
  assert.equal(h.vault.state.queue.length, 0, "failed/cancelled package has no storage side effects");
  start(); start();
  await drain(h);
  assert.equal(h.vault.state.queue.length, 1200);
  assert.equal(h.calls.length, 1200);
  assert.ok(h.maxActive <= 6, "bounded concurrent requests for 1200 files");
  assert.ok(h.vault.state.queue.every(t => t.status === "done"));
  assert.equal(h.queueLookups, 0, "background queue never rebuilds the hidden vault table");
  assert.equal(h.vault.state.uploadFault, null);
  assert.equal(h.puts.length, 0, "ready existing objects are never uploaded again");
  assert.equal(plan.entries.length, 1206, "archives remain in the GRDT package");
  assert.ok(h.vault.lookupSource(files[0]).id);
  assert.equal(plan.entries[0].file, files[0], "original local binary is kept in the delivered package");
  const next = { entries: files.map(f => entry(f)) };
  h.vault.prepareEmissionFiles(next)();
  await drain(h);
  assert.equal(h.calls.length, 1200, "known vault files skip requests entirely");
  assert.ok(next.entries.every(e => e.vaultFileId));

  const copy = file(files[0].name);
  h.vault.prepareEmissionFiles({ entries: [entry(copy)] })();
  await drain(h);
  assert.equal(h.calls.length, 1201, "new local copy verified by hash");
  assert.equal(h.puts.length, 0);
  assert.equal(h.vault.lookupSource(copy).id, h.vault.lookupSource(files[0]).id);
  assert.ok(h.vault.state.queue.at(-1).duplicate);

  const changedRevision = entry(files[0], "B"); changedRevision.manualRevisionOverride = true;
  h.vault.prepareEmissionFiles({ entries: [changedRevision] })();
  await drain(h);
  assert.equal(h.calls.at(-1).revision, "B", "manual new revision is checked independently");
  assert.notEqual(h.vault.lookupSource(files[0]).id, next.entries[0].vaultFileId);

  const fresh = harness({ existing: false });
  const identicalCopies = Array.from({ length: 12 }, () => entry(file("DOC-NEW_A.pdf")));
  fresh.vault.prepareEmissionFiles({ entries: identicalCopies })(); await drain(fresh);
  assert.equal(fresh.puts.length, 1, "concurrent identical local copies share a single upload");
  assert.ok(identicalCopies.every(e => fresh.vault.lookupSource(e.file).id === "vault-1"));
  assert.ok(fresh.vault.state.queue.every(t => t.status === "done"));

  const differing = harness({ conflict: true });
  const differentPlan = { entries: [entry(file("DOC-NEW_A.pdf", "modified bytes"))] };
  differing.vault.prepareEmissionFiles(differentPlan)(); await drain(differing);
  assert.equal(differing.vault.state.queue[0].status, "conflict");
  assert.equal(differing.vault.state.paused, false);
  assert.equal(differing.puts.length, 0, "changed bytes never silently overwrite the original");
  assert.equal(differentPlan.entries[0].file.body, "modified bytes", "storage conflict does not replace GRDT content");

  const offline = harness({ failure: true });
  const offlinePlan = { entries: files.map(f => entry(f)) };
  const uploadLater = offline.vault.prepareEmissionFiles(offlinePlan);
  assert.equal(offline.calls.length, 0);
  uploadLater(); await drain(offline);
  assert.ok(offline.vault.state.paused);
  assert.ok(offline.calls.length <= 6, "catalog outage stops requests, package already delivered");
  assert.ok(offline.vault.state.queue.some(t => t.status === "pending"), "pending items retained for resume");

  const cancelled = harness();
  const doNotStart = cancelled.vault.prepareEmissionFiles({ entries: [entry(file("DOC-1_A.pdf"))] });
  cancelled.root.GrconCloud.state.membership.workspace_id = "contract-2";
  doNotStart();
  assert.equal(cancelled.calls.length, 0, "contract switch cannot upload into another workspace");

  const direct = harness();
  await direct.vault.persistEmissionFiles({ entries: archives.map(f => entry(f)) });
  assert.equal(direct.calls.length, 0, "legacy caller also skips archives without repeated 400s");
  assert.equal(direct.vault.state.uploadFault, null);
  console.log("OK: 1200 files, zero vault IO before delivery, six concurrent requests, archive preservation, duplicate reuse, manual revisions, outage and contract isolation.");
})().catch(error => { console.error(error); process.exitCode = 1; });
