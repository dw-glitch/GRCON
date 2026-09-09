const assert = require("node:assert/strict");
require("../grcon_utils.js");
require("../core.js");
const Inventory = require("../projectwise_inventory_core.js");
const Recon = require("../projectwise_reconciliation_core.js");

const A = "C1O_RNEST_U32_1.1.1.1_TUB_REP_VM-123456";
const B = "C1O_RNEST_U32_1.1.1.2_TUB_REP_VM-123456";
const OTHER_TYPE = "C1O_RNEST_U32_1.1.1.1_TUB_RUFF_VM-123456";
function sigem(document=A, revision="B", extra={}) { return Inventory.enrichIdentity({ document, revision, status:"Em Workflow", title:"Documento teste", discipline:"TUB", ...extra }); }
function pw(document=A, revision="B", id="pw-1", extra={}) { return Inventory.enrichIdentity({ document, revision, id, folderPath:"/RNEST/U32/TUB", ...extra }); }

let result = Recon.reconcile([sigem(A,"B")],[pw(A,"B")],{liveWriteEnabled:false});
assert.equal(result.rows[0].status, Recon.STATUSES.SAME_REVISION);
assert.equal(result.summary.sameRevision, 1);

result = Recon.reconcile([sigem(A,"B")],[pw(B,"B")],{liveWriteEnabled:false});
assert.equal(result.rows[0].status, Recon.STATUSES.NOT_FOUND, "mesmo TAG em outro EAP não pode conciliar");

result = Recon.reconcile([sigem(A,"B")],[pw(OTHER_TYPE,"B")],{liveWriteEnabled:false});
assert.equal(result.rows[0].status, Recon.STATUSES.NOT_FOUND, "REP nunca pode casar com RUFF");

result = Recon.reconcile([sigem(A,"C",{fileName:`${A}_C.pdf`})],[pw(A,"B")],{liveWriteEnabled:false});
assert.equal(result.rows[0].status, Recon.STATUSES.PW_OLDER);
assert.equal(result.rows[0].action, Recon.ACTIONS.NEW_REVISION);
assert.equal(result.rows[0].automaticReady, false);
assert.ok(result.rows[0].blockers.includes("INTEGRACAO_PROJECTWISE_NAO_AUTORIZADA"));

result = Recon.reconcile([sigem(A,"B")],[pw(A,"C")],{liveWriteEnabled:false});
assert.equal(result.rows[0].status, Recon.STATUSES.PW_NEWER);
assert.equal(result.rows[0].action, Recon.ACTIONS.MANUAL_REVIEW);

result = Recon.reconcile([sigem(A,"B")],[pw(A,"B","pw-1",{folderPath:"/A"}),pw(A,"B","pw-2",{folderPath:"/B"})],{liveWriteEnabled:false});
assert.equal(result.rows[0].status, Recon.STATUSES.POSSIBLE_DUPLICATE);

result = Recon.reconcile([sigem(A,"B")],[pw(A,"A","pw-1"),pw(A,"B","pw-1")],{liveWriteEnabled:false});
assert.equal(result.rows[0].status, Recon.STATUSES.SAME_REVISION, "versões do mesmo ID não são duplicidade");

result = Recon.reconcile([sigem(A,"B")],[pw("RHDD-RIR-QTM-EX-GERA-TUB-PT-2026","B","pw-map",{sigemCode:A,eap:"1.1.1.1",documentType:"REP",tag:"VM-123456",taxonomy:"RHDD-RIR-QTM"})],{liveWriteEnabled:false});
assert.equal(result.rows[0].status, Recon.STATUSES.SAME_REVISION);
assert.equal(result.rows[0].matchSource, "MAPEAMENTO_EXPLICITO");
assert.equal(result.rows[0].pwTaxonomy, "RHDD-RIR-QTM");

const INVALID = "C1O_RNEST_U32_1.1.1_TUB_REP_VM-123456";
result = Recon.reconcile([sigem(INVALID,"B")],[],{liveWriteEnabled:false});
assert.equal(result.rows[0].status, Recon.STATUSES.INVALID_CODE);

result = Recon.reconcile([sigem(A,"C")],[pw(A,"B")],{liveWriteEnabled:false});
const dry = Recon.dryRun(result.rows);
assert.equal(dry.length, 1);
assert.equal(dry[0].executable, false);
assert.ok(dry[0].blockers.includes("AGUARDANDO_ARQUIVO"));
assert.ok(dry[0].blockers.includes("INTEGRACAO_PROJECTWISE_NAO_AUTORIZADA"));

const manyPw=[], manySigem=[];
for(let i=0;i<20000;i+=1){const code=`C1O_RNEST_U32_1.1.1.1_TUB_REP_VM-${String(i).padStart(6,"0")}`;manyPw.push(pw(code,"A",`pw-${i}`));manySigem.push(sigem(code,"A"));}
const started=Date.now();
result=Recon.reconcile(manySigem,manyPw,{liveWriteEnabled:false});
assert.equal(result.summary.sameRevision,20000);
assert.ok(Date.now()-started<12000,`conciliação de 20k excedeu 12s: ${Date.now()-started}ms`);
console.log("projectwise_reconciliation: ok");