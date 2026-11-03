import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {assistant} from './assistantStore';

type MascotHost = {presentIn?:(host:HTMLElement|null)=>boolean;show?:(state:string,options?:Record<string,unknown>)=>void};
const mascot=()=>((window as unknown as {GrconMascot?:MascotHost}).GrconMascot);
const generatorVisible=()=>{
 const panel=document.getElementById('allocation-generator-module');
 return Boolean(panel&&!panel.hidden);
};

/** One official mascot instance; its DOM moves between header, launcher and chat. */
export function RobotAuditorLauncher(){
 const chat=useSyncExternalStore(assistant.subscribe,assistant.snapshot);
 const [active,setActive]=useState(generatorVisible);
 const host=useRef<HTMLSpanElement>(null);

 useEffect(()=>{
  const panel=document.getElementById('allocation-generator-module');
  if(!panel)return;
  const observe=new MutationObserver(()=>setActive(generatorVisible()));
  observe.observe(panel,{attributes:true,attributeFilter:['hidden']});
  setActive(generatorVisible());
  return()=>observe.disconnect();
 },[]);

 useEffect(()=>{if(!active&&chat.open)assistant.close();},[active,chat.open]);

 useEffect(()=>{
  if(!active||chat.open||!host.current)return;
  mascot()?.presentIn?.(host.current);
  mascot()?.show?.('idle',{source:'allocation-preventive-launcher'});
  return()=>{mascot()?.presentIn?.(null);};
 },[active,chat.open]);

 if(!active||chat.open)return null;
 return <button type="button" className="aac-launcher"
   aria-label="Abrir Robô Auditor preventivo" title="Robô Auditor — confira antes de enviar à fiscalização"
   onClick={()=>assistant.show()}>
   <span ref={host} className="aac-launcher-mascot" aria-hidden="true"/>
   <span className="aac-launcher-caption">Auditar alocação</span>
 </button>;
}
