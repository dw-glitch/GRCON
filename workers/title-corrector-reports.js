'use strict';
// Relatórios sem persistir LD ou decisões fora do navegador.
self.GrconTitleReports=Object.freeze({
 report(rows){
  const head=['ARQUIVO LD','DOCUMENTO','ABA','LINHA','DISCIPLINA','TITULO ATUAL','TITULO RECOMENDADO','DECISAO','SITUACAO','CONFIANCA','FONTE','O QUE E','ONDE E','PARA QUE E','EAP','RASTREABILIDADE'];
  const fact=(r,key)=>(r.facts||[]).find(x=>x.field===key)?.value||'NAO COMPROVADO';
  const matrix=[head,...(rows||[]).map(r=>[r.sourceFile||'',r.document,r.sheet,r.row,r.discipline,r.current,r.proposed,r.decision,r.issue,r.confidence,r.descriptionSource,
   fact(r,'objeto'),fact(r,'localizacao'),fact(r,'finalidade_documental'),fact(r,'eap_classificacao'),
   (r.facts||[]).map(f=>f.field+': '+f.value+' ('+f.source+')').join(' | ')])];
  const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet(matrix);
  sheet['!cols']=[{wch:34},{wch:52},{wch:14},{wch:8},{wch:18},{wch:70},{wch:85},{wch:14},{wch:22},{wch:12},{wch:28},{wch:45},{wch:30},{wch:45},{wch:20},{wch:100}];
  XLSX.utils.book_append_sheet(book,sheet,'Auditoria de Titulos');
  return {bytes:new Uint8Array(XLSX.write(book,{type:'array',bookType:'xlsx'})),name:'GRCON_Auditoria_Titulos.xlsx'};
 },
 async package(rows,reportRows,exportLd){
   const zip=new JSZip(),items=[];
   if((rows||[]).some(row=>row.decision==='approved')){
     const approved=await exportLd(rows);
     zip.file(approved.name,approved.bytes);items.push(approved.name);
   }
   const report=self.GrconTitleReports.report(reportRows||[]);
   zip.file(report.name,report.bytes);items.push(report.name);
   const pending=self.GrconTitleReports.report((reportRows||[]).filter(r=>r.hasConflict||!r.proposed||r.confidence==='baixa'));
   zip.file('GRCON_Pendencias_Titulos.xlsx',pending.bytes);items.push('GRCON_Pendencias_Titulos.xlsx');
   return {bytes:await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),name:'GRCON_Pacote_Revisao_Titulos.zip',items};
 }
});