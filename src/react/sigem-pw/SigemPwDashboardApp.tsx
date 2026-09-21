import { SigemPwHeader } from "./components/SigemPwHeader";
import { SigemPwReadiness } from "./components/SigemPwReadiness";
import { SigemPwBases } from "./components/SigemPwBases";
import { SigemPwSystemsSummary } from "./components/SigemPwSystemsSummary";
import { SigemPwSituationCards } from "./components/SigemPwSituationCards";
import { SigemPwListFilters } from "./components/SigemPwListFilters";
import { SigemPwTable } from "./components/SigemPwTable";
import { SigemPwPager } from "./components/SigemPwPager";
import { SigemPwBaseHistoryDialog } from "./components/SigemPwBaseHistoryDialog";
import { SigemPwBaseDateDialog } from "./components/SigemPwBaseDateDialog";
import { useSigemPwDashboard } from "./hooks/useSigemPwDashboard";
import { SIGEM_PW_LISTS, SIGEM_PW_PAGE_SIZE, type SigemPwDocumentClass, type SigemPwListKey } from "./types/domain";
function fmt(value:number):string{return Number(value||0).toLocaleString("pt-BR");}
export function SigemPwDashboardApp(){
 const {state,adapter}=useSigemPwDashboard(); const pageData=adapter.pageRows(); const activeLabel=SIGEM_PW_LISTS[state.activeList];
 return <><SigemPwHeader busy={state.busy} onEvolution={()=>{void adapter.openEvolution();}} onHistory={()=>{void adapter.openHistory();}} onExport={()=>{void adapter.exportCurrentList();}}/>
 <div className="spw-progress" id="spw-progress" hidden={!state.busy}><i></i><span>{state.progressMessage||"Processando base…"}</span></div>
 <SigemPwReadiness readiness={state.readiness}/>
 <SigemPwBases state={state} onImportSigem={(file)=>{void adapter.importSigem(file);}} onImportPw={(file)=>{void adapter.importPw(file);}} onImportLd={(file)=>{void adapter.importLd(file);}} onEditDate={(system)=>adapter.openBaseDateEditor(system)}/>
 <SigemPwSystemsSummary state={state}/><SigemPwSituationCards state={state}/>
 <section className="spw-list-card"><header className="spw-list-head"><div><span className="spw-kicker">RELAÇÃO DETALHADA</span><strong id="spw-list-title">{activeLabel}</strong><small>Cada código + revisão entra em uma única situação, sem sobreposição entre os cinco totais.</small></div></header>
 <div className="spw-list-tabs" id="spw-list-tabs">{(Object.entries(SIGEM_PW_LISTS) as Array<[SigemPwListKey,string]>).map(([key,label])=><button key={key} type="button" data-list={key} className={state.activeList===key?"active":""} onClick={()=>adapter.setActiveList(key)}>{label} · {fmt(state.result?.lists?.[key]?.length||0)}</button>)}</div>
 <SigemPwListFilters query={state.filters.query} documentClass={state.filters.documentClass} busy={state.busy} onQuery={(value)=>adapter.setQuery(value)} onClass={(value:SigemPwDocumentClass)=>adapter.setDocumentClass(value)} onClear={()=>adapter.clearFilters()}/>
 <SigemPwTable rows={pageData.visible} caption={activeLabel}/>
 <SigemPwPager page={state.page} pages={pageData.pages} total={pageData.rows.length} start={pageData.start} pageSize={SIGEM_PW_PAGE_SIZE} onPage={(page)=>adapter.setPage(page)}/>
 </section>
 <SigemPwBaseHistoryDialog state={state} onClose={()=>adapter.closeHistory()} onEdit={(kind,id)=>adapter.openBaseDateEditor(kind,id)} onDelete={(id)=>{void adapter.removeSnapshot(id);}}/>
 <SigemPwBaseDateDialog state={state} onClose={()=>adapter.closeBaseDateEditor()} onChange={(value)=>adapter.setBaseDateValue(value)} onSave={()=>{void adapter.saveBaseDate();}}/>
 </>;
}