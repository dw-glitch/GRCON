import {useState} from 'react';
import type {Data} from './service';

type Props={validations:Data[];status:'unknown'|'ready'|'unavailable';canRegister:boolean;busy:boolean;unavailableText:string;
 onRegister:(form:Data)=>Promise<unknown>|void;onRevoke:(id:string,reason:string)=>Promise<unknown>|void};
const today=()=>new Date().toISOString().slice(0,10);
const labels=():Record<string,string>=>((window as unknown as Data).GrconAllocationAuditorReferences?.KINDS)||{};

// Registro humano de validação/homologação de referências (RA-07). Localizado ≠ carregado ≠ validado ≠ homologado.
export function ValidationsPanel({validations,status,canRegister,busy,unavailableText,onRegister,onRevoke}:Props){
 const kinds=labels(),[form,setForm]=useState<Data>({recordType:'validacao',kind:'et-codificacao',revision:'',responsible:'',validatedOn:today(),evidence:'',effectiveDate:'',effectiveEvidence:''});
 const [revoking,setRevoking]=useState(''),[reason,setReason]=useState('');
 const set=(k:string,v:string)=>setForm({...form,[k]:v});
 const etNeedsRevision=form.kind==='et-codificacao'&&!String(form.revision).trim();
 const effectivePartial=Boolean(String(form.effectiveDate).trim())!==Boolean(String(form.effectiveEvidence).trim());
 const valid=String(form.responsible).trim().length>=3&&String(form.evidence).trim().length>=5&&!etNeedsRevision&&!effectivePartial&&Boolean(form.validatedOn);
 const submit=()=>{
  const body:Data={recordType:form.recordType,kind:form.kind,responsible:String(form.responsible).trim(),validatedOn:form.validatedOn,evidence:String(form.evidence).trim()};
  if(String(form.revision).trim())body.revision=String(form.revision).trim();
  if(String(form.effectiveDate).trim()){body.effectiveDate=String(form.effectiveDate).trim();body.effectiveEvidence=String(form.effectiveEvidence).trim();}
  void onRegister(body);setForm({...form,revision:'',evidence:'',effectiveDate:'',effectiveEvidence:''});
 };
 return <section className="aac-validations" aria-label="Validações de referências">
  <strong>Validações de referências</strong>
  <p>Localizado, carregado, validado e homologado são coisas diferentes. Uma referência só vale como <b>validada</b> com responsável, data e evidência registrados; sem isso, as verificações que dependem dela ficam <b>pendentes</b>, nunca aprovadas.</p>
  {status==='unavailable'&&<p className="aac-warn" role="note">{unavailableText}</p>}
  {status!=='unavailable'&&!validations.length&&<p>Nenhuma validação registrada neste contrato.</p>}
  <ul className="aac-validation-list">{validations.map(v=><li key={v.id}>
   <div><b>{v.record_type==='homologacao'?'Homologação':'Validação'}</b> · {kinds[v.kind]||v.kind}{v.revision?' · rev. '+v.revision:''}{v.sha256?' · arquivo '+String(v.sha256).slice(0,8)+'…':''}</div>
   <small>{v.responsible} · {String(v.validated_on||'').slice(0,10)} · {v.evidence}{v.effective_date?' · vigência '+v.effective_date:''}</small>
   {canRegister&&(revoking===v.id?<span className="aac-revoke">
     <input aria-label="Motivo da revogação" placeholder="Motivo (mín. 5 caracteres)" value={reason} onChange={e=>setReason(e.target.value)}/>
     <button type="button" disabled={busy||reason.trim().length<5} onClick={()=>{void onRevoke(v.id,reason.trim());setRevoking('');setReason('');}}>Confirmar revogação</button>
     <button type="button" onClick={()=>{setRevoking('');setReason('');}}>Cancelar</button></span>
    :<button type="button" disabled={busy} onClick={()=>setRevoking(v.id)}>Revogar</button>)}
  </li>)}</ul>
  {status==='ready'&&!canRegister&&<p><small>Somente o proprietário ou administrador do contrato registra ou revoga validações.</small></p>}
  {status==='ready'&&canRegister&&<form className="aac-decision" onSubmit={e=>{e.preventDefault();if(valid&&!busy)submit();}}>
   <label>Tipo de registro<select value={form.recordType} onChange={e=>set('recordType',e.target.value)}><option value="validacao">Validação (a referência carregada está correta e vigente)</option><option value="homologacao">Homologação (aprovada para uso; exige validação)</option></select></label>
   <label>Referência<select value={form.kind} onChange={e=>set('kind',e.target.value)}>{Object.keys(kinds).filter(k=>!['ld','central-alocacao','alocacao-retornada','desconhecido'].includes(k)).map(k=><option key={k} value={k}>{kinds[k]}</option>)}</select></label>
   <label>Revisão{form.kind==='et-codificacao'?' (obrigatória: a revisão da ET nunca é presumida)':' (se houver)'}<input value={form.revision} maxLength={20} onChange={e=>set('revision',e.target.value)}/></label>
   <label>Responsável pela validação<input value={form.responsible} maxLength={120} onChange={e=>set('responsible',e.target.value)}/></label>
   <label>Data da validação<input type="date" value={form.validatedOn} max={today()} onChange={e=>set('validatedOn',e.target.value)}/></label>
   <label>Evidência (documento, ata, e-mail ou local do arquivo)<textarea rows={2} maxLength={2000} value={form.evidence} onChange={e=>set('evidence',e.target.value)}/></label>
   <label>Início da vigência (dd/mm/aaaa, opcional)<input value={form.effectiveDate} maxLength={10} placeholder="24/08/2026" onChange={e=>set('effectiveDate',e.target.value)}/></label>
   {String(form.effectiveDate).trim()&&<label>Evidência da vigência<input value={form.effectiveEvidence} maxLength={2000} onChange={e=>set('effectiveEvidence',e.target.value)}/></label>}
   {effectivePartial&&<small role="alert">Vigência e evidência da vigência andam juntas.</small>}
   <button className="primary-button" type="submit" disabled={busy||!valid}>Registrar {form.recordType==='homologacao'?'homologação':'validação'}</button>
  </form>}
 </section>;
}
