import {useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {assistant} from './assistantStore';
import {service} from './service';

type MascotHost = {
 presentIn?:(host:HTMLElement|null)=>boolean;
 show?:(state:string,options?:Record<string,unknown>)=>void;
};
const mascot=()=>((window as unknown as {GrconMascot?:MascotHost}).GrconMascot);
export const generatorVisible=()=>{
 const panel=document.getElementById('allocation-generator-module');
 return Boolean(panel&&!panel.hidden&&panel.getAttribute('aria-hidden')!=='true');
};
const launchAvailable=()=>{
 const bridge=window as unknown as {GrconAllocationGeneratorUi?:{assistantEnabled?:()=>boolean}};
 return generatorVisible()&&bridge.GrconAllocationGeneratorUi?.assistantEnabled?.()===true;
};

/**
 * The launcher is kept mounted while chat is open: removing its DOM host before
 * transferring the mascot could cause the official runtime to recreate its overlay.
 */
export function RobotAuditorLauncher(){
 const chat=useSyncExternalStore(assistant.subscribe,assistant.snapshot),svc=useSyncExternalStore(service.subscribe,service.snapshot);
 const [active,setActive]=useState(launchAvailable);
 const host=useRef<HTMLSpanElement>(null);

 useEffect(()=>{
  const panel=document.getElementById('allocation-generator-module');
  if(!panel)return;
  const refresh=()=>setActive(launchAvailable());
  const observe=new MutationObserver(refresh);
  observe.observe(panel,{attributes:true,attributeFilter:['hidden','aria-hidden']});
  for(const event of ['grcon:contract-context-changed','grcon:cloud-ready','grcon:cloud-signed-out'])
   window.addEventListener(event,refresh);
  refresh();
  return()=>{
   observe.disconnect();
   for(const event of ['grcon:contract-context-changed','grcon:cloud-ready','grcon:cloud-signed-out'])
    window.removeEventListener(event,refresh);
  };
 },[]);

 useEffect(()=>{
  if(!active&&chat.open)assistant.close();
 },[active,chat.open]);

 useLayoutEffect(()=>{
  let runtimeWatcher:MutationObserver|undefined;
  if(active&&!chat.open&&host.current){
   const present=()=>{
    if(!host.current?.isConnected||!mascot()?.presentIn)return false;
    mascot()?.presentIn?.(host.current);
    mascot()?.show?.('idle',{source:'allocation-preventive-launcher'});
    return true;
   };
   // The official v5 runtime is injected asynchronously by the legacy entrypoint.
   // Reclaim the mascot if its initialization finishes after the Generator opens.
   if(!present()){
    runtimeWatcher=new MutationObserver(()=>{
     if(present())runtimeWatcher?.disconnect();
    });
    runtimeWatcher.observe(document.documentElement,{
     attributes:true,attributeFilter:['data-grcon-mascot-runtime']
    });
   }
  }
  return()=>{
   runtimeWatcher?.disconnect();
   // Don't release the mascot while it is being handed to the chat.
   if(!launchAvailable())mascot()?.presentIn?.(null);
  };
 },[active,chat.open]);

 const complete=svc.rows.length>0&&svc.total>0&&svc.progress===svc.total;
 const open=complete?(svc.summary.errors||0)+(svc.summary.pending||0):0;
 const caption=svc.busy&&svc.total>0?'Auditando '+svc.progress+'/'+svc.total:svc.rows.length&&!complete?'Retomar auditoria':complete?'Ver resultado':'Auditar antes do envio';
 if(!active)return null;
 return <button type="button"
   className={'aac-launcher'+(chat.open?' aac-launcher-hidden':'')}
   aria-label="Abrir Robô Auditor preventivo"
   aria-controls="aac-panel"
   aria-expanded={chat.open}
   aria-hidden={chat.open}
   tabIndex={chat.open?-1:0}
   disabled={chat.open}
   title="Audite a alocação antes de enviar à fiscalização"
   onClick={()=>assistant.show()}>
   <span ref={host} className="aac-launcher-mascot" aria-hidden="true"/>
   <span className="aac-launcher-caption">{caption}{open>0&&<span className="aac-launcher-badge" aria-label={open+' documento(s) com erros ou pendências'}>{open}</span>}</span>
 </button>;
}
