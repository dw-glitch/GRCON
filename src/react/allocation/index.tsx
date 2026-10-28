import {mountReactIsland} from '../core/mount/mountReactIsland';
import {AllocationApp} from './AllocationApp';
import {service} from './service';
declare global {interface Window {GrconAllocationGeneratorUi?:{activate:()=>void;open:(seed:{document:string;revision:string})=>void;clear:()=>void};}}
(window as unknown as Record<string,any>).GrconAllocationGeneratorUi=Object.freeze({activate:()=>{void service.refresh().catch(()=>{});},open:(seed:{document:string;revision:string})=>{void service.open(seed);},auditCurrent:()=>service.auditCurrent(true),auditContext:()=>service.auditContext(),auditSavedRun:(run:any)=>service.auditSavedRun(run),importAuditLd:(files:File[])=>service.importAuditLd(files),generateAudited:(rows:any[],events:any[],versions:any)=>service.generateAudited(rows,events,versions),reviseAuditLd:(file:File,rows:any[],events:any[])=>service.reviseAuditLd(file,rows,events),clear:service.clear});
function mount(){mountReactIsland({containerId:'grcon-allocation-root',islandName:'AllocationGenerator',element:<AllocationApp/>,notifyMessage:'Não foi possível abrir o Gerador de Alocação.',fallback:<p role="alert">Reabra o Gerador de Alocação.</p>});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();

