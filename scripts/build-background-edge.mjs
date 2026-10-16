import {mkdir,copyFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),out=new URL('supabase/functions/grcon-background-processor/generated/',root);
await mkdir(out,{recursive:true});
for(const name of ['discipline_resolver.js','grcon_contracts.js','core.js','history_core.js','posting_conference_core.js','posting_conference_refinement.js','egrdt_teams_trace_core.js','posting_conference_report.js'])await copyFile(new URL(name,root),new URL(name,out));
await writeFile(new URL('../deno.json',out),JSON.stringify({compilerOptions:{checkJs:false},nodeModulesDir:'auto'},null,2)+'\n');
console.log('Background Edge sources prepared from the current GRCON engines.');
