import {mountReactIsland} from '../core/mount/mountReactIsland';
import {TitleCorrectorApp} from './TitleCorrectorApp';
declare global {interface Window {GrconTitleCorrectorUi?:{activate:()=>void};}}
window.GrconTitleCorrectorUi=Object.freeze({activate:()=>{}});
function mount():void{
 mountReactIsland({containerId:'grcon-title-corrector-root',islandName:'TitleCorrector',
 element:<TitleCorrectorApp/>,notifyMessage:'O Corretor de Títulos encontrou um erro inesperado.',
 fallback:<p role="alert">Não foi possível abrir o Corretor de Títulos. Os demais módulos permanecem disponíveis.</p>});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
