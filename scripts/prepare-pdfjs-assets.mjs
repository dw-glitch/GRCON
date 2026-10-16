// GRCON — Pacotes PDF.js locais; versão fixa, sem CDNs acessadas pelo usuário.
// Este preparo ocorre somente na geração/QA do bundle Cloudflare.
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
const VERSION="4.10.38";
const base="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/"+VERSION+"/";
const dir=path.resolve("assets/vendor/pdfjs");
const expected=Object.freeze({
  "pdf.min.mjs":"27fc2a057a00f92a4334ad06e17dbd7259912954e9fb7f76400bcca5fd190a9c",
  "pdf.worker.min.mjs":"1baa1844c89c80a5b2797c916e75ab29254be46d8e9cb53cb6364d7aad84be36"
});
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
const files=[["pdf.min.mjs","pdf.min.mjs"],["pdf.worker.min.mjs","pdf.worker.min.mjs"]];
async function fetchFile(from,to){
  const target=path.join(dir,to);
  try{const existing=await readFile(target);if(existing.byteLength>100000 && digest(existing)===expected[to]){console.log("PDF.js preparado:",to,digest(existing));return;}}catch(_){}
  let lastError;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(base+from,{signal:AbortSignal.timeout(45000)});
      if(!response.ok)throw new Error("HTTP "+response.status+" ao baixar "+from);
      const data=Buffer.from(await response.arrayBuffer());
      if(data.length<100000 || data.length>4500000)throw new Error("Tamanho inesperado do PDF.js: "+data.length);
      if(digest(data)!==expected[to])throw new Error("Falha na verificação SHA-256 de "+from+". Publicação bloqueada.");
      await writeFile(target,data,{flag:"w"});
      console.log("PDF.js preparado:",to,digest(data));
      return;
    }catch(error){lastError=error;await new Promise(resolve=>setTimeout(resolve,900*(attempt+1)));}
  }
  throw new Error("Não foi possível preparar o PDF.js "+VERSION+": "+lastError?.message);
}
await mkdir(dir,{recursive:true});
for(const [from,to] of files)await fetchFile(from,to);
