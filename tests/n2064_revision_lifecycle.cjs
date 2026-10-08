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
assert.equal(N2064.validateTransition('#1','#2').valid,true);
assert.equal(N2064.validateTransition('A1','A2').valid,true);
assert.equal(N2064.validateTransition('01','02').valid,true);
assert.equal(N2064.validateTransition('A1','B1').valid,false);
assert.equal(N2064.validateTransition('0','01').valid,true);
assert.equal(N2064.validateTransition('A','A3').valid,true);
assert.equal(N2064.validateTransition('A','B').valid,true);
assert.equal(N2064.validateTransition('A','C').valid,true,'salto histórico vira alerta, não bloqueio');
assert.ok(N2064.validateTransition('A','C').warnings.length>0);

assert.equal(N2064.validateAction({action:'cancel',previouslyEmitted:false,document:'DOC'}).valid,false);
assert.equal(N2064.validateAction({action:'cancel',previouslyEmitted:true,document:'DOC'}).valid,true);
assert.equal(N2064.validateAction({action:'cancel',document:'DOC'}).valid,true,'histórico desconhecido não prova ausência de emissão');
assert.ok(N2064.validateAction({action:'cancel',document:'DOC'}).warnings.length);
assert.equal(N2064.validateAction({action:'replace',previouslyEmitted:true,document:'DOC'}).valid,false);
assert.equal(N2064.validateAction({action:'replace',previouslyEmitted:true,document:'DOC',replacementDocument:'DOC-2'}).valid,true);
assert.equal(N2064.validateAction({action:'renumber',previouslyEmitted:true,document:'DOC',newDocument:'DOC-2',newRevision:'A'}).valid,false);
assert.equal(N2064.validateAction({action:'renumber',previouslyEmitted:true,document:'DOC',newDocument:'DOC-2',newRevision:'0'}).valid,true);
assert.equal(N2064.validateAction({action:'renumber',previouslyEmitted:true,document:'DOC',newDocument:'doc',newRevision:'0'}).valid,false);
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

const History=require('../history_core.js');
const RevisionControl=require('../grcon_revision_control.js');
const Reposting=require('../grcon_reposting_core.js');
const doc='RL-5290.00-22313-91B-C1O-002';
for(const revision of ['#1','#2','01','02','A1','AA','I','O']){
  const name=`${doc}_0001_${revision}.pdf`;
  assert.equal(Core.revisionFromName(name,doc),revision);
  assert.equal(Core.revisionFromText(`${doc} REVISÃO: ${revision}`,doc),revision);
  assert.equal(History.generatedRevision({document:doc,finalName:name}),revision);
  assert.equal(Reposting.revisionFromName(name,doc),revision);
  assert.equal(RevisionControl.validRevision(revision),true);
  assert.equal(Core.proposedFileName(name,doc,'B','N-1710'),`${doc}_0001_B.pdf`);
}
assert.equal(Core.revisionFromName(`${doc}_RIR.pdf`,doc),'','RIR permanece sufixo operacional');
assert.equal(Core.claimedRevisionFromName(`${doc}_0001.pdf`,doc),'','0001 é identificador da folha, não revisão');
