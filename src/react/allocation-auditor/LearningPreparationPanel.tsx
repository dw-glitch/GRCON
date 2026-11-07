import {useEffect,useRef,useState} from 'react';
import {service,type Data} from './service';

export function LearningPreparationPanel({busy}:{busy:boolean}){
 const [file,setFile]=useState<File|null>(null),[sheets,setSheets]=useState<Data[]>([]),[sheet,setSheet]=useState('');
 const [result,setResult]=useState<Data|null>(null),[message,setMessage]=useState('');
 const generation=useRef(0),inFlight=useRef(false);
 useEffect(()=>()=>{generation.current++;},[]);
 const inspect=async(selected:File)=>{
  if(inFlight.current)return;inFlight.current=true;const ticket=++generation.current;
  setFile(null);setSheets([]);setSheet('');setResult(null);setMessage('Conferindo as abas do histórico…');
  try{const found=await service.inspectLearningFile(selected);if(ticket!==generation.current)return;
   setFile(selected);setSheets(found);setSheet(found.length===1?found[0].name:'');
   setMessage(found.length?'Selecione a aba e gere a planilha de revisão.':'Não encontrei colunas de retorno e resposta da Fiscal 01. Selecione a Central de Alocação ou um histórico compatível.');
  }catch(e){if(ticket===generation.current)setMessage((e as Data)?.code==='CANCELLED'?'Preparação cancelada. O histórico original foi preservado.':'Não foi possível ler o histórico. Confira a mensagem de erro e tente novamente com uma cópia XLSX válida.');}
  finally{inFlight.current=false;}
 };
 const prepare=async()=>{
  if(!file||!sheet||inFlight.current)return;inFlight.current=true;const ticket=++generation.current;setResult(null);setMessage('Preparando a planilha de revisão humana…');
  try{const summary=await service.prepareLearningFile(file,sheet);if(ticket!==generation.current)return;setResult(summary);setMessage('Planilha de preparação gerada. Nenhum treinamento foi iniciado.');}
  catch(e){if(ticket===generation.current)setMessage((e as Data)?.code==='CANCELLED'?'Preparação cancelada. O histórico original foi preservado.':'Não foi possível gerar a preparação. O histórico original foi preservado; confira o erro e tente novamente.');}
  finally{inFlight.current=false;}
 };
 return <section className="aac-learning-preparation" aria-label="Preparar aprendizado com histórico">
  <strong>Preparar aprendizado com histórico</strong>
  <p>Use as recusas anteriores para organizar exemplos que a equipe vai revisar. Este passo mostra os dados que faltam e gera uma planilha didática; não treina nem ativa um modelo.</p>
  <label>Histórico da Fiscal 01 (.xlsx)<input type="file" accept=".xlsx" disabled={busy} onChange={e=>{const selected=e.target.files?.[0];e.target.value='';if(selected)void inspect(selected);}}/></label>
  {sheets.length>0&&<form onSubmit={e=>{e.preventDefault();void prepare();}}>
   <label>Aba do histórico para preparar<select value={sheet} disabled={busy} onChange={e=>setSheet(e.target.value)}><option value="">Selecione a aba correta</option>{sheets.map(s=><option key={s.name} value={s.name}>{s.name} · {s.documents} registros</option>)}</select></label>
   <button type="submit" disabled={busy||!sheet}>Baixar planilha para revisão humana</button>
  </form>}
  {message&&<p role="status">{message}</p>}
  {busy&&inFlight.current&&<button type="button" onClick={()=>service.abort()}>Cancelar preparação</button>}
  {result&&<p><b>Registros preservados: {result.total}.</b> Com lacunas identificadas: {result.withGaps}. Sem lacunas detectadas: {result.withoutDetectedGaps} (ainda exigem revisão humana). Revisão ausente: {result.gaps.revision}; título enviado ausente: {result.gaps.title}.</p>}
  <small>O histórico é lido localmente e não entra como alocação desta auditoria. Não use a LD atual para inventar a revisão ou o título de uma submissão antiga.</small>
 </section>;
}
