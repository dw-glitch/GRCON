'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const vm=require('node:vm');
(async()=>{
 const cloud=fs.readFileSync('grcon_cloud_app.js','utf8');
 const context={window:{GRCON_CLOUD_CONFIG:{},GrconHistory:null},navigator:{onLine:true}};
 vm.createContext(context);vm.runInContext(cloud.replace(/\n  init\(\);\n\}\)\(\);\s*$/, '\n window.__test={passwordProblem,adminPasswordFormProblem,canManageMembers,state};\n})();'),context);
 const api=context.window.__test;
 for(const role of ['owner','admin','operator','viewer']){api.state.membership={role,workspace_id:'w'};assert.equal(api.canManageMembers(),false,'a role alone never grants master');}
 api.state.session={user:{id:'m'}};api.state.masterOwner=true;api.state.masterOwnerUserId='m';assert.equal(api.canManageMembers(),true);
 api.state.session={user:{id:'other'}};assert.equal(api.canManageMembers(),false,'a previous session cannot reuse master grant');
 for(const [password,pattern] of [['Curta1!',/12 caracteres/],['senhafraca123!',/maiúscula/],['SENHAFRACA123!',/minúscula/],['SenhaSemNumero!',/número/],['NovaSenha1234',/símbolo/]]) assert.match(api.passwordProblem(password),pattern);
 assert.equal(api.passwordProblem('NovaSenha123!'),'');assert.match(api.adminPasswordFormProblem('NovaSenha123!','OutraSenha123!'),/coincidem/);
 const policy=await import(pathToFileURL(path.resolve('supabase/functions/owner-change-user-password/policy.mjs')));
 const w='workspace';const base={authenticated:true,isMasterOwner:true,targetExists:true,targetIsMaster:false,workspaceId:w};
 for(const role of ['owner','admin','operator','viewer']){
   assert.equal(policy.authorizePasswordChange({...base,targetMemberships:[{workspace_id:w,role,active:true}]}).ok,true);
   assert.equal(policy.authorizePasswordChange({...base,isMasterOwner:false,actorMembership:{workspace_id:w,role,active:true}}).status,403);
 }
 assert.equal(policy.authorizePasswordChange({...base,targetIsMaster:true,targetMemberships:[{workspace_id:w,role:'owner',active:true}]}).code,'MASTER_OWNER_PROTECTED');
 assert.equal(policy.authorizePasswordChange({...base,targetIsMaster:undefined,targetMemberships:[{workspace_id:w,role:'operator'}]}).status,403,'unknown protected target fails closed');
 assert.equal(policy.authorizePasswordChange({...base,targetMemberships:[{workspace_id:'other',role:'operator',active:true}]}).code,'TARGET_OUTSIDE_WORKSPACE');
 assert.equal(policy.authorizePasswordChange({...base,targetExists:false}).status,404);
 assert.equal(policy.authorizePasswordChange({...base,authenticated:false}).status,401);
 assert.equal(policy.passwordProblem('NovaSenha123!'),'');
 const edge=fs.readFileSync('supabase/functions/owner-change-user-password/index.ts','utf8');
 assert.match(edge,/admin\.auth\.getUser\(tokenMatch\[1\]\)/);assert.match(edge,/caller\.rpc\("grcon_is_master_owner"\)/);
 assert.match(edge,/targetIsMaster: targetUserId === actorId/);assert.match(edge,/auth\.admin\.updateUserById/);
 assert.match(edge,/action: "user_password_changed"/);assert.doesNotMatch(edge,/metadata:\s*\{[^}]*password/is);
 assert.doesNotMatch(edge,/console\.(log|error|warn|debug)/);assert.match(edge,/Cache-Control": "no-store"/);
 assert.match(cloud,/functions\.invoke\("owner-change-user-password"/);assert.match(cloud,/workspaceId: target\.workspaceId \|\| state\.membership\.workspace_id/);
 assert.match(cloud,/autocomplete="new-password"/);assert.match(cloud,/event\.key !== "Tab"/);
 assert.doesNotMatch(cloud,/data-member-password=/,'no password actions in the account menu');
 const admin=fs.readFileSync('contract_admin_app.js','utf8');assert.match(admin,/data-admin-password/);assert.doesNotMatch(admin,/<option value="master/);
 console.log('Master password management: live capability, session isolation, protected master, owners as targets, workspace checks, strength, safe audit and exclusive screen passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
