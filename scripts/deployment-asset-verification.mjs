import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifyPublishedAsset(fetcher,expected,{label='asset',attempts=6,pause=()=>new Promise(resolve=>setTimeout(resolve,3000))}={}){
 const wanted=digest(expected);let status=0,actual='',failure;
 for(let attempt=0;attempt<attempts;attempt++){
  try{const response=await fetcher(attempt);status=response.status;if(status===200){actual=digest(Buffer.from(await response.arrayBuffer()));if(actual===wanted)return;}failure=null;}catch(error){failure=error;}
  if(attempt<attempts-1)await pause();
 }
 if(failure)throw failure;
 assert.equal(status,200,'Arquivo publicado indisponível: '+label);
 assert.equal(actual,wanted,'Arquivo publicado difere do pacote validado após aguardar a propagação: '+label);
}
