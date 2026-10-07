import { DocumentClassBadge } from "../../core/ui/DocumentClassBadge";
import type { SigemPwClassSummary, SigemPwState } from "../types/domain";

function fmt(value:number):string{return Number(value||0).toLocaleString("pt-BR");}
function classRow(state:SigemPwState,name:string):SigemPwClassSummary{return state.result?.classes.find((row)=>row.documentClass===name)||{documentClass:name,sigem:0,pwRegistered:0,pwEmitted:0,gapSigemToPw:0,gapPwToEmitted:0,pwExclusive:0,matched:0};}

export function SigemPwSystemsSummary({state}:{state:SigemPwState}) {
 const s=state.result?.summary,et=classRow(state,"ET"),n=classRow(state,"N-1710");
 const revision0=state.revisionScope==="revision0";
 const scopeTitle=revision0?"Rev. 0":"Todas as revisões";
 const sigemNote=revision0?"Ocorrências de cadastro inicial na Consulta Geral.":"Ocorrências independentes por código + revisão.";
 const pwNote=revision0?"Cadastros e emissões do PW somente em revisão 0.":"Cadastros e emissões por código + revisão.";

 return <section className="spw-system-grid" id="spw-system-grid" aria-label={`Totais SIGEM e ProjectWise — ${scopeTitle}`}>
  <article className="spw-system-card sigem"><div className="spw-system-head"><div><span className="spw-kicker">CONSULTA GERAL</span><h3>SIGEM — {scopeTitle}</h3><small>{sigemNote}</small></div><div className="spw-system-total"><span>{scopeTitle}</span><strong>{state.sigem.meta?fmt(s?.sigem||0):"—"}</strong></div></div><div className="spw-system-split"><div data-document-class="ET"><DocumentClassBadge value="ET" /><strong>{state.sigem.meta?fmt(et.sigem):"—"}</strong></div><div data-document-class="N-1710"><DocumentClassBadge value="N-1710" /><strong>{state.sigem.meta&&state.ld.meta?fmt(n.sigem):"—"}</strong></div></div></article>
  <article className="spw-system-card pw"><div className="spw-system-head"><div><span className="spw-kicker">RELAÇÃO PROJECTWISE</span><h3>ProjectWise — {scopeTitle}</h3><small>{pwNote}</small></div><div className="spw-system-total"><span>Cadastrados — {scopeTitle}</span><strong>{state.pw.meta?fmt(s?.pwRegistered||0):"—"}</strong></div></div><div className="spw-system-split"><div data-document-class="ET"><DocumentClassBadge value="ET" /><strong>{state.pw.meta?fmt(et.pwRegistered):"—"}</strong></div><div data-document-class="N-1710"><DocumentClassBadge value="N-1710" /><strong>{state.pw.meta&&state.ld.meta?fmt(n.pwRegistered):"—"}</strong></div><div><span>Emitidos — {scopeTitle}</span><strong>{state.pw.meta?fmt(s?.pwEmitted||0):"—"}</strong></div><div><span>Não emitidos — {scopeTitle}</span><strong>{state.pw.meta?fmt(s?.gapPwToEmitted||0):"—"}</strong></div></div></article>
 </section>;
}
