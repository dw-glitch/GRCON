import type { SigemPwAggregateMap,SigemPwBase,SigemPwBaseMeta,SigemPwEditableBaseKind,SigemPwHistory,SigemPwModel,SigemPwReadiness,SigemPwRecord,SigemPwResult,SigemPwState,WorkerModelPayload } from "./domain";
interface PreparedConferenceImport { parsed:{meta:SigemPwBaseMeta;records:SigemPwRecord[]}; summary?:unknown; changes?:unknown; }
interface ConferenceDetection { score:number; columns:Record<string,number>; }
interface PostingConferenceApi {
 detectColumns(matrix:string[][],maxColumns?:number):ConferenceDetection|null;
 prepareWorkbookImport(workbook:unknown,fileMeta:Record<string,unknown>,history:unknown[],options:Record<string,unknown>):Promise<PreparedConferenceImport>;
 commitPreparedImport(result:PreparedConferenceImport):Promise<unknown>;
}
interface SigemPwDashboardCoreApi {
 SIGEM_BASE_KEY:string;PW_BASE_KEY:string;LD_BASE_KEY:string;HISTORY_KEY:string;LEGACY_SIGEM_BASE_KEY:string;LEGACY_PW_BASE_KEY:string;HISTORY_VERSION:number;PW_SCOPE_VERSION:number;
 normalizeHeader(value:unknown):string; norm(value:unknown):string; parseDateMs(value:unknown):number;
 parsePwCsv(source:string,meta:Record<string,unknown>):{meta:SigemPwBaseMeta;records:SigemPwRecord[]};
 parseLdMatrix(matrix:string[][],meta:Record<string,unknown>):{meta:SigemPwBaseMeta;records:SigemPwRecord[]};
 sanitizePwBase(base:SigemPwBase,ld:SigemPwBase|SigemPwRecord[]):SigemPwBase;
 createModel(sigem:SigemPwRecord[],pw:SigemPwRecord[],ld:SigemPwRecord[]):SigemPwModel;
 aggregateModel(model:SigemPwModel,filters?:{documentClass?:string}):SigemPwResult;
 loadBases():Promise<{sigem:SigemPwBase;pw:SigemPwBase;ld:SigemPwBase;history:SigemPwHistory}>;
 loadHistory():Promise<SigemPwHistory>; saveSigemBase(base:SigemPwBase):Promise<SigemPwBase>; savePwBase(base:SigemPwBase,ld?:SigemPwBase|SigemPwRecord[]):Promise<SigemPwBase>;
 saveLdAndReprocessPw(ld:SigemPwBase,pw:SigemPwBase):Promise<{ld:SigemPwBase;pw:SigemPwBase|null}>;
 updateSnapshotDate(kind:SigemPwEditableBaseKind,snapshotId:string,importedAt:string):Promise<{current?:SigemPwBase;importedAt:string}>;
 deleteSnapshot(snapshotId:string):Promise<unknown>; kvGet<T>(key:string,fallback:T):Promise<T>; kvSet(key:string,value:unknown):Promise<unknown>; kvSetMany(entries:Array<[string,unknown]>):Promise<boolean>;
}
interface SigemPwReadinessApi { assess(state:SigemPwState,result:SigemPwResult):SigemPwReadiness; }
interface RecordedActiveBases { sigem?:{snapshot?:{id?:string}}; pw?:{snapshot?:{id?:string}}; rollbackToken?:unknown; }
interface SigemPwHistoryApi {
 clearHistory():Promise<unknown>; recordActiveBases(sigem:SigemPwBase,pw:SigemPwBase,options:Record<string,unknown>):Promise<RecordedActiveBases>;
 rollbackRecordedActiveBases(recorded:RecordedActiveBases):Promise<unknown>; updateSourceSnapshotDate(system:SigemPwEditableBaseKind,snapshotId:string,importedAt:string):Promise<unknown>;
 contentFingerprint(system:string,records:SigemPwRecord[]):string;
}
interface SigemPwHistoryManagementApi { capturePayload(system:string,base:SigemPwBase,snapshotId:string,context:Record<string,unknown>):Promise<unknown>; state?:{open?:boolean;[key:string]:unknown}; activate?:()=>Promise<unknown>|unknown; }
interface SigemPwDashboardUiApi { activate():Promise<void>;refresh(reason?:string):Promise<void>;clearPreStage7BasesOnce():Promise<boolean>;state:SigemPwState; }
interface SigemPwBootstrapApi { open():Promise<void>;openEvolution():Promise<unknown>;deactivate():void; }
interface LegacyActivationApi { activate?:(...args:unknown[])=>Promise<unknown>|unknown;refresh?:(...args:unknown[])=>Promise<unknown>|unknown;state?:Record<string,unknown>; }
declare global { interface Window {
 GrconSigemPwDashboard?:SigemPwDashboardCoreApi;GrconSigemPwReadiness?:SigemPwReadinessApi;GrconSigemPwHistory?:SigemPwHistoryApi;GrconSigemPwHistoryManagement?:SigemPwHistoryManagementApi;
 GrconSigemPwRevision?:LegacyActivationApi&{analyze?:(...args:unknown[])=>unknown;analyzeAsync?:(...args:unknown[])=>Promise<unknown>};
 GrconSigemPwDashboardUi?:SigemPwDashboardUiApi;GrconSigemPwRevisionUi?:LegacyActivationApi;GrconSigemPwEvolutionUi?:LegacyActivationApi;GrconSigemPwDashboardBootstrap?:SigemPwBootstrapApi;GrconSigemPwDashboardReact?:{mounted:boolean};GrconPostingConference?:PostingConferenceApi;
 } interface WindowEventMap {
 "grcon:conference-updated":CustomEvent<{source?:string;[key:string]:unknown}>;"grcon:pw-base-updated":CustomEvent<{source?:string;[key:string]:unknown}>;"grcon:sigem-pw-base-date-updated":CustomEvent<Record<string,unknown>>;"grcon:mascot-operation":CustomEvent<Record<string,unknown>>;
 }}
export type { SigemPwDashboardCoreApi, WorkerModelPayload };
export {};