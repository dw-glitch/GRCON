export type MascotState = "hidden" | "hello" | "idle" | "analyzing" | "warning" | "success" | "running";

export interface MascotShowOptions {
  state?: MascotState;
  target?: Element | string | null;
  message?: string;
  duration?: number;
  source?: string;
  force?: boolean;
}

export interface MascotOperation {
  readonly id: string;
  success(detail?: Omit<MascotShowOptions, "state">): boolean;
  warning(detail?: Omit<MascotShowOptions, "state">): boolean;
  cancel(): boolean;
  end(): boolean;
  running(message?: string): boolean;
  analyzing(message?: string): boolean;
}

export interface GrconMascotApi {
  readonly version: string;
  readonly engine: string;
  show(state: MascotState | MascotShowOptions, options?: Omit<MascotShowOptions, "state">): MascotState | string;
  warning(options?: Omit<MascotShowOptions, "state"> | string): string;
  success(options?: Omit<MascotShowOptions, "state">): string;
  run(options?: Omit<MascotShowOptions, "state">): Promise<boolean>;
  idle(options?: { source?: string }): string;
  hide(): string;
  begin(options?: MascotShowOptions): MascotOperation;
  setEnabled(enabled: boolean): boolean;
  isEnabled(): boolean;
  refresh(pose?: string): unknown;
  diagnostics(): Record<string, unknown>;
}

declare global {
  interface Window {
    GrconMascot?: GrconMascotApi;
  }
}
