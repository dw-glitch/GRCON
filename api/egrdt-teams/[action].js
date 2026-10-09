'use strict';
module.exports=async(req,res)=>{
 const {handleTraceRoute}=await import('../../cloudflare/teams-traceability.mjs');
 const path=new URL(req.url,'https://grcon.local').pathname;
 const init={method:req.method,headers:req.headers};
 if(req.method==='POST'){
  let raw='';
  if(req.body)raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
  else for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>128000){res.statusCode=413;return res.end();}}
  init.body=raw;
 }
 const response=await handleTraceRoute(new Request('https://grcon.local'+path+(req.url.includes('?')?'?'+req.url.split('?')[1]:''),init),process.env);
 res.statusCode=response?.status || 404;
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 res.end(response?await response.text():'{}');
};
