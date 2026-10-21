'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../grcon_cloud_app.js'),'utf8');
const start=source.indexOf('  const REALTIME_POLL_MS'),end=source.indexOf('  async function activateSession',start);
assert.ok(start>=0&&end>start);
const stored=new Map();let clock=1_800_000_000_000;
class Clock extends Date{static now(){return clock;}}
function instance(project='https://project.test'){
 let id=0,channels=0,pulls=0,disconnects=0,callback;
 const timers=new Map(),intervals=new Map(),events=[];
 const state={online:true,membership:{workspace_id:'contract-a'},realtimeStatus:'parado',realtimeFailures:0,realtimeRetryLevel:0,realtimeAttemptId:0,realtimeCircuitOpenUntil:0,onlineUserIds:new Set()};
 const channel={on(){return this;},subscribe(fn){callback=fn;return this;},presenceState(){return {};}};
 state.client={channel(){channels++;return channel;},removeChannel(){return Promise.resolve();},realtime:{disconnect(){disconnects++;}}};
 const window={setTimeout(fn,ms){timers.set(++id,{fn,ms});return id;},clearTimeout(n){timers.delete(n);},setInterval(fn,ms){intervals.set(++id,{fn,ms});return id;},clearInterval(n){intervals.delete(n);},dispatchEvent(e){events.push(e);}};
 const api=new Function('state','Config','window','document','scheduleSync','updateAccountMenu','updateMembersOnlineStatus','readJson','writeJson','removeStored','Date','console',source.slice(start,end)+';return {subscribeRealtime,dropRealtime};')(
  state,{projectUrl:project},window,{hidden:false},()=>pulls++,()=>{},()=>{},(key,fallback)=>stored.get(key)??fallback,(key,value)=>stored.set(key,value),key=>stored.delete(key),Clock,{info(){}}
 );
 return {state,api,timers,intervals,fail:()=>callback('CHANNEL_ERROR'),success:()=>callback('SUBSCRIBED'),counts:()=>({channels,pulls,disconnects})};
}
const first=instance();first.api.subscribeRealtime();assert.equal(first.counts().channels,1);const beforeFailure=first.counts().disconnects;first.fail();
assert.equal(first.state.realtimeStatus,'indisponivel');assert.equal(first.counts().disconnects,beforeFailure+1);assert.equal(first.counts().pulls,1);
assert.equal(first.intervals.size,1);assert.equal([...first.intervals.values()][0].ms,45000);
first.fail();assert.equal(first.counts().disconnects,beforeFailure+1,'late channel callbacks cannot reopen the transport');
first.api.subscribeRealtime({force:true});assert.equal(first.counts().channels,1,'tab/forced refresh respects cooldown');
const reopened=instance();reopened.api.subscribeRealtime();assert.equal(reopened.counts().channels,0,'reload keeps the failed socket closed');
assert.equal(reopened.counts().pulls,1,'HTTP sync resumes immediately after reload');
[...reopened.intervals.values()][0].fn();assert.equal(reopened.counts().pulls,2,'periodic HTTP sync remains active');
assert.equal(reopened.timers.size,1,'only one bounded retry is scheduled');
reopened.api.subscribeRealtime();assert.equal(reopened.timers.size,1);
clock+=60*60*1000+1;[...reopened.timers.values()][0].fn();assert.equal(reopened.counts().channels,1,'transport is retried after expiry');
reopened.success();assert.equal(reopened.intervals.size,0);assert.equal(stored.size,0,'success clears the persisted network cooldown');
const offline=instance();offline.state.online=false;offline.api.subscribeRealtime();assert.equal(offline.counts().channels,0);
stored.set('grcon.cloud.realtime-circuit.v1:https://project.test',clock+1000*60*60*24);
const invalid=instance();invalid.api.subscribeRealtime();assert.equal(invalid.counts().channels,1,'invalid/unbounded storage cannot disable Realtime forever');
console.log('Realtime: transport failure, immediate HTTP, reload/visibility cooldown, late callbacks, bounded retry, success cleanup and offline passed.');
