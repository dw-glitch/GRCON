import {createRoot} from 'react-dom/client';
import {IntelligencePanel} from './IntelligencePanel';
import {assistant} from './assistantStore';
import {mountReactIsland} from '../core/mount/mountReactIsland';
import {AllocationAuditorApp} from './AllocationAuditorApp';
import {AllocationAssistant} from './AllocationAssistant';
import {RobotAuditorLauncher} from './RobotAuditorLauncher';
import {service} from './service';
const g=window as unknown as Record<string,any>;
g.GrconAllocationAuditorUi=Object.freeze({activate:()=>{void service.activate().catch(()=>{});},open:(seed:Record<string,any>)=>service.open(seed),showAssistant:assistant.show,mountIntelligence:(host:HTMLElement,workspace:string)=>{const root=createRoot(host);root.render(<IntelligencePanel workspace={workspace}/>);return ()=>root.unmount();},clear:service.clear});
function mount(){
 const host=document.getElementById('grcon-allocation-auditor-root');
 // The old full-screen surface remains mountable only for isolated legacy regression tests.
 // Production mounts this root inside the Gerador de Alocação, not in a standalone module.
 const legacyFixture=Boolean(host?.closest('#allocation-auditor-module'));
 mountReactIsland({containerId:'grcon-allocation-auditor-root',islandName:'AllocationAuditor',
  element:legacyFixture?<AllocationAuditorApp/>:<><RobotAuditorLauncher/><AllocationAssistant/></>,
  notifyMessage:'Não foi possível iniciar o Robô Auditor.',
  fallback:<p role="alert">Reabra o Gerador de Alocação.</p>});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
