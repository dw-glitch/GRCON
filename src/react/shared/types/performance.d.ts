export {};
declare global {
  interface Window {
    GrconPerformance?: {
      supported: boolean;
      buildSpreadsheet(kind: string, payload: Record<string, unknown>, onProgress?: (detail: { message?: string; done?: number; total?: number; progress?: number }) => void): Promise<ArrayBuffer>;
      loadLd?(file: File, profile?: unknown, onProgress?: (detail: { message?: string; done?: number; total?: number; progress?: number }) => void): Promise<{ parsed: { records: unknown[]; history: unknown[] } }>;
      processData?(action: string, payload: Record<string, unknown>, onProgress?: (detail: { message?: string; done?: number; total?: number }) => void): Promise<unknown>;
      importWorkbook?(file: File, kind: string, onProgress?: (detail: { message?: string; done?: number; total?: number }) => void): Promise<unknown>;
    };
  }
}
