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
  if(/^(DOCUMENTO|DOCUMENTO SIGEM|DOCUMENTO \(SIGEM\)|DOCUMENTO COMPLETO|CODIGO (?:DO )?DOCUMENTO|CODIGO DOCUMENTAL|NOME (?:DO )?DOCUMENTO)$/.test(h))return 'document';
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
  if(!['effectiveDate','deadline','modified','included'].includes(kind))return value;
  const raw=text(value),iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/),br=raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/),m=iso||br;
  if(!m)return value;
  let year=Number(iso?m[1]:m[3]);if(br&&m[3].length===2)year+=2000;if(year<1900)return value;
  const month=Number(m[2]),day=Number(iso?m[3]:m[1]),hour=Number(m[4]||0),minute=Number(m[5]||0),second=Number(m[6]||0);
  const date=new Date(Date.UTC(year,month-1,day,hour,minute,second));
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day&&date.getUTCHours()===hour&&date.getUTCMinutes()===minute&&date.getUTCSeconds()===second?date:value;
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
  sheet.columns.forEach((column,i)=>{const f=headers===MODEL_HEADERS&&i===0?'document':field(headers[i]);column.width=f==='title'?90:f==='document'?52:f==='databook'?65:f==='report'?62:f==='route'?48:f==='observation'?70:24;column.numFmt='@';});
  sheet.eachRow((row,index)=>{row.font={name:'Aptos',size:11,color:{argb:'FF20384D'}};row.alignment={vertical:'middle',wrapText:true};
   if(index===1){row.height=32;row.alignment={vertical:'middle',horizontal:'center',wrapText:true};row.font={name:'Aptos',size:11,bold:true,color:{argb:'FFFFFFFF'}};row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1F4E78'}};}
   else{row.height=Math.min(409,Math.max(34,...row.values.slice(1).map((v,i)=>Math.ceil((v instanceof Date?10:String(v??'').length)/(sheet.getColumn(i+1).width||24))*14+12)));row.fill={type:'pattern',pattern:'solid',fgColor:{argb:index%2?'FFFFFFFF':'FFF0F5FA'}};row.eachCell({includeEmpty:true},cell=>{if(cell.value instanceof Date)cell.numFmt=(cell.value.getUTCHours()||cell.value.getUTCMinutes())?'dd/mm/yyyy hh:mm':'dd/mm/yyyy';cell.border={bottom:{style:'hair',color:{argb:'FFDCE5ED'}}};});}
  });
  sheet.pageSetup={orientation:'landscape',paperSize:8,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'};
 }
 async function build(results,ExcelJS){
  const book=new ExcelJS.Workbook();book.creator='GRCON';book.subject='Títulos e linhas completas para inclusão na LD';
  const titles=book.addWorksheet('Títulos');titles.addRow(MODEL_HEADERS);results.forEach(row=>titles.addRow(modelRow(row)));style(titles,MODEL_HEADERS,results);
  const names=new Set(['títulos']);
  for(const group of groupRows(results)){
   const stem=('LD - '+(group.layout.known?(group.layout.sheet||'Documentos'):'Padrão')).replace(/[\\/*?:\[\]]/g,' ').slice(0,27);let name=stem,n=1;while(names.has(name.toLowerCase())){const suffix=' '+(++n);name=stem.slice(0,31-suffix.length)+suffix;}names.add(name.toLowerCase());
   const sheet=book.addWorksheet(name),converted=group.rows.map(row=>ldRow(row,group.layout));sheet.addRow(converted[0].headers);converted.forEach(row=>sheet.addRow(row.values));style(sheet,converted[0].headers,group.rows);
  }
  return new Uint8Array(await book.xlsx.writeBuffer());
 }

 // Corrections in the exact source, using the preserved OOXML cell patcher.
 async function reviseAudit(file,rows,sourceHash,XLSX,JSZip,Writer,Preservation){
  if(!/^[a-f0-9]{64}$/.test(sourceHash||''))throw Error('SHA-256 da LD original obrigatório. Reanexe a fonte.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!==sourceHash)throw Error('A LD foi alterada desde a importação. Correção bloqueada.');
  const zip=await JSZip.loadAsync(bytes,{checkCRC32:true}),originalZip=await JSZip.loadAsync(bytes,{checkCRC32:true});
  const book=XLSX.read(bytes,{type:'array',cellFormula:true,cellDates:false});
  const workbook=await zip.file('xl/workbook.xml')?.async('string'),rels=await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if(!workbook||!rels)throw Error('Estrutura da LD indisponível.');
  const decode=v=>v.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map(m=>[m[1],decode(m[2])]));
  const relations=new Map([...rels.matchAll(/<Relationship\b[^>]*\/?\s*>/g)].map(m=>{const a=attrs(m[0]);return [a.Id,a.Target];}));
  const paths=new Map([...workbook.matchAll(/<sheet\b[^>]*\/?\s*>/g)].map(m=>{const a=attrs(m[0]),target=relations.get(a['r:id'])||'';return [a.name,target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'')];}));
  const patch=new Map(),changes=[],unchanged=[],seen=new Map();
  for(const row of rows){
   if(!['title','workflow','databook','tag','eap','discipline','N1','N2','N3','N4','N5','N6'].includes(row.field)||row.decision!=='approved'||!row.revision||!row.document||!Number.isInteger(row.row)||row.row<2||!String(row.proposed||'').trim())throw Error('Correção de origem incompleta.');
   const sheet=book.Sheets[row.sheet];if(!sheet)throw Error('Aba exata da LD não encontrada.');
   const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true});
   const targetKind=/^N[1-6]$/.test(row.field)?'level:'+row.field.slice(1):row.field;
   const headers=matrix.slice(0,Math.min(35,row.row-1)).map((values,i)=>({values,i})).filter(h=>h.values.some(v=>field(v)==='document')&&h.values.some(v=>field(v)==='revision'));
   if(headers.length!==1)throw Error('Cabeçalho de documento e revisão não identificado de forma única.');
   const header=headers[0].values;
   const column=kind=>{const matches=header.flatMap((v,i)=>field(v)===kind?[i]:[]);if(matches.length!==1)throw Error('Coluna '+kind+' ausente ou ambígua na LD.');return matches[0];};
   const values=matrix[row.row-1]||[];
   if(String(values[column('document')]||'').trim()!==row.document||String(values[column('revision')]??'').trim()!==row.revision)throw Error('Código ou revisão diferente na linha de origem da LD.');
   const actualKind=targetKind==='workflow'&&!header.some(v=>field(v)==='workflow')?'discipline':targetKind;
   const cell=XLSX.utils.encode_cell({r:row.row-1,c:column(actualKind)}),target=sheet[cell],before=String(target?.v??'');
   if(target?.f)throw Error('A célula '+cell+' contém fórmula.');
   const address=XLSX.utils.decode_cell(cell);
   if((sheet['!merges']||[]).some(m=>address.r>=m.s.r&&address.r<=m.e.r&&address.c>=m.s.c&&address.c<=m.e.c))throw Error('A célula '+cell+' é mesclada.');
   if(before===row.proposed){unchanged.push({lineage:row.lineage,field:row.field,reason:'LD já contém o valor aprovado'});continue;}
   if(before!==String(row.current??''))throw Error('O valor da LD difere do valor auditado em '+cell+'.');
   const part=paths.get(row.sheet);if(!/^xl\/worksheets\/[^/]+\.xml$/.test(part||'')||!zip.file(part))throw Error('Parte OOXML da origem indisponível.');
   const key=part+'|'+cell;
   if(seen.has(key)&&seen.get(key)!==row.proposed)throw Error('Correções conflitantes para a mesma célula da LD.');
   if(!seen.has(key)){const xml=patch.has(part)?patch.get(part):await zip.file(part).async('string');patch.set(part,Writer.patchCellXml(xml,cell,row.row,row.proposed));seen.set(key,row.proposed);}
   changes.push({cell,sheet:row.sheet,lineage:row.lineage,document:row.document,revision:row.revision,field:row.field,before,after:row.proposed});
  }
  for(const [part,xml] of patch)zip.file(part,xml);
  const output=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),final=await JSZip.loadAsync(output,{checkCRC32:true});
  const preservation=await Preservation.verify(originalZip,final,patch);
  const reopened=XLSX.read(output,{type:'array',cellFormula:true});
  for(const change of changes)if(String(reopened.Sheets[change.sheet]?.[change.cell]?.v??'')!==change.after)throw Error('A cópia da LD não confirmou a correção.');
  return {buffer:output,count:seen.size,changes,unchanged,preservation,fileName:file.name.replace(/\.xlsx$/i,'')+'_CORRIGIDA.xlsx'};
 }
 return {MODEL_HEADERS,DEFAULT_HEADERS,layoutIndex,layoutFor,details,modelRow,field,ldRow,groupRows,build,reviseAudit};
});
