export {};
declare global {
  interface Window {
    GrconPerformance?: {
      supported: boolean;
      buildSpreadsheet(kind: string, payload: Record<string, unknown>): Promise<ArrayBuffer>;
    };
  }
}
