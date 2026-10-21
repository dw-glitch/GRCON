import {mountReactIsland} from '../core/mount/mountReactIsland';
import {AllocationApp} from './AllocationApp';
import {service} from './service';
declare global {interface Window {GrconAllocationGeneratorUi?:{activate:()=>void;open:(seed:{document:string;revision:string})=>void;clear:()=>void};}}
window.GrconAllocationGeneratorUi=Object.freeze({activate:()=>{void service.refresh().catch(()=>{});},open:seed=>{void service.open(seed);},clear:service.clear});
function mount(){mountReactIsland({containerId:'grcon-allocation-root',islandName:'AllocationGenerator',element:<AllocationApp/>,notifyMessage:'Não foi possível abrir o Gerador de Alocação.',fallback:<p role="alert">Reabra o Gerador de Alocação.</p>});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
