(function(root){
  "use strict";
  const MAX_FILES=12,MAX_TOTAL=70*1024*1024;
  let host=null;
  const state={items:[],busy:false,abort:null,active:false};
  const $=id=>document.getElementById(id);
  const esc=value=>String(value||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmt=size=>size>=1048576?(size/1048576).toLocaleString("pt-BR",{maximumFractionDigits:1})+" MB":Math.ceil(size/1024).toLocaleString("pt-BR")+" KB";
  const notify=(message,kind="info")=>root.GrconNotify?.(message,kind);
  function setup(){
    host=$("grcon-docx-pdf-root");
    if(!host||host.dataset.ready==="true")return;
    host.dataset.ready="true";
    host.innerHTML='<div class="docx-pdf-layout">'+
      '<header class="docx-pdf-heading"><div><span>FERRAMENTAS ADICIONAIS / CONVERSÃO</span><h2>Converter DOCX para PDF</h2><p>Crie arquivos PDF a partir de documentos Word, sem alterar os originais e sem enviar os arquivos para a nuvem.</p></div><button type="button" class="secondary-button" data-grcon-view="additional-tools">← Voltar às ferramentas</button></header>'+
      '<div class="docx-pdf-grid"><section class="docx-pdf-panel" aria-labelledby="docx-pdf-upload-title">'+
      '<div class="docx-pdf-panel-heading"><div><span>ETAPA 1</span><h3 id="docx-pdf-upload-title">Selecionar documentos</h3></div><span class="docx-pdf-format-chip">DOCX → PDF</span></div>'+
      '<div id="docx-pdf-drop" class="docx-pdf-drop" role="button" tabindex="0" aria-label="Selecionar documentos DOCX ou arrastar arquivos"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7zM14 3v5h5M12 11v7M9 14h6"/></svg><strong>Arraste os arquivos DOCX aqui</strong><span>ou clique para escolher no computador</span><small>Até 12 documentos · 20 MB por arquivo · 70 MB por lote</small></div>'+
      '<input id="docx-pdf-input" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple hidden>'+
      '<div class="docx-pdf-files-heading"><strong>Arquivos selecionados</strong><button class="secondary-button compact" type="button" id="docx-pdf-clear">Limpar lista</button></div>'+
      '<ul id="docx-pdf-list" class="docx-pdf-list" aria-live="polite"></ul></section>'+
      '<aside class="docx-pdf-panel docx-pdf-settings" aria-labelledby="docx-pdf-options-title"><div class="docx-pdf-panel-heading"><div><span>ETAPA 2</span><h3 id="docx-pdf-options-title">Gerar PDF</h3></div></div>'+
      '<dl class="docx-pdf-facts"><div><dt>Formato de entrada</dt><dd>.docx</dd></div><div><dt>Formato de saída</dt><dd>PDF</dd></div><div><dt>Tratamento</dt><dd>Local no navegador</dd></div><div><dt>Arquivos originais</dt><dd>Preservados</dd></div></dl>'+
      '<div class="docx-pdf-limits"><strong>Compatibilidade inicial</strong><p>Converte texto, títulos, estilos básicos, tabelas simples e imagens PNG/JPEG. Cabeçalhos, rodapés, numeração, objetos especiais e layouts complexos podem mudar ou não aparecer. Para documentos oficiais que exigem fidelidade exata, confira o PDF e utilize a exportação do Microsoft Word quando necessário.</p></div>'+
      '<label class="docx-pdf-ack"><input id="docx-pdf-confirm" type="checkbox"> <span>Entendo que devo conferir a formatação do PDF antes de usá-lo como documento oficial.</span></label>'+
      '<button id="docx-pdf-convert" type="button" class="primary-button" disabled>Converter e baixar PDF</button>'+
      '<button id="docx-pdf-cancel" type="button" class="secondary-button" hidden>Cancelar conversão</button>'+
      '<div class="docx-pdf-progress" id="docx-pdf-progress" hidden role="status" aria-live="polite"><div><strong id="docx-pdf-progress-title">Preparando conversão</strong><span id="docx-pdf-percent">0%</span></div><progress id="docx-pdf-progress-bar" max="100" value="0"></progress><small id="docx-pdf-stage"></small></div>'+
      '<p id="docx-pdf-feedback" class="docx-pdf-feedback" role="status" aria-live="polite">Selecione ao menos um documento para começar.</p>'+
      '<p class="docx-pdf-privacy">Os documentos não são armazenados no Cofre, no histórico ou no servidor. Cada conversão é iniciada por você.</p></aside></div></div>';
    const input=$("docx-pdf-input"),drop=$("docx-pdf-drop");
    drop.addEventListener("click",()=>{if(!state.busy)input.click();});
    drop.addEventListener("keydown",e=>{if(["Enter"," "].includes(e.key)){e.preventDefault();if(!state.busy)input.click();}});
    drop.addEventListener("dragover",e=>{e.preventDefault();if(!state.busy)drop.classList.add("dragover");});
    drop.addEventListener("dragleave",()=>drop.classList.remove("dragover"));
    drop.addEventListener("drop",e=>{e.preventDefault();drop.classList.remove("dragover");if(!state.busy)addFiles(e.dataTransfer?.files);});
    input.addEventListener("change",()=>{addFiles(input.files);input.value="";});
    $("docx-pdf-list").addEventListener("click",e=>{
      const b=e.target.closest("[data-docx-action]");
      if(!b||state.busy)return;
      const item=state.items.find(item=>item.id===b.dataset.id);
      if(!item)return;
      if(b.dataset.docxAction==="remove")state.items=state.items.filter(v=>v!==item);
      else if(b.dataset.docxAction==="download"&&item.bytes)download(item.bytes,item.output);
      render();
    });
    $("docx-pdf-clear").addEventListener("click",()=>{if(!state.busy){state.items=[];render();}});
    $("docx-pdf-confirm").addEventListener("change",render);
    $("docx-pdf-convert").addEventListener("click",()=>void convertAll());
    $("docx-pdf-cancel").addEventListener("click",()=>state.abort?.abort());
    render();
  }
  function addFiles(fileList){
    if(!fileList||state.busy)return;
    const files=Array.from(fileList);
    const invalid=files.filter(f=>!/\.docx$/i.test(f.name)||f.name.startsWith("~$")||f.size>root.GrconDocxPdfCore.MAX_INPUT||f.size<=0);
    if(invalid.length)notify("Somente documentos .docx válidos, entre 1 byte e 20 MB, são aceitos. Arquivos temporários do Word são ignorados.","error");
    const accepted=files.filter(f=>!invalid.includes(f));
    let repeated=0;
    for(const file of accepted){
      if(state.items.some(i=>i.file.name===file.name&&i.file.size===file.size&&i.file.lastModified===file.lastModified)){repeated++;continue;}
      if(state.items.length>=MAX_FILES||state.items.reduce((sum,i)=>sum+i.file.size,0)+file.size>MAX_TOTAL){
        notify("Limite do lote: até 12 DOCX, somando no máximo 70 MB.","error");break;
      }
      state.items.push({id:String(Date.now())+"-"+Math.random().toString(36).slice(2),file,status:"ready",bytes:null,output:file.name.replace(/\.docx$/i,"")+".pdf",warnings:[],pages:0});
    }
    if(repeated)notify("Arquivos repetidos não foram adicionados novamente.","info");
    $("docx-pdf-feedback").textContent=state.items.length+" documento(s) selecionado(s).";
    render();
  }
  function render(){
    if(!host)return;
    const list=$("docx-pdf-list");
    list.replaceChildren();
    if(!state.items.length){const empty=document.createElement("li");empty.className="docx-pdf-empty";empty.textContent="Nenhum documento selecionado.";list.append(empty);}
    for(const item of state.items){
      const li=document.createElement("li");li.className="docx-pdf-file";
      const info=document.createElement("div");info.className="docx-pdf-file-info";
      const name=document.createElement("strong");name.textContent=item.file.name;
      const meta=document.createElement("small");
      const status={ready:"Pronto para converter",running:"Convertendo",done:item.pages+" página(s) · PDF pronto",error:"Falha",cancelled:"Cancelado"}[item.status]||"";
      meta.textContent=fmt(item.file.size)+" · "+status;
      info.append(name,meta);
      if(item.warnings?.length){const caution=document.createElement("small");caution.className="docx-pdf-warning";caution.textContent="Atenção: "+item.warnings.join(" ");info.append(caution);}
      const actions=document.createElement("div");actions.className="docx-pdf-file-actions";
      if(item.bytes){
        const down=document.createElement("button");down.type="button";down.className="secondary-button compact";down.textContent="Baixar PDF";down.dataset.docxAction="download";down.dataset.id=item.id;down.disabled=state.busy;actions.append(down);
      }
      const rem=document.createElement("button");rem.type="button";rem.className="secondary-button compact";rem.textContent="Remover";rem.dataset.docxAction="remove";rem.dataset.id=item.id;rem.disabled=state.busy;actions.append(rem);
      li.append(info,actions);list.append(li);
    }
    const canConvert=state.items.length>0&&!state.busy&&$("docx-pdf-confirm").checked;
    $("docx-pdf-convert").disabled=!canConvert;
    $("docx-pdf-convert").textContent=state.items.length>1?"Converter e baixar ZIP ("+state.items.length+")":"Converter e baixar PDF";
    $("docx-pdf-clear").disabled=state.busy||!state.items.length;
    $("docx-pdf-input").disabled=state.busy;
    $("docx-pdf-drop").setAttribute("aria-disabled",String(state.busy));
    $("docx-pdf-cancel").hidden=!state.busy;
    $("docx-pdf-progress").hidden=!state.busy;
  }
  function download(bytes,name){
    const blob=new Blob([bytes],{type:name.toLowerCase().endsWith(".zip")?"application/zip":"application/pdf"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=name;a.style.display="none";
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function convertAll(){
    if(state.busy||!state.items.length||!$("docx-pdf-confirm").checked)return;
    state.busy=true;state.abort=new AbortController();render();
    let success=0,failed=0;
    const selected=[...state.items],signal=state.abort.signal;
    try{
      for(let i=0;i<selected.length;i++){
        if(signal.aborted)break;
        const item=selected[i];item.status="running";item.warnings=[];item.bytes=null;render();
        const heading=(i+1)+" de "+selected.length+" · "+item.file.name;
        $("docx-pdf-progress-title").textContent=heading;
        const progress=(value,step)=>{
          $("docx-pdf-progress-bar").value=value;
          $("docx-pdf-percent").textContent=value+"%";
          $("docx-pdf-stage").textContent=step;
        };
        try{
          const result=await root.GrconDocxPdfCore.convert(item.file,{onProgress:progress,signal});
          if(signal.aborted)break;
          item.bytes=result.bytes;item.pages=result.pages;item.warnings=result.warnings;item.status="done";success++;
        }catch(e){
          if(signal.aborted||e?.name==="AbortError"){item.status="cancelled";break;}
          item.status="error";item.warnings=[e.message||"Não foi possível converter."];failed++;
        }
        render();
      }
      if(signal.aborted){$("docx-pdf-feedback").textContent="Conversão interrompida. Resultados concluídos ainda podem ser baixados.";return;}
      const done=selected.filter(item=>item.bytes);
      if(done.length===1){download(done[0].bytes,done[0].output);}
      else if(done.length>1){
        $("docx-pdf-progress-title").textContent="Preparando ZIP";
        const zip=new root.JSZip();
        // Prefixo incremental evita colisão de nomes sem renomear os originais.
        const names=new Set();
        for(const item of done){
          let name=item.output,n=2;
          while(names.has(name.toLowerCase()))name=item.output.replace(/\.pdf$/i,"")+" ("+(n++)+").pdf";
          names.add(name.toLowerCase());zip.file(name,item.bytes);
        }
        const zipBytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:4}});
        if(!signal.aborted)download(zipBytes,"GRCON_DOCX_convertidos.zip");
      }
      $("docx-pdf-feedback").textContent=success+" PDF(s) gerado(s)"+(failed?" · "+failed+" com erro. Consulte a lista.":". Confira a formatação antes do uso oficial.");
      if(success)notify(success+" documento(s) convertido(s). Confira a formatação.","success");
      if(failed)notify(failed+" documento(s) não pôde/puderam ser convertido(s).","error");
    }finally{
      state.busy=false;state.abort=null;render();
    }
  }
  function activate(){setup();state.active=true;}
  function deactivate(){state.active=false;if(state.busy)state.abort?.abort();}
  root.GrconDocxPdfUi=Object.freeze({activate,deactivate,state});
})(window);
