import {createRoot} from 'react-dom/client';
import {IntelligencePanel} from './IntelligencePanel';
import {assistant} from './assistantStore';
import {mountReactIsland} from '../core/mount/mountReactIsland';
import {AllocationAuditorApp} from './AllocationAuditorApp';
import {service} from './service';
const g=window as unknown as Record<string,any>;
g.GrconAllocationAuditorUi=Object.freeze({activate:()=>{void service.activate().catch(()=>{});},open:(seed:Record<string,any>)=>service.open(seed),showAssistant:assistant.show,mountIntelligence:(host:HTMLElement,workspace:string)=>{const root=createRoot(host);root.render(<IntelligencePanel workspace={workspace}/>);return ()=>root.unmount();},clear:service.clear});
function mount(){mountReactIsland({containerId:'grcon-allocation-auditor-root',islandName:'AllocationAuditor',element:<AllocationAuditorApp/>,notifyMessage:'Não foi possível abrir o Auditor de Alocações.',fallback:<p role="alert">Reabra o Auditor de Alocações.</p>});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
