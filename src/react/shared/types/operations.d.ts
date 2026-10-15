export {};
declare global {
  interface GrconOperation {
    update(detail: string | { message?: string; phase?: string; done?: number; total?: number; progress?: number | null }): void;
    paint(): Promise<void>;
    assertCurrent(): void;
    finish(): void;
    fail(error: unknown): void;
    abort(): void;
    signal: AbortSignal;
  }
  interface Window {
    GrconOperations?: {
      begin(key: string, label: string, options?: { host?: string | HTMLElement | null; button?: string | HTMLElement | null; detail?: string; success?: string }): GrconOperation;
      run<T>(key: string, label: string, work: (operation: GrconOperation) => Promise<T>, options?: { host?: string | HTMLElement | null; button?: string | HTMLElement | null; detail?: string; success?: string }): Promise<T>;
      paint(): Promise<void>;
      isActive(key: string): boolean;
      metrics(): Array<{ key: string; label: string; durationMs: number; status: string }>;
    };
  }
}
