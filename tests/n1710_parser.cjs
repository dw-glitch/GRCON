const assert = require("node:assert/strict");
const Catalog = require("../n1710_catalog.js");
const Parser = require("../n1710_parser.js");

const stats = Catalog.stats();
assert.deepEqual(stats, {
  categories: 21,
  installations: 7149,
  activitiesC: 915,
  classesD: 704,
  activitiesE: 118,
  activitiesF: 119,
  classPairsF: 493,
});

assert.equal(Catalog.META.bodyRevision, "N");
assert.equal(Catalog.META.annexes.A.revision, "W");
assert.equal(Catalog.META.annexes.B.revision, "CJ");
assert.equal(Catalog.META.annexes.C.revision, "BF");
assert.equal(Catalog.META.annexes.D.revision, "BG");
assert.equal(Catalog.META.annexes.E.revision, "D");
assert.equal(Catalog.META.annexes.F.revision, "G");
assert.equal(Catalog.META.annexes.G.revision, "CN");

assert.equal(Catalog.hasCategory("RL"), true);
assert.equal(Catalog.hasInstallation("5290.00"), true);
assert.equal(Catalog.hasActivity("2313", "C"), true);
assert.equal(Catalog.hasClass("91B", "D"), true);
assert.equal(Catalog.hasActivity("4034", "E"), true);
assert.equal(Catalog.hasClass("151", "F", "4034"), true);

const rhdd = Parser.evaluate("RL-5290.00-22313-91B-C1O-002");
assert.equal(rhdd.valid, true);
assert.equal(rhdd.fullyVerified, false, "origem depende do cadastro NORTEC e não deve ser inventada");
assert.equal(rhdd.groups.category, "RL");
assert.equal(rhdd.groups.installation, "5290.00");
assert.equal(rhdd.groups.activity, "22313");
assert.equal(rhdd.activityDifferentiator, "2");
assert.equal(rhdd.activityBase, "2313");
assert.equal(rhdd.activityAnnex, "C");
assert.equal(rhdd.classAnnex, "D");

const n1710Example = Parser.evaluate("MD-4300.06-8222-114-PTD-001");
assert.equal(n1710Example.valid, true);
assert.equal(n1710Example.activityBase, "8222");

const fleet = Parser.evaluate("RL-4856.01-4034-151-PTD-001");
assert.equal(fleet.valid, true);
assert.equal(fleet.fleet, true);
assert.equal(fleet.activityAnnex, "E");
assert.equal(fleet.classAnnex, "F");
assert.ok(fleet.checks.some(item => item.id === "n1710.annex.route" && /TRANSPETRO/.test(item.message)));

const english = Parser.evaluate("I-RL-5290.00-2313-91B-C1O-002");
assert.equal(english.valid, true);
assert.equal(english.groups.language, "I");

const invalidCategory = Parser.evaluate("SG-5290.00-22313-91B-C1O-002");
assert.equal(invalidCategory.valid, false);
assert.ok(invalidCategory.errors.some(message => /Anexo A/.test(message)));

const invalidInstallation = Parser.evaluate("RL-9999.99-22313-91B-C1O-002");
assert.equal(invalidInstallation.valid, false);
assert.ok(invalidInstallation.errors.some(message => /Anexo B/.test(message)));

const invalidActivity = Parser.evaluate("RL-5290.00-29999-91B-C1O-002");
assert.equal(invalidActivity.valid, false);
assert.ok(invalidActivity.errors.some(message => /Anexo C/.test(message)));

const invalidClass = Parser.evaluate("RL-5290.00-22313-ZZZ-C1O-002");
assert.equal(invalidClass.valid, false);
assert.ok(invalidClass.errors.some(message => /Anexo D/.test(message)));

const invalidFleetPair = Parser.evaluate("RL-4856.01-4034-999-PTD-001");
assert.equal(invalidFleetPair.valid, false);
assert.ok(invalidFleetPair.errors.some(message => /Anexo F/.test(message)));

const invalidGroups = Parser.evaluate("RL-5290.00-22313-91B-002");
assert.equal(invalidGroups.valid, false);
assert.ok(invalidGroups.errors.some(message => /6 grupos/.test(message)));

const fourDigitSequence = Parser.evaluate("RL-5290.00-22313-91B-C1O-1000");
assert.equal(fourDigitSequence.valid, true);

console.log("n1710_parser: OK — 7 grupos, Anexos A–F versionados, diferenciador FGGGG e rota C/D × E/F validados.");