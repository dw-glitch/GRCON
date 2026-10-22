(function(root,factory){
 const cjs=typeof module==='object'&&module.exports;
 const api=factory(root.RECONTriagemCore||(cjs?require('./vendor/recon/core.js'):null),root.RECONAllocationNorms||(cjs?require('./vendor/recon/allocation_normative_rules.js'):null),root.RECONDocumentTitleStandard||(cjs?require('./vendor/recon/document_title_standard_r.js'):null));
 if(cjs)module.exports=api;root.GrconAllocationLdExport=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C,N,T){
 'use strict';
 const text=x=>String(x??'').trim(),norm=x=>C.norm(x).replace(/[_.]/g,' ').replace(/\s+/g,' ').trim();
 const MODEL_HEADERS=Object.freeze(['TAXONOMIA','RELATÓRIO','TÍTULO','DATA BOOK','TAG','DE / PARA','DISCIPLINA']);
 const DEFAULT_HEADERS=Object.freeze(['DOCUMENTO','REVISÃO','TÍTULO','DISCIPLINA','TIPO DE DOCUMENTO','FORMATO','PROPÓSITO','CAMINHO DATABOOK','ALOCAÇÃO','CONFIRMAÇÃO DOCUMENTOS PREVISTOS','ETAPA DA ALOCAÇÃO','STATUS','STATUS SIGEM','GRDT','DATA EFETIVA DE EMISSÃO','PRAZO','COMENTÁRIO DA FISCAL','TAG','DE / PARA','MODIFICADO EM','INCLUÍDO EM','OBSERVAÇÕES']);
 function columns(record){return (record?.ldColumns||[]).filter(x=>text(x.header)&&Number.isInteger(x.column)&&x.column>0&&x.column<=401).map(x=>({header:text(x.header),column:x.column})).sort((a,b)=>a.column-b.column);}
 const signature=cols=>JSON.stringify(cols.map(c=>[c.column,c.header]));
 function layoutIndex(records){
  const bySheet=new Map();
  for(const record of records){const cols=columns(record);if(!cols.length)continue;const sheet=norm(record.sheet||C.inferSheetFromName(record.document));if(!bySheet.has(sheet))bySheet.set(sheet,new Map());const layouts=bySheet.get(sheet),key=signature(cols),old=layouts.get(key);if(old)old.count++;else layouts.set(key,{columns:cols,sheet:record.sheet||'',source:record.source||'',count:1});}
  return new Map([...bySheet].map(([sheet,layouts])=>[sheet,[...layouts.values()].sort((a,b)=>b.count-a.count||signature(a.columns).localeCompare(signature(b.columns)))[0]]));
 }
 function layoutFor(record,index){
  const own=columns(record);if(own.length)return {columns:own,sheet:record.sheet||'',source:record.source||'',known:true};
  const found=index.get(norm(record.sheet||C.inferSheetFromName(record.document)));if(found)return {columns:found.columns,sheet:found.sheet,source:found.source,known:true};
  return {columns:DEFAULT_HEADERS.map((header,i)=>({header,column:i+1})),sheet:record.sheet||C.inferSheetFromName(record.document)||'Documentos',source:'',known:false};
 }
 function sourceValue(record,aliases){for(const alias of aliases){const match=(record.ldColumns||[]).find(x=>norm(x.header)===norm(alias)&&text(x.value));if(match)return text(match.value);}return '';}
 function details(row){
  const record=row.record||{},parsed=N.validateDocument(row.document).parsed||{};
  const tag=text(record.tag)||sourceValue(record,['TAG','TAG DO DOCUMENTO','CIRCUITO'])||(/^nt-/i.test(parsed.tag||'')?'':text(parsed.tag));
  const source=sourceValue(record,['DE / PARA','DE/PARA','DE PARA'])||text(record.dePara)||text(row.title)||text(record.title);
  const match=source.match(/\bDE\s*:\s*(.*?)\s*(?:\/\s*)?\bPARA\s*:\s*(.+)$/i);
  const from=sourceValue(record,['DE'])||text(record.from)||text(match?.[1]).replace(/[\s/–-]+$/,'');
  const to=sourceValue(record,['PARA'])||text(record.to)||text(match?.[2]);
  const route=from||to?`DE: ${from} / PARA: ${to}`:'';
  const report=T.resolve(row.document,{currentTitle:row.title,previousTitles:[record.title],referenceType:record.documentType});
  const discipline=text(row.identity?.discipline||row.output?.discipline||record.discipline);
  return {tag,from,to,route,unit:text(row.identity?.unit||parsed.unit),eap:text(row.identity?.eap||parsed.eap),report:text(report.title)?C.norm(report.title):'',discipline};
 }
 function modelRow(row){const d=details(row);return [row.document,d.report,row.title||'',row.output?.databook||'',d.tag,d.route,d.discipline];}
 function field(header){
  const h=norm(header);
  if(/^(DOCUMENTO|DOCUMENTO SIGEM|DOCUMENTO \(SIGEM\)|DOCUMENTO COMPLETO|CODIGO (?:DO )?DOCUMENTO|CODIGO DOCUMENTAL|TAXONOMIA|NOME (?:DO )?DOCUMENTO)$/.test(h))return 'document';
  if(/^(REVISAO|REV)$/.test(h))return 'revision';
  if(h==='TITULO'||h.includes('TITULO DO DOCUMENTO'))return 'title';
  if(h==='RELATORIO'||h==='TIPO DE RELATORIO')return 'report';
  if(h==='DISCIPLINA'||h==='WORKFLOW')return h==='DISCIPLINA'?'discipline':'workflow';
  if(h==='DATA BOOK'||h.includes('CAMINHO DATABOOK')||h.includes('CAMINHO DATA BOOK'))return 'databook';
  if(h==='EAP'||h==='CODIGO EAP')return 'eap';
  if(h==='UNIDADE'||h==='INSTALACAO')return 'unit';
  if(h==='TAG'||h.startsWith('TAG DO ')||h==='CIRCUITO')return 'tag';
  if(/^(DE\s*\/\s*PARA|DE PARA)$/.test(h))return 'route';
  if(h==='DE'||h==='PARA')return h==='DE'?'from':'to';
  if(/^(N|NIVEL)\s*([1-9]|10)$/.test(h))return 'level:'+h.match(/(\d+)$/)[1];
  if(h==='OBSERVACAO'||h==='OBSERVACOES')return 'observation';
  if(h.includes('TIPO DE DOCUMENTO')||h==='TIPO DOCUMENTO')return 'documentType';
  if(h==='FORMATO')return 'format';
  if(h.includes('PROPOSITO')||h.includes('FINALIDADE'))return 'purpose';
  if(h.includes('STATUS SIGEM'))return 'sigemStatus';
  if(h==='STATUS')return 'status';
  if(h==='GRDT'||h.includes('NUMERO GRDT'))return 'grdt';
  if(h.includes('DATA EFETIVA DE EMISSAO')||h==='DATA EGRDT')return 'effectiveDate';
  if(h.includes('PRAZO'))return 'deadline';
  if(h.includes('COMENTARIO DA FISCAL'))return 'fiscalComment';
  if(h.includes('CONFIRMACAO')&&h.includes('DOCUMENTOS PREVISTOS'))return 'allocationStatus';
  if(h.includes('ETAPA')&&h.includes('ALOCACAO'))return 'allocationStage';
  if(h.includes('ALOCACAO'))return 'allocation';
  if(h.includes('MODIFICADO EM'))return 'modified';
  if(h.includes('INCLUIDO EM'))return 'included';
  return '';
 }
 function dateValue(value,kind){
  const raw=text(value);
  if(!['effectiveDate','deadline','modified','included'].includes(kind)||!/^\d{1,4}[-/]\d{1,2}[-/]\d{2,4}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.test(raw))return value;
  const parsed=C.parseDate(raw);return parsed?new Date(Date.UTC(parsed.getFullYear(),parsed.getMonth(),parsed.getDate(),parsed.getHours(),parsed.getMinutes(),parsed.getSeconds())):value;
 }
 function ldRow(row,layout){
  const record=row.record||{},d=details(row),headers=Array(Math.max(...layout.columns.map(c=>c.column))).fill('');layout.columns.forEach(c=>{headers[c.column-1]=c.header;});
  const source=new Map((record.ldColumns||[]).map(c=>[c.column,c])),sameRevision=text(record.revision||'0').toUpperCase()===text(row.revision||'0').toUpperCase();
  const values=headers.map((header,i)=>{
   const f=field(header),entry=source.get(i+1),original=entry&&norm(entry.header)===norm(header)?entry.value:sourceValue(record,[header]);
   if(f==='document')return row.document;
   if(f==='revision')return row.revision||'0';
   if(f==='title')return row.title||'';
   if(f==='databook')return row.output?.databook||'';
   if(f==='tag')return text(original)||d.tag;
   if(['report','discipline','route','from','to','unit','eap'].includes(f))return d[f]||'';
   if(f==='workflow')return row.output?.workflow||d.discipline||text(original);
   if(f.startsWith('level:'))return row.output?.levels?.[Number(f.slice(6))-1]||'';
   if(f==='observation')return [text(original),row.output?.observation].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(' · ');
   if(!sameRevision&&['status','sigemStatus','grdt','effectiveDate','modified','included'].includes(f))return '';
   if(text(original))return dateValue(text(original),f);
   if(f==='documentType')return text(record.documentType)||C.buildEgrdtData(row.document,row.revision,'',record,record.sheet).documentType||'';
   // Operational state comes only from this document's LD. Generating a file
   // does not prove allocation acceptance, emission or SIGEM publication.
   return f?dateValue(text(record[f]),f):'';
  });
  return {headers,values};
 }
 function groupRows(results){
  const groups=new Map();
  for(const row of results){const layout=row.ldLayout||layoutFor(row.record||{},new Map()),key=norm(layout.sheet)+'|'+signature(layout.columns);if(!groups.has(key))groups.set(key,{layout,rows:[]});groups.get(key).rows.push(row);}
  return [...groups.values()];
 }
 function style(sheet,headers,rows){
  const documentColumn=headers.findIndex(h=>field(h)==='document')+1;
  sheet.views=[{state:'frozen',ySplit:1,xSplit:Math.min(3,Math.max(1,documentColumn)),showGridLines:false}];
  sheet.autoFilter={from:{row:1,column:1},to:{row:rows.length+1,column:headers.length}};
  sheet.columns.forEach((column,i)=>{const f=field(headers[i]);column.width=f==='title'?90:f==='document'?52:f==='databook'?65:f==='report'?62:f==='route'?48:f==='observation'?70:24;column.numFmt='@';});
  sheet.eachRow((row,index)=>{row.font={name:'Aptos',size:11,color:{argb:'FF20384D'}};row.alignment={vertical:'middle',wrapText:true};
   if(index===1){row.height=32;row.alignment={vertical:'middle',horizontal:'center',wrapText:true};row.font={name:'Aptos',size:11,bold:true,color:{argb:'FFFFFFFF'}};row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1F4E78'}};}
   else{row.height=Math.min(409,Math.max(34,...row.values.slice(1).map((v,i)=>Math.ceil((v instanceof Date?10:String(v??'').length)/(sheet.getColumn(i+1).width||24))*14+12)));row.fill={type:'pattern',pattern:'solid',fgColor:{argb:index%2?'FFFFFFFF':'FFF0F5FA'}};row.eachCell({includeEmpty:true},cell=>{if(cell.value instanceof Date)cell.numFmt=(cell.value.getUTCHours()||cell.value.getUTCMinutes())?'dd/mm/yyyy hh:mm':'dd/mm/yyyy';cell.border={bottom:{style:'hair',color:{argb:'FFDCE5ED'}}};});}
  });
  sheet.pageSetup={orientation:'landscape',paperSize:8,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'};
 }
 async function build(results,ExcelJS){
  const book=new ExcelJS.Workbook();book.creator='GRCON';book.subject='Títulos e linhas completas para inclusão na LD';
  const titles=book.addWorksheet('Títulos');titles.addRow(MODEL_HEADERS);results.forEach(row=>titles.addRow(modelRow(row)));style(titles,MODEL_HEADERS,results);
  const names=new Set(['Títulos']);
  for(const group of groupRows(results)){
   const stem=('LD - '+(group.layout.known?(group.layout.sheet||'Documentos'):'Padrão')).replace(/[\\/*?:\[\]]/g,' ').slice(0,27);let name=stem,n=1;while(names.has(name))name=stem+' '+(++n);names.add(name);
   const sheet=book.addWorksheet(name),converted=group.rows.map(row=>ldRow(row,group.layout));sheet.addRow(converted[0].headers);converted.forEach(row=>sheet.addRow(row.values));style(sheet,converted[0].headers,group.rows);
  }
  return new Uint8Array(await book.xlsx.writeBuffer());
 }
 return {MODEL_HEADERS,DEFAULT_HEADERS,layoutIndex,layoutFor,details,modelRow,field,ldRow,groupRows,build};
});
