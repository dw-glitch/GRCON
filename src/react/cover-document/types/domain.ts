export type ValidationLevel = "error" | "warning" | "info";
export type SourceDocumentKind = "pdf" | "docx";

export interface LdColumnValue {
  header: string;
  value: string;
}

export interface LdDocumentRecord {
  document: string;
  documentKey?: string;
  title: string;
  revision?: string;
  effectiveDate?: string;
  discipline?: string;
  documentType?: string;
  documentTypeDesc?: string;
  format?: string;
  tag?: string;
  sheet?: string;
  row?: number;
  source?: string;
  ldVersion?: string;
  ldPrazo?: string;
  ldColumns?: LdColumnValue[];
}

export interface CoverDocumentCandidate {
  id: string;
  record: LdDocumentRecord;
  documentNumber: string;
  title: string;
  taxonomy: string;
  eap: string;
  category: string;
  categoryLabel: string;
  classification: string;
  revision: string;
  revisionDate: string;
  discipline: string;
  tag: string;
  ldName: string;
  sheet: string;
  row: number;
  score: number;
}

export interface CoverDocumentData {
  title: string;
  documentNumber: string;
  taxonomy: string;
  eap: string;
  category: string;
  categoryLabel: string;
  classification: string;
  internalDocumentCode: string;
  revision: string;
  revisionDescription: string;
  revisionDate: string;
  discipline: string;
  tag: string;
  executor: string;
  checker: string;
  approver: string;
}

export interface SourceDocumentInfo {
  file: File;
  kind: SourceDocumentKind;
  originalPages: number | null;
  pageCountSource: "exact" | "metadata" | "manual" | "unknown";
}

export interface ValidationMessage {
  id: string;
  level: ValidationLevel;
  message: string;
}

export interface CoverGeneratedFile {
  blob: Blob;
  fileName: string;
  kind: SourceDocumentKind;
}

export interface CoverDebugState {
  ldCount: number;
  candidateCount: number;
  selectedDocument: string;
  sourceName: string;
  busy: boolean;
  validationErrors: number;
}
