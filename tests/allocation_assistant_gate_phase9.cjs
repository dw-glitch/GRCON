'use strict';
// O Robô Auditor Preventivo vem habilitado para todos os contratos (não depende de cadastro).
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync('src/react/allocation/service.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function gate(state){
 const window={GrconCloud:{state},addEventListener(){},removeEventListener(){}};
 const context={exports:{},window,crypto:require('node:crypto').webcrypto,queueMicrotask,setTimeout,clearTimeout,console,Worker:class{}};
 vm.runInNewContext(source,context);return context.exports.service.assistantEnabled();
}
const m={contract_id:'uhdt-1',workspace_id:'w'};
assert.equal(gate({membership:m,contracts:[{contract_id:'uhdt-1',settings:{}}]}),true,'contrato sem nenhuma configuração');
assert.equal(gate({membership:m,contracts:[{contract_id:'uhdt-1',settings:{enabledModules:{allocationAuditAssistant:false}}}]}),true,'configuração antiga desmarcada não desliga');
assert.equal(gate({membership:m,contracts:[]}),true,'contratos ainda não carregados');
assert.equal(gate({}),true,'sem sessão: o launcher só aparece com o Gerador visível');
const admin=fs.readFileSync('contract_admin_app.js','utf8');
assert.ok(!/admin-contract-allocation-assistant/.test(admin),'cadastro do contrato não oferece mais a opção');
assert.match(admin,/enabledModules: \{ \.\.\.\(state\.editing\?\.settings\?\.enabledModules \|\| \{\}\), legacyUhdtRules: inherit \}/,'demais módulos do contrato preservados ao salvar');
console.log('allocation_assistant_gate_phase9: robô habilitado para todos os contratos; opção removida do cadastro; demais configurações preservadas');
