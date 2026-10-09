export {};
declare global {
 interface TeamsAttempt {
  id:string;history_id:string;workspace_id:string;contract_code:string;requested_at:string;expires_at:string;
  delivery_status:string;delivered_at:string|null;message_url:string|null;
  notice_status:string;card_updated_at:string|null;
  confirmation_type:string|null;confirmed_by_name:string|null;confirmed_at:string|null;
  documents:Array<{document:string;revision:string}>;confirmed_documents:Array<{document:string;revision:string}>|null;
 }
 interface Window {
  GrconTeamsTrace?:{
   latest(record:unknown):TeamsAttempt|null;list(record:unknown):TeamsAttempt[];snapshot():TeamsAttempt[];
   forExport():Promise<TeamsAttempt[]>;refresh():Promise<TeamsAttempt[]>;openHistory(id:string):Promise<void>;
   sigemEvidence(records:unknown[]):Record<string,string>;
   consultationRows(rows:unknown[]):Promise<unknown[]>;
  };
  GrconTeamsTraceCore?:{headers:string[];label(a:TeamsAttempt|null):string;confirmed(a:TeamsAttempt,file:unknown):string};
 }
}
