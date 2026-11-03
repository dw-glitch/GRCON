(function(root){
 'use strict';
 // Fase 7 — pacote final do Robô Auditor Preventivo.
 //   GRCON_Auditoria_Preventiva/
 //     01_Relatorio_Auditoria.xlsx   (RESUMO + DETALHAMENTO)
 //     02_LDs_Corrigidas/…           (somente se alguma LD foi realmente corrigida)
 //     03_Alocacoes_Corrigidas/…     (somente cópias realmente corrigidas)
 //     04_Linhas_Central*.xlsx       (somente quando houve emissão oficial confirmada)
 //     05_Manifesto.json
 // Nenhuma pasta vazia, nenhum arquivo fictício e nenhuma numeração oficial consumida aqui.
 const PACKAGE_VERSION='2.0.0',ROOT='GRCON_Auditoria_Preventiva';
 const STATES=Object.freeze({ready:'Pronta para conferência final e envio',fix:'Correção necessária antes do envio',verify:'Verificação complementar necessária'});
 const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const safe=v=>typeof v==='string'&&/^[\s]*[=+\-@\t\r]/.test(v)?"'"+v:v??'';
 const SEVERITY={error:'Não conformidade confirmada',pending:'Verificação pendente',suggestion:'Sugestão preventiva (não normativa)'};
 const CORRECTION_TYPE={A:'A · Correção automática segura',B:'B · Correção proposta',C:'C · Verificação complementar',D:'D · Sem alteração necessária'};
 const LIMITS=['A auditoria preventiva não equivale à aprovação da Fiscal 01 nem substitui a conferência final.','Comentários fiscais históricos são precedentes, não normas.','Somente cópias são corrigidas; originais, Central compartilhada e comentários fiscais permanecem intactos.'];
 function evidenceText(list){
  return (list||[]).map(e=>{
   if(e==null)return '';
   let value=e;if(typeof e==='string'){try{value=JSON.parse(e);}catch{return e.slice(0,300);}}
   if(typeof value!=='object')return String(value).slice(0,300);
   return Object.entries(value).filter(([,v])=>v!==''&&v!=null&&typeof v!=='object').map(([k,v])=>k+': '+v).join(' · ').slice(0,300);
  }).filter(Boolean).slice(0,3).join(' | ');
 }
 const fieldMatches=(finding,change)=>finding.field===change.field||(finding.field==='levels'&&/^N[1-6]$/.test(change.field));
 // Estado final: considera achados do motor e correções efetivamente verificadas.
 function finalState(rows,files,exceptions,contextWarning){
  const changes=(files||[]).flatMap(f=>(f.changes||[]).filter(c=>c.verified!==false).map(c=>({...c})));
  let uncorrected=0,pending=0;
  for(const row of rows||[])for(const f of row.findings||[]){
   if(f.severity==='error'){if(!changes.some(c=>c.lineage===row.lineage&&fieldMatches(f,c)))uncorrected++;}
   else if(f.severity==='pending')pending++;
  }
  const inconclusive=pending+(exceptions||[]).length+(contextWarning?1:0);
  const state=uncorrected?STATES.fix:inconclusive?STATES.verify:STATES.ready;
  return {state,uncorrectedErrors:uncorrected,inconclusive,pendingFindings:pending};
 }
 function safeName(name){
  if(typeof name!=='string'||!/^[\wÀ-ÿ .()/\-]+\.xlsx$/u.test(name)||name.includes('..')||name.startsWith('/')||name.includes('//')||/(^|\/)\./.test(name))throw Error('Nome de saída inseguro ou repetido.');
  return name;
 }
 async function build(input,{XLSX,JSZip,C}){
  if(!input.rows?.length||input.progress!==input.total||input.rows.length!==input.total)throw Error('Conclua a auditoria antes de preparar o pacote.');
  if(!root.ExcelJS)importScripts('../exceljs.min.js');
  const rows=input.rows,events=C.approvedChanges(input.events||[]),exceptions=(input.exceptions||[]).map(String),files=input.files||[];
  const plan=input.plan||{items:[]},planByKey=new Map((plan.items||[]).filter(i=>i.field&&i.after!==undefined).map(i=>[JSON.stringify([i.lineage,i.field,i.after]),i]));
  const summary=C.summary(rows),state=finalState(rows,files,exceptions,input.contextWarning);
  const generatedAt=new Date();
  const verifiedChanges=files.flatMap(f=>(f.changes||[]).map(c=>({...c,file:f.name})));
  const appliedKey=new Set(verifiedChanges.map(c=>JSON.stringify([c.lineage,c.field,c.after])));
  const labels=Object.fromEntries((C.TAXONOMY||[]).map(t=>[t.id,t.label]));
  const book=new root.ExcelJS.Workbook();book.creator='GRCON';book.created=generatedAt;
  const header=(ws,fill='FF15546E')=>{const r=ws.getRow(1);r.font={bold:true,color:{argb:'FFFFFFFF'}};r.fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};r.alignment={vertical:'middle',wrapText:true};r.height=30;};

  // ABA 2 primeiro (necessária para contagens do RESUMO); inserida depois na ordem correta.
  const detailRows=[];
  const allocationOf=r=>r.allocation||r.sourceFile||'';
  const where=r=>[r.sourceFile,r.sourceSheet].filter(Boolean);
  let proposalsOpen=0,clearDocs=0;
  for(const row of rows){
   const [file,sheet]=where(row),line=row.sourceRow?'linha '+row.sourceRow:'';
   for(const f of row.findings||[]){
    detailRows.push({tone:f.severity,cells:[allocationOf(row),row.document,row.revision,labels[f.category]||f.category,f.id+' · motor '+(f.ruleVersion||row.ruleVersion),SEVERITY[f.severity]||f.severity,f.message,f.field,'','','',evidenceText(f.evidence)||f.source,file,sheet,line,f.severity==='suggestion'?'Sugestão a avaliar':f.severity==='pending'?'Aguardando verificação':'Aguardando correção','',f.source||'',f.humanReview===false?'Não':'Sim']});
   }
   for(const rec of row.recommendations||[]){
    const key=JSON.stringify([row.lineage,rec.field,rec.after]),item=planByKey.get(key);
    if(events.some(e=>e.lineage===row.lineage&&e.field===rec.field&&e.after===rec.after))continue; // aparece como decisão abaixo
    proposalsOpen++;
    detailRows.push({tone:'proposal',cells:[allocationOf(row),row.document,row.revision,labels[rec.field==='workflow'?'workflow':rec.field==='databook'?'databook':'hierarchy'],item?.ruleId||'Proposta determinística',SEVERITY.pending,rec.justification,rec.field,rec.before,rec.after,'',evidenceText(rec.evidence),file,sheet,item?.cell||line,'Proposta aguardando decisão',CORRECTION_TYPE[item?.klass||'B'],rec.justification,'Sim']});
   }
   for(const e of events.filter(x=>x.lineage===row.lineage)){
    const done=appliedKey.has(JSON.stringify([e.lineage,e.field,e.after])),change=verifiedChanges.find(c=>c.lineage===e.lineage&&c.field===e.field&&c.after===e.after);
    const item=planByKey.get(JSON.stringify([e.lineage,e.field,e.after]));
    detailRows.push({tone:done?'done':'authorized',cells:[allocationOf(row),row.document,row.revision,labels[e.field==='title'?'title':e.field==='workflow'?'workflow':e.field==='databook'?'databook':'hierarchy'],e.ruleId?e.ruleId+' v'+(e.ruleVersion||''):'Decisão humana',done?'Corrigido':'Autorizado',e.justification,e.field,e.before,e.after,done?e.after:'',evidenceText(e.evidence),change?.file||file,change?.sheet||sheet,change?.cell||line,done?'Corrigido e verificado em cópia':'Autorizado; cópia não produzida',CORRECTION_TYPE[item?.klass||(e.ruleId?'A':'B')],e.justification,e.ruleId?'Não (regra ativa)':'Sim — decisão de '+(e.actor||'responsável')]});
   }
   if(!(row.findings||[]).length&&!(row.recommendations||[]).length){clearDocs++;detailRows.push({tone:'clear',cells:[allocationOf(row),row.document,row.revision,'Verificação','','Sem problema detectado','Nenhum problema detectado nas referências disponíveis','','','','','',file,sheet,line,'Verificado',CORRECTION_TYPE.D,'Ausência de apontamentos não é aprovação fiscal','Não']});}
  }
  const order={error:0,pending:1,proposal:2,authorized:3,done:4,suggestion:5,clear:6};
  detailRows.sort((a,b)=>(order[a.tone]??9)-(order[b.tone]??9));

  const resumo=book.addWorksheet('RESUMO',{views:[{showGridLines:false}]});
  const detail=book.addWorksheet('DETALHAMENTO');
  const allocations=[...new Set(rows.map(allocationOf).filter(Boolean))];
  const ldCopies=files.filter(f=>/^02_/.test(f.name)).length,allocCopies=files.filter(f=>/^03_/.test(f.name)).length;
  const executed=verifiedChanges.length;
  const authorized=events.length;
  resumo.columns=[{width:34},{width:96}];
  resumo.mergeCells('A1:B1');resumo.getCell('A1').value='GRCON · Auditoria Preventiva de Alocações';resumo.getCell('A1').font={size:16,bold:true,color:{argb:'FFFFFFFF'}};
  resumo.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF15546E'}};resumo.getRow(1).height=34;resumo.getCell('A1').alignment={vertical:'middle'};
  const sections=[
   ['Identificação',[['Contrato',input.contract],['Identificação da auditoria',input.runId||input.sessionId||''],['Data de geração',generatedAt],['Alocações analisadas',allocations.join('; ')||'—'],['Versão do motor',C.VERSION]]],
   ['Resultado',[['Estado final',state.state],['Documentos analisados',rows.length],['Correções executadas (verificadas em cópia)',executed],['Correções autorizadas',authorized],['Propostas pendentes de decisão',proposalsOpen],['Verificações inconclusivas',state.inconclusive],['Não conformidades confirmadas sem correção',state.uncorrectedErrors],['Sugestões preventivas (precedentes, não normativas)',summary.suggestions],['Documentos sem problemas detectados',clearDocs],['LDs corrigidas (cópias)',ldCopies],['Alocações corrigidas (cópias)',allocCopies]]],
   ['Fontes e referências',[['Fontes utilizadas',(input.sources||[]).map(s=>s.name+' ('+(s.kind==='ld'?'LD':'alocação')+', SHA-256 '+String(s.sha256||'').slice(0,12)+'…)').join('\n')||'—'],['Versões das referências',Object.entries(input.versions||{}).map(([k,v])=>k+': '+v).join('\n')||'Não informadas'],['Bases complementares',input.contextWarning||'Consultadas']]],
   ['Limitações',[['Limitações relevantes',[...LIMITS,...(input.contextWarning?[input.contextWarning]:[]),...exceptions.map(e=>'Arquivo não produzido: '+e)].join('\n')]]]
  ];
  let at=2;
  for(const [title,pairs] of sections){
   const t=resumo.getRow(++at);t.getCell(1).value=title.toUpperCase();t.font={bold:true,color:{argb:'FF15546E'}};t.border={bottom:{style:'thin',color:{argb:'FF15546E'}}};resumo.mergeCells(at,1,at,2);
   for(const [k,v] of pairs){const r=resumo.getRow(++at);r.getCell(1).value=safe(k);r.getCell(1).font={bold:true,color:{argb:'FF20384D'}};r.getCell(2).value=v instanceof Date?v:typeof v==='number'?v:safe(String(v));
    if(v instanceof Date)r.getCell(2).numFmt='dd/mm/yyyy hh:mm';r.alignment={vertical:'top',wrapText:true,horizontal:'left'};
    if(k==='Estado final'){r.getCell(2).font={bold:true,color:{argb:state.state===STATES.ready?'FF1B6B3A':state.state===STATES.fix?'FFB3261E':'FF8A5A00'}};}}
   at++;
  }

  detail.addRow(['Alocação','Documento','Revisão','Categoria','Regra','Severidade','Problema','Campo','Valor original','Valor proposto','Valor efetivamente corrigido','Fonte da evidência','Arquivo','Aba','Linha/célula','Situação','Tipo de correção','Justificativa','Revisão humana'].map(safe));
  header(detail);
  const fills={error:'FFFDE2E1',pending:'FFFFF3D6',proposal:'FFFFF3D6',suggestion:'FFE6F0FA',done:'FFE3F4E8',authorized:'FFEAF4E4',clear:'FFFFFFFF'};
  for(const d of detailRows){const r=detail.addRow(d.cells.map(safe));if(fills[d.tone]&&d.tone!=='clear')r.getCell(6).fill={type:'pattern',pattern:'solid',fgColor:{argb:fills[d.tone]}};}
  detail.columns=[22,38,9,18,26,24,60,12,28,28,28,44,28,12,14,28,26,50,18].map(width=>({width}));
  detail.views=[{state:'frozen',ySplit:1,xSplit:2}];
  detail.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,detail.rowCount),column:19}};
  detail.eachRow((r,i)=>{if(i>1){r.alignment={vertical:'top',wrapText:true};r.font={color:{argb:'FF20384D'}};}});

  const zip=new JSZip(),outputs=[],omitted=[];
  const folder=zip.folder(ROOT);
  async function add(name,bytes,meta={}){
   safeName(name);if(folder.file(name))throw Error('Nome de saída inseguro ou repetido.');
   const archive=await JSZip.loadAsync(bytes,{checkCRC32:true});if(!archive.file('[Content_Types].xml'))throw Error('XLSX sem estrutura OOXML.');
   const wb=XLSX.read(bytes,{type:'array',cellFormula:true});if(!wb.SheetNames.length)throw Error('XLSX sem abas.');
   if(meta.official){if(!wb.Sheets.GERAL)throw Error('Modelo oficial sem GERAL.');const parsed=C.parseRows(XLSX.utils.sheet_to_json(wb.Sheets.GERAL,{header:1,defval:'',raw:true}),{contract:input.contract});if(parsed.model!=='official-16')throw Error('Modelo oficial de 16 colunas inválido.');
    const ctx={...input,records:parsed.records},index=C.prepare(ctx);const second=parsed.records.map(r=>C.auditRecord(r,ctx,index));
    // O campo corrigido deve deixar de constar do conjunto de propostas determinísticas.
    for(const change of meta.changes||[])if(second.some(r=>r.document===change.document&&r.recommendations?.some(p=>p.field===change.field&&p.after===change.after&&p.before===change.before)))throw Error('Segunda auditoria não confirmou a alteração.');
   }
   folder.file(name,bytes,{createFolders:true});outputs.push({path:ROOT+'/'+name,name,bytes:bytes.length,sha256:await hash(bytes),...meta,changes:undefined,changed:meta.changed||0});
  }
  const reportBytes=new Uint8Array(await book.xlsx.writeBuffer());
  const readReport=XLSX.read(reportBytes,{type:'array'});if(readReport.SheetNames.join('|')!=='RESUMO|DETALHAMENTO')throw Error('Relatório fora do contrato de duas abas.');
  await add('01_Relatorio_Auditoria.xlsx',reportBytes,{kind:'report'});
  for(const file of files)await add(file.name,file.bytes,{kind:/^02_/.test(file.name)?'ld':/^03_/.test(file.name)?'allocation':/^04_/.test(file.name)?'central':'file',official:Boolean(file.official),changed:file.changed||0,changes:file.changes||[]});
  if(!ldCopies)omitted.push({path:'02_LDs_Corrigidas/',reason:'Nenhuma LD foi corrigida nesta auditoria.'});
  if(!allocCopies)omitted.push({path:'03_Alocacoes_Corrigidas/',reason:'Nenhuma alocação foi corrigida nesta auditoria.'});
  if(!files.some(f=>/^04_/.test(f.name)))omitted.push({path:'04_Linhas_Central.xlsx',reason:'Nenhuma emissão oficial foi solicitada; a auditoria não consome numeração nem altera a Central compartilhada.'});

  const sources=(input.sources||[]).map(s=>({name:s.name,sha256:s.sha256,kind:s.kind,mapped:s.model==='mapped'||undefined}));
  const manifest={
   packageVersion:PACKAGE_VERSION,auditId:input.runId||input.sessionId||'',sessionId:input.sessionId,runId:input.runId,contract:input.contract,
   engine:C.VERSION,assistant:root.GrconAllocationAssistant.VERSION,generatedAt:generatedAt.toISOString(),
   finalState:state.state,sources,referenceVersions:input.versions||{},
   counts:{documents:rows.length,allocations:allocations.length,withoutProblems:clearDocs,confirmedErrors:summary.errors,pendingVerifications:summary.pending,preventiveSuggestions:summary.suggestions},
   corrections:{proposed:proposalsOpen+authorized,authorized,executed,verified:verifiedChanges.filter(c=>c.verified!==false).length,
    applied:verifiedChanges.map(c=>({file:c.file,sheet:c.sheet,cell:c.cell,document:c.document,revision:c.revision,field:c.field,before:c.before,after:c.after,ruleId:c.ruleId||'',ruleVersion:c.ruleVersion||0,actor:c.actor||'',verified:c.verified!==false}))},
   events,exceptions,outputs,omitted,limitations:[...LIMITS,...(input.contextWarning?[input.contextWarning]:[])],
   numbering:{consumed:files.some(f=>/^04_/.test(f.name)),note:'Auditoria e cópias corrigidas não consomem numeração oficial; a emissão é uma ação separada.'},
   validation:{xlsxReopened:true,crc32:true,reportSheets:readReport.SheetNames,secondAudit:'executada para cópias oficiais corrigidas',technicalValidationOnly:true},normativeApproval:false
  };
  folder.file('05_Manifesto.json',JSON.stringify(manifest,null,2));
  const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});const final=await JSZip.loadAsync(bytes,{checkCRC32:true});
  for(const out of outputs)if(await hash(await final.file(out.path).async('uint8array'))!==out.sha256)throw Error('Integridade do pacote divergente.');
  return {bytes,manifest};
 }
 root.GrconAllocationAuditPackage=Object.freeze({build,hash,finalState,STATES,ROOT,PACKAGE_VERSION});
})(typeof globalThis!=='undefined'?globalThis:this);
