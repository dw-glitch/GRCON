const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(require("node:path").join(__dirname,"..",path),"utf8");

const main = read("app.js");
const cloud = read("grcon_cloud_app.js");
const vault = read("document_vault_app.js");
const worker = read("cloudflare/worker-entry.mjs");
const migration = read("supabase/migrations/20261027165500_egrdt_abandoned_reservations.sql");
const preview = read("supabase/migrations/20261027165700_egrdt_sequence_history_preview.sql");
const audit = read("supabase/migrations/20261027165600_egrdt_reservation_recovery_audit.sql");

assert.match(migration,/status = 'reserved'[\s\S]*history_id is null/);
assert.match(migration,/reserved_at < clock_timestamp\(\) - interval '2 hours'/);
assert.match(migration,/not exists \(/[\s\S]*?grcon_history/);
assert.match(migration,/while exists \(/[\s\S]*?largest_sequence := largest_sequence \+ 1/);
assert.match(migration,/private\.grcon_release_egrdt_reservations/);
assert.match(migration,/reserved_by = actor/);
assert.match(migration,/pg_advisory_xact_lock/);
assert.match(preview,/last_generated/);
assert.match(preview,/next_available/);
assert.match(audit,/grcon_egrdt_reservation_recovery_audit/);

assert.match(main,/let reservedNumbers = \[\];/);
assert.equal((main.match(/releaseEgrdtReservationRequest\?\.\(reservedNumbers\)/g)||[]).length,3);
assert.equal((main.match(/outputDelivered = true;/g)||[]).length,6);
assert.doesNotMatch(main,/localStorage\.setItem\(EGRDT_SEQUENCE_KEY, String\(Math\.max\(readLastEgrdtSequence\(\), highest\)\)\)/);
assert.match(main,/if \(saved\.saved\) \{[\s\S]*?syncFromNumber\(file\.official\.baseName\)/);
assert.match(main,/grcon:egrdt-sequence-status|refreshOfficialEgrdtSequenceStatus/);
assert.match(cloud,/releaseEgrdtReservationRequest/);
assert.match(cloud,/grcon_release_egrdt_reservations/);
assert.match(cloud,/grcon_egrdt_sequence_status/);

assert.match(vault,/allowConflict: false, progress: 0, status: "pending"/);
assert.match(vault,/isSystemicVaultError/);
assert.match(vault,/state\.validationFailures/);
assert.match(vault,/count >= 5/);
assert.match(vault,/entry\.manualRevisionOverride/);
assert.match(worker,/const clientError =/);
assert.match(worker,/const status = denied/);

console.log("OK: GRDT reservation rollback, authoritative numbering, recovery audit, vault dedup and repeat-failure protection.");
