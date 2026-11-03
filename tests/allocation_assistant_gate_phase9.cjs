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
// Aparência do robô flutuante: somente o mascote oficial do runtime, sem imagem/ícone próprio.
const launcher=fs.readFileSync('src/react/allocation-auditor/RobotAuditorLauncher.tsx','utf8'),chat=fs.readFileSync('src/react/allocation-auditor/AllocationAssistant.tsx','utf8'),css=fs.readFileSync('allocation-auditor.css','utf8');
assert.match(launcher,/mascot\(\)\?\.presentIn\?\.\(host\.current\)/,'o lançador entrega o host ao runtime oficial do mascote');
for(const [name,src] of [['lançador',launcher],['chat',chat]])assert.ok(!/<img\b|<svg\b|\.png|\.webp|\.gif|emoji|🤖/i.test(src),name+' não desenha mascote próprio');
assert.match(css,/\.aac-launcher #grcon-mascot-context-bubble\{display:none!important\}/,'balão de saudação não deforma o lançador');
assert.match(css,/\.aac-launcher #grcon-context-mascot\.grcon-mascot-runtime\{width:104px;height:104px\}/,'tamanho do mascote no lançador');
console.log('allocation_assistant_gate_phase9: lançador usa o mascote oficial do runtime, sem balão e com tamanho definido');
assert.match(css,/\.aac-launcher-caption\{[^}]*width:max-content/,'a borda da legenda acompanha o texto');
// Excluir análise e anexar-substitui estão expostos na interface e no Gerador.
assert.match(chat,/Nova auditoria/);assert.match(chat,/Excluir análise \(manter LDs\)/);assert.match(chat,/Excluir análise e LDs/);
assert.match(fs.readFileSync('src/react/allocation/index.tsx','utf8'),/clearAuditLd:\(\)=>service\.clearAuditLd\(\)/);
assert.match(fs.readFileSync('src/react/allocation-auditor/service.ts','utf8'),/Nova análise iniciada: as alocações anteriores foram substituídas/);
console.log('allocation_assistant_gate_phase9: excluir análise e anexar-substitui expostos');
