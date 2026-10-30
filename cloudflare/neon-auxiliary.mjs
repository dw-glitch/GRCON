import {neon} from '@neondatabase/serverless';
// Backend-only, optional integration. No dataset is routed to Neon implicitly.
export async function neonStatus(env, connect=neon) {
 const connection=String(env.NEON_DATABASE_URL||'').trim();
 if(!connection)return {configured:false,connected:false,ready:false,error:'NEON_NOT_CONFIGURED'};
 try {
  const url=new URL(connection);
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.username||!url.password||!/^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/.test(url.hostname)||url.pathname.length<2)throw Error();
 } catch {return {configured:true,connected:false,ready:false,error:'NEON_CONFIGURATION_INVALID'};}
 try {
  const sql=connect(connection,{fetchOptions:{signal:AbortSignal.timeout(15000),redirect:'manual'}});
  const [result]=await sql`SELECT to_regclass('grcon_auxiliary.snapshots') IS NOT NULL AND to_regclass('grcon_auxiliary.rows') IS NOT NULL AS ready`;
  return {configured:true,connected:true,ready:result?.ready===true};
 } catch {return {configured:true,connected:false,ready:false,error:'NEON_UNAVAILABLE'};}
}
