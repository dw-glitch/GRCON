import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {service,type Data} from './service';
export function IntelligencePanel({workspace}:{workspace:string}){
 const [history,setHistory]=useState<Record<string,Data[]>>({}),[rules,setRules]=useState<Data[]>([]);
 const [instruction,setInstruction]=useState(''),[chosen,setChosen]=useState(''),[homologation,setHomologation]=useState('');
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[tests,setTests]=useState<Data[]>([]);
 const [caseRun,setCaseRun]=useState(''),[caseRows,setCaseRows]=useState<Data[]>([]),[casePage,setCasePage]=useState(0);
 const s=useSyncExternalStore(service.subscribe,service.snapshot),g=window as unknown as Data,scope=useRef(0);
 const same=workspace===g.GrconCloud.state.membership?.workspace_id;
 const call=async(operation:string,input:Data={})=>{
  const c=g.GrconCloud.state,ticket=c.session.user.id;
  const result=await c.client.rpc('grcon_allocation_assistant',{target_workspace:workspace,operation,input});
  if(ticket!==g.GrconCloud.state.session?.user?.id)throw Error('Conta alterada.');
  if(result.error)throw Error(result.error.message);return result.data;
 };
 const refresh=async()=>setRules((await call('rules')).rules);
 const act=async(fn:()=>Promise<unknown>)=>{const ticket=scope.current;setBusy(true);setMessage('');try{await fn();if(ticket===scope.current)await refresh();}catch(e){if(ticket===scope.current)setMessage((e as Error).message);}finally{if(ticket===scope.current)setBusy(false);}};
 useEffect(()=>{scope.current++;setTests([]);setCaseRows([]);setHistory({});setChosen('');setInstruction('');setHomologation('');void act(refresh);},[workspace]);
 const options=s.rows.flatMap(row=>(row.recommendations||[]).filter((p:Data)=>g.GrconAllocationAssistant.editable(p.field)).map((proposal:Data)=>({row,proposal,key:JSON.stringify([row.lineage,proposal.field])})));
 const loadCases=async(id:string,page:number)=>{const ticket=scope.current;const data=await service.historyRows(id,page*200);if(ticket!==scope.current)return;setCaseRun(id);setCasePage(page);setCaseRows(data.rows);};
 const label=(row:Data,expected:boolean)=>setTests(old=>[...old.filter(t=>t.runId!==caseRun||t.rowNumber!==row.row_number),{runId:caseRun,rowNumber:row.row_number,expected}].slice(-100));
 const positives=tests.filter(t=>t.expected).length;
 return <div className="aac-training">
 <p>Oriente o robô a partir dos documentos e das propostas conferidas. Os aprendizados começam como candidatos. Somente o Proprietário ADM pode alterar e ativar regras.</p>
 {!same&&<p role="status">Abra este contrato para selecionar análises e treinar com suas fontes.</p>}
 <label>Orientação para o robô<textarea rows={3} maxLength={2000} value={instruction} onChange={e=>setInstruction(e.target.value)} placeholder="Explique o erro, a correção e a referência aplicável…"/></label>
 <label>Proposta da auditoria atual<select value={chosen} onChange={e=>setChosen(e.target.value)}><option value="">Selecione uma proposta com origem comprovada</option>{options.map(o=><option key={o.key} value={o.key}>{o.row.document} · {o.proposal.field} → {o.proposal.after}</option>)}</select></label>
 <button disabled={busy||!same||!chosen||instruction.trim().length<5} onClick={()=>void act(async()=>{await service.save();const item=options.find(o=>o.key===chosen)!;await call('candidate',{runId:service.snapshot().runId,lineage:item.row.lineage,field:item.proposal.field,instruction});setMessage('Aprendizado candidato salvo com a orientação e as evidências da proposta.');})}>Criar aprendizado candidato</button>
 <p>Para ensinar com planilhas, anexe as alocações e LDs no assistente e confira as propostas. Comentários fiscais permanecem como evidência; não ativam regras sozinhos.</p>
 <fieldset disabled={busy||!same}><legend>Casos para validar o aprendizado</legend>
 <label>Análise histórica<select aria-label="Análise histórica" value={caseRun} onChange={e=>{const id=e.target.value;if(id)void act(()=>loadCases(id,0));else{setCaseRun('');setCaseRows([]);}}}><option value="">Selecione uma análise concluída</option>{s.runs.filter(r=>r.completed_at).map(r=><option key={r.id} value={r.id}>{new Date(r.created_at).toLocaleString('pt-BR')} · {r.expected_count} documentos</option>)}</select></label>
 <p>Marque exemplos em que esta regra deve ser aplicada e exemplos em que não deve. O servidor testa os registros originais salvos.</p>
 <div className="aac-training-cases">{caseRows.map(row=>{const selected=tests.find(t=>t.runId===caseRun&&t.rowNumber===row.row_number);return <article key={row.row_number}><strong>{row.payload.document} · Rev. {row.payload.revision||'não informada'}</strong><small>{row.payload.sourceFile} · {row.payload.sourceSheet} · linha {row.payload.sourceRow}</small><select aria-label={'Resultado esperado para '+row.payload.document+' linha '+row.row_number} value={selected?String(selected.expected):''} onChange={e=>{if(e.target.value==='')setTests(old=>old.filter(t=>t.runId!==caseRun||t.rowNumber!==row.row_number));else label(row,e.target.value==='true');}}><option value="">Não selecionado</option><option value="true">Deve aplicar esta regra</option><option value="false">Não deve aplicar esta regra</option></select></article>;})}</div>
 {caseRun&&<div className="ag-toolbar"><button disabled={busy||casePage===0} onClick={()=>void act(()=>loadCases(caseRun,casePage-1))}>Casos anteriores</button><span>Página {casePage+1}</span><button disabled={busy||caseRows.length<200} onClick={()=>void act(()=>loadCases(caseRun,casePage+1))}>Próximos casos</button></div>}
 <p>{positives} positivos · {tests.length-positives} negativos · máximo de 100 casos</p>
 {tests.length>0&&<button onClick={()=>setTests([])}>Limpar seleção de casos</button>}
 </fieldset>
 <label>Referência de homologação<input value={homologation} maxLength={1000} onChange={e=>setHomologation(e.target.value)} placeholder="Documento, casos reais e aprovação da política"/></label>
 {message&&<p role="status">{message}</p>}
 {rules.map(rule=><article key={rule.id}><strong>{rule.payload.document} · {rule.payload.field} · v{rule.version}</strong><p>{rule.payload.instruction}</p><p>Estado: {rule.state} · Positivos: {rule.validation.positives||0} · Negativos: {rule.validation.negatives||0} · Falhas: {rule.validation.failures??'não testado'}</p><div className="ag-toolbar"><button disabled={busy||positives===0||tests.length===positives} onClick={()=>void act(()=>call('rule-validate',{id:rule.id,version:rule.version,tests}))}>Validar casos selecionados</button>{['active','suspended','revoked','candidate'].filter(x=>x!==rule.state).map(state=><button key={state} disabled={busy||state==='active'&&(!rule.validation.passed||homologation.trim().length<10)} onClick={()=>void act(()=>call('rule-state',{id:rule.id,version:rule.version,state,homologation}))}>{({active:'Ativar versão validada',suspended:'Suspender',revoked:'Revogar',candidate:'Retornar a candidata'})[state]}</button>)}</div><details><summary onClick={()=>void act(async()=>{const data=await call('rule-history',{id:rule.id});setHistory(old=>({...old,[rule.id]:data.versions}));})}>Versões anteriores</summary>{(history[rule.id]||[]).filter(v=>v.version<rule.version).map(v=><p key={v.version}>v{v.version} · {v.state} <button disabled={busy} onClick={()=>void act(()=>call('rule-restore',{id:rule.id,version:rule.version,restoreVersion:v.version}))}>Restaurar como candidata</button></p>)}</details></article>)}
 {!rules.length&&<p>Nenhum aprendizado cadastrado neste contrato.</p>}
 </div>;
}
