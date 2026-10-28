(function(root){
 'use strict';
 const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const safe=v=>typeof v==='string'&&/^[\s]*[=+\-@\t\r]/.test(v)?"'"+v:v??'';
 async function build(input,{XLSX,JSZip,C}){
  if(!input.rows?.length||input.progress!==input.total||input.rows.length!==input.total)throw Error('Conclua a auditoria antes de preparar o pacote.');
  if(!root.ExcelJS)importScripts('../exceljs.min.js');
  const rows=input.rows,events=C.approvedChanges(input.events||[]),exceptions=input.exceptions||[];
  const book=new root.ExcelJS.Workbook();book.creator='GRCON';
  const summary=C.summary(rows),report=book.addWorksheet('RESUMO');
  const allocations=[...new Set(rows.map(r=>r.allocation||r.sourceFile).filter(Boolean))];
  const data=[['Campo','Valor'],['Contrato',input.contract],['Alocações',allocations.join('; ')],['Data',new Date().toISOString()],['Documentos',input.total],['Verificados',rows.length],['Erros confirmados',summary.errors],['Correções autorizadas',events.length],['Células efetivamente corrigidas',(input.files||[]).reduce((n,f)=>n+(f.changed||0),0)],['Pendências',summary.pending],['Fontes indisponíveis',input.contextWarning||'Consulte as pendências normativas no detalhamento'],['Resultado geral',summary.pending||exceptions.length?'Parcial — pendências preservadas':'Verificações executadas; aprovação fiscal não presumida'],['Encaminhamento','Conferir pendências e seguir o procedimento de reapresentação. Originais preservados.'],...exceptions.map(e=>['Arquivo não produzido',String(e)])];
  for(const r of data)report.addRow(r.map(safe));report.columns=[{width:30},{width:100}];
  const detail=book.addWorksheet('DETALHAMENTO');
  detail.addRow(['Documento','Revisão','Disciplina','Origem','Campo','Valor anterior','Valor corrigido','Tipo de inconsistência','Justificativa','Fonte da evidência','Regra aplicada','Status da correção','Necessidade de intervenção']);
  const applied=new Set((input.files||[]).flatMap(f=>(f.changes||[]).map(c=>JSON.stringify([c.lineage,c.field,c.before,c.after]))));
  for(const row of rows){
   const origin=[row.sourceFile,row.sourceSheet,row.sourceRow].filter(Boolean).join(' · ');
   for(const f of row.findings||[])detail.addRow([row.document,row.revision,row.discipline,origin,f.field,'','',f.category,f.message,JSON.stringify(f.evidence),f.id+' @ '+row.ruleVersion,'Achado','Conferir referência ou evidência'].map(safe));
   for(const e of events.filter(e=>e.lineage===row.lineage))detail.addRow([row.document,row.revision,row.discipline,origin,e.field,e.before,e.after,'Correção autorizada',e.justification,JSON.stringify(e.evidence),e.ruleId||'Decisão humana',applied.has(JSON.stringify([e.lineage,e.field,e.before,e.after]))?'Aplicada em cópia validada':'Autorizada; arquivo não produzido','Ver relatório e pendências'].map(safe));
   if(!row.findings?.length)detail.addRow([row.document,row.revision,row.discipline,origin,'','','','Verificação','Sem achados nas referências disponíveis','','','Verificado','Aprovação fiscal não presumida'].map(safe));
  }
  detail.columns=Array.from({length:13},(_,i)=>({width:[0,3,8,9].includes(i)?52:25}));
  for(const ws of [report,detail]){ws.views=[{state:'frozen',ySplit:1}];ws.autoFilter={from:'A1',to:{row:ws.rowCount,column:ws.columnCount}};ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF15546E'}};ws.eachRow(r=>{r.alignment={vertical:'top',wrapText:true};});}
  const zip=new JSZip(),outputs=[];
  async function add(name,bytes,meta={}){
   if(!/^[\wÀ-ÿ .()/\-]+\.xlsx$/u.test(name)||name.includes('..')||name.startsWith('/')||zip.file(name))throw Error('Nome de saída inseguro ou repetido.');
   const archive=await JSZip.loadAsync(bytes,{checkCRC32:true});if(!archive.file('[Content_Types].xml'))throw Error('XLSX sem estrutura OOXML.');
   const wb=XLSX.read(bytes,{type:'array',cellFormula:true});if(!wb.SheetNames.length)throw Error('XLSX sem abas.');
   if(meta.official){if(!wb.Sheets.GERAL)throw Error('Modelo oficial sem GERAL.');const parsed=C.parseRows(XLSX.utils.sheet_to_json(wb.Sheets.GERAL,{header:1,defval:'',raw:true}),{contract:input.contract});if(parsed.model!=='official-16')throw Error('Modelo oficial de 16 colunas inválido.');
    const ctx={...input,records:parsed.records},index=C.prepare(ctx);const second=parsed.records.map(r=>C.auditRecord(r,ctx,index));
    // A corrected field must disappear from the deterministic proposal set.
    for(const change of meta.changes||[])if(second.some(r=>r.document===change.document&&r.recommendations?.some(p=>p.field===change.field&&p.after===change.after&&p.before===change.before)))throw Error('Segunda auditoria não confirmou a alteração.');
   }
   zip.file(name,bytes);outputs.push({name,sha256:await hash(bytes),...meta});
  }
  const reportBytes=new Uint8Array(await book.xlsx.writeBuffer());
  const readReport=XLSX.read(reportBytes,{type:'array'});if(readReport.SheetNames.join('|')!=='RESUMO|DETALHAMENTO')throw Error('Relatório fora do contrato de duas abas.');
  await add('01_Relatorio_Auditoria.xlsx',reportBytes);
  for(const file of input.files||[])await add(file.name,file.bytes,{official:Boolean(file.official),changed:file.changed||0,changes:file.changes||[]});
  const sources=(input.sources||[]).map(s=>({name:s.name,sha256:s.sha256,kind:s.kind}));
  const manifest={engine:C.VERSION,assistant:root.GrconAllocationAssistant.VERSION,sessionId:input.sessionId,runId:input.runId,contract:input.contract,createdAt:new Date().toISOString(),sources,versions:input.versions,outputs,events,exceptions,validation:{xlsxReopened:true,crc32:true,reportSheets:readReport.SheetNames,secondAudit:'executada para cópias oficiais corrigidas',technicalValidationOnly:true},normativeApproval:false};
  zip.file('05_Manifesto_Auditoria.json',JSON.stringify(manifest,null,2));
  const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});const final=await JSZip.loadAsync(bytes,{checkCRC32:true});
  for(const out of outputs)if(await hash(await final.file(out.name).async('uint8array'))!==out.sha256)throw Error('Integridade do pacote divergente.');
  return {bytes,manifest};
 }
 root.GrconAllocationAuditPackage=Object.freeze({build,hash});
})(typeof globalThis!=='undefined'?globalThis:this);
