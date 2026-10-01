const assert=require('node:assert/strict');
const Core=require('../core.js');
const N2064=require('../n2064_revision_lifecycle.js');
const Versions=require('../normative_version_registry.js');

assert.equal(Core.revisionInfo('0').valid,true);
assert.equal(Core.revisionInfo('#1').valid,true);
assert.equal(Core.revisionInfo('#1').lifecycleKind,'preliminary_before_original');
assert.equal(Core.revisionInfo('01').valid,true);
assert.equal(Core.revisionInfo('01').baseRevision,'0');
assert.equal(Core.revisionInfo('A3').valid,true);
assert.equal(Core.revisionInfo('A3').kind,'field');
assert.equal(Core.revisionInfo('A3').lifecycleKind,'preliminary_after_revision');
assert.equal(Core.revisionInfo('AA').valid,true);
assert.equal(Core.revisionInfo('I').valid,true,'I é prática não recomendada na Rev. D, não bloqueio');
assert.equal(Core.revisionInfo('O').valid,true,'O é prática não recomendada na Rev. D, não bloqueio');
assert.equal(Core.revisionInfo('I').recommended,false);
assert.match(Core.revisionInfo('O').warnings.join(' '),/alerta, não bloqueio/i);
assert.equal(Core.nextRevision('H'),'J','sugestão automática continua evitando I');
assert.equal(Core.nextRevision('N'),'P','sugestão automática continua evitando O');
assert.equal(Core.nextRevision('Z'),'AA');

assert.equal(N2064.validateTransition(null,'#1').valid,true);
assert.equal(N2064.validateTransition(null,'0').valid,true);
assert.equal(N2064.validateTransition(null,'A').valid,false);
assert.equal(N2064.validateTransition('#2','0').valid,true);
assert.equal(N2064.validateTransition('0','01').valid,true);
assert.equal(N2064.validateTransition('A','A3').valid,true);
assert.equal(N2064.validateTransition('A','B').valid,true);
assert.equal(N2064.validateTransition('A','C').valid,true,'salto histórico vira alerta, não bloqueio');
assert.ok(N2064.validateTransition('A','C').warnings.length>0);

assert.equal(N2064.validateAction({action:'cancel',previouslyEmitted:false,document:'DOC'}).valid,false);
assert.equal(N2064.validateAction({action:'cancel',previouslyEmitted:true,document:'DOC'}).valid,true);
assert.equal(N2064.validateAction({action:'replace',previouslyEmitted:true,document:'DOC'}).valid,false);
assert.equal(N2064.validateAction({action:'replace',previouslyEmitted:true,document:'DOC',replacementDocument:'DOC-2'}).valid,true);
assert.equal(N2064.validateAction({action:'renumber',previouslyEmitted:true,document:'DOC',newDocument:'DOC-2',newRevision:'A'}).valid,false);
assert.equal(N2064.validateAction({action:'renumber',previouslyEmitted:true,document:'DOC',newDocument:'DOC-2',newRevision:'0'}).valid,true);
assert.equal(N2064.validateAction({action:'translate',newDocument:'DOC-PT'}).valid,false);
assert.equal(N2064.validateAction({action:'translate',newDocument:'DOC-PT',sourceRevision:'B'}).valid,true);
assert.ok(N2064.validateAction({purposeChanged:true}).warnings.some(x=>/caracteriza revisão/i.test(x)));

const versions=Versions.createVersionRegistry(Versions.SEED);
const current=versions.get('N-2064','body');
assert.equal(current.revision,'D');
assert.equal(current.catalogRevision,'D');
const promotion=versions.promotionDecision('N-2064','body');
assert.equal(promotion.allowed,false);
assert.equal(promotion.code,'unconfirmed');

console.log('n2064_revision_lifecycle: OK — Rev D reconhecida; #n/0n/A3/AA válidos; I/O são alerta; cancelamento, substituição, renumeração e tradução auditados.');
