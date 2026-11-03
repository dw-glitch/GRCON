'use strict';
// Phase 2 static safety contracts; browser and video playback require separate smoke tests.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const launcher=read('src/react/allocation-auditor/RobotAuditorLauncher.tsx');
const chat=read('src/react/allocation-auditor/AllocationAssistant.tsx');
const css=read('allocation-auditor.css');
const runtime=read('grcon_mascot_controller_v4.js');
const bootstrap=read('grcon_mascot_controller.js');
const html=read('index.html');

assert.match(launcher,/if\(!active\)return null/,'Only an inactive/unauthorized Generator removes the launcher');
assert.doesNotMatch(launcher,/if\(!active\|\|chat\.open\)return null/,'Chat opening must not detach the mascot host');
assert.match(launcher,/aac-launcher-hidden/,'Launcher stays connected but invisible while chat owns mascot');
assert.match(launcher,/aria-controls="aac-panel"/);
assert.match(launcher,/aria-expanded=\{chat\.open\}/);
assert.match(launcher,/aria-label="Abrir Robô Auditor preventivo"/);
assert.match(launcher,/launchAvailable\(\)/,'Visibility is tied to both Generator and contract');
assert.match(launcher,/GrconAllocationGeneratorUi\?\.assistantEnabled\?\.\(\)/,'Contract feature gate');
assert.match(launcher,/grcon:contract-context-changed/);
assert.match(launcher,/grcon:cloud-signed-out/);
assert.match(launcher,/presentIn/);
assert.match(launcher,/data-grcon-mascot-runtime/,'Runtime may load after the Generator');
assert.match(launcher,/if\(!launchAvailable\(\)\)mascot\(\)\?\.presentIn\?\.\(null\)/,'Return mascot on exit or disabled contract');

assert.match(chat,/id="aac-panel"/);
assert.match(chat,/aria-modal=\{false\}/);
assert.match(chat,/useLayoutEffect/,'Transfer mascot before paint');
assert.match(chat,/querySelector<HTMLElement>\('\.aac-launcher-mascot'\)/,'Return mascot to existing launcher');
assert.match(chat,/data-grcon-mascot-runtime/,'Chat handles late mascot initialization');
assert.match(chat,/show\?\.\('hello'/,'Official hello state');
assert.match(chat,/show\?\.\('analyzing'/,'Official busy state');
assert.match(chat,/show\?\.\('warning'/,'Official warning state');
assert.match(chat,/show\?\.\('success'/,'Official success state');
assert.match(chat,/viewport\.scrollTop=viewport\.scrollHeight/,'Chat scrolling must not reposition the Generator');
assert.doesNotMatch(chat,/key==='Tab'/,'No modal focus trap');

assert.match(css,/\.aac-launcher-hidden\{visibility:hidden;pointer-events:none\}/);
assert.match(css,/\.aac-backdrop\{position:fixed;inset:0;z-index:12000;background:transparent/);
assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
assert.match(css,/safe-area-inset-bottom/);
assert.match(runtime,/function presentIn\(host\)/);
assert.match(bootstrap,/grcon_mascot_controller_v4\.js/);
assert.match(html,/src="grcon_mascot_controller\.js"/);
for(const state of ['hello','analyzing','warning','success']){
 assert.match(runtime,new RegExp('grcon-mascot-'+state+'-alpha\\.webm'),'Use official '+state+' asset');
}
console.log('allocation-auditor mascot phase 2: static contracts passed');
