// GRCON Worker triage — módulos externos, sem cópias embutidas
self.GRCON_ASSET_BASE = "../";
importScripts("../grcon_utils.js", "../grcon_contracts.js", "../core.js", "../ld_conflicts.js", "../timeline_core.js", "../grdt_databook_support.js");

let activeIndex = null;
let catalogEntries = [];
let baseSettings = {};
const cancelled = new Set();
const CHUNK = 350;
const RESULT_CHUNK = 600;
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
function memoryMb() { return self.performance && performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null; }
function ensure(taskId) { if (cancelled.has(taskId)) { const error = new Error("Processamento cancelado pelo usuário."); error.name = "AbortError"; throw error; } }
function compactSuggestion(row) {
  if (!self.GrconDatabookSupport || !row || !row.egrdt || row.egrdt.databook) return null;
  return self.GrconDatabookSupport.suggestCatalogDatabook({
    document: row.document,
    documentKey: self.TriagemCore.key(row.document),
    title: row.egrdt.title || (row.record && row.record.title) || "",
    discipline: row.egrdt.discipline || (row.record && row.record.discipline) || "",
  }, catalogEntries);
}
self.onmessage = async (event) => {
  const { taskId, action, payload = {} } = event.data || {};
  if (action === "cancel") { cancelled.add(payload.taskId || taskId); return; }
  const started = performance.now();
  try {
    if (action === "initialize") {
      activeIndex = payload.index; catalogEntries = payload.catalogEntries || []; baseSettings = payload.settings || {};
      self.postMessage({ taskId, type: "done", result: { initialized: true, documents: activeIndex && activeIndex.documents ? activeIndex.documents.length : 0 }, metrics: { stage: "triage-initialize", durationMs: performance.now()-started, memoryMb: memoryMb() } }); return;
    }
    if (!activeIndex) throw new Error("O Worker de triagem não recebeu o índice da LD.");
    if (action === "triage") {
      const source = payload.inputs || []; let buffer = [];
      for (let start=0; start<source.length; start+=CHUNK) {
        ensure(taskId); const end=Math.min(source.length,start+CHUNK);
        for (let i=start;i<end;i++) {
          const result=self.TriagemCore.triageOne(source[i], activeIndex, { ...baseSettings, ...(payload.settings||{}) });
          if (result.egrdt && !result.egrdt.format) result.egrdt.format="A4";
          buffer.push(result);
          if (buffer.length>=RESULT_CHUNK) { self.postMessage({ taskId, type:"chunk", chunk:buffer }); buffer=[]; }
        }
        self.postMessage({ taskId, type:"progress", progress:end/Math.max(1,source.length), completed:end, total:source.length, message:"Triagem em segundo plano" });
        if (end<source.length) await pause();
      }
      if (buffer.length) self.postMessage({ taskId, type:"chunk", chunk:buffer });
      self.postMessage({ taskId, type:"done", result:{ count:source.length }, metrics:{ stage:"triage", durationMs:performance.now()-started, items:source.length, memoryMb:memoryMb() } }); return;
    }
    if (action === "enrich") {
      const source=payload.rows||[]; let buffer=[];
      for (let start=0; start<source.length; start+=CHUNK) {
        ensure(taskId); const end=Math.min(source.length,start+CHUNK);
        for (let i=start;i<end;i++) {
          const row=source[i]; const documentKey=row.documentKey||self.TriagemCore.key(row.document);
          const group=activeIndex.byDocument && activeIndex.byDocument.get(documentKey);
          const timeline=group && self.TimelineCore ? self.TimelineCore.buildTimeline({documentKey,document:row.document,group},activeIndex,{...baseSettings,...(payload.settings||{})}) : null;
          buffer.push({ index:i, timeline, databookAssistant:null, applyDatabook:false, databook:"" });
          if (buffer.length>=RESULT_CHUNK) { self.postMessage({taskId,type:"chunk",chunk:buffer}); buffer=[]; }
        }
        self.postMessage({taskId,type:"progress",progress:end/Math.max(1,source.length),completed:end,total:source.length,message:"Enriquecendo resultados"});
        if (end<source.length) await pause();
      }
      if (buffer.length) self.postMessage({taskId,type:"chunk",chunk:buffer});
      self.postMessage({taskId,type:"done",result:{count:source.length},metrics:{stage:"triage-enrichment",durationMs:performance.now()-started,items:source.length,memoryMb:memoryMb()}}); return;
    }
    throw new Error("Ação desconhecida no Worker de triagem.");
  } catch(error) {
    self.postMessage({taskId,type:error && error.name==="AbortError"?"cancelled":"error",error:String(error&&error.message||error),stack:String(error&&error.stack||"")});
  } finally { cancelled.delete(taskId); }
};
