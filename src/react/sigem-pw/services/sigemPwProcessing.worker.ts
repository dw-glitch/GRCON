import { computePwOperations } from "./sigemPwOperations";
import { buildCoordinatorWorkbook, type CoordinatorExcelApi } from "./sigemPwCoordinatorWorkbook";
import type { SigemPwState } from "../types/domain";
import type { PwFilters } from "./sigemPwOperations";

// Classic bundle, same normalizer and flags as the dashboard. No DOM access.
const runtime = globalThis as unknown as {
  window: unknown; importScripts(...urls: string[]): void;
  ExcelJS: CoordinatorExcelApi;
  postMessage(data: unknown, transfer?: Transferable[]): void;
  onmessage: (event: MessageEvent) => void;
};
runtime.window = globalThis;
runtime.onmessage = async event => {
  try {
    runtime.importScripts("../grcon_contracts.js", "../discipline_resolver.js", "../grcon_utils.js", "../core.js", "../sigem_pw_dashboard_core.js");
    const { kind, state, filters, logo } = event.data as { kind: string; state: SigemPwState; filters: PwFilters; logo?: { buffer: ArrayBuffer } };
    if (kind === "operations") {
      runtime.postMessage({ ok: true, result: computePwOperations(state) });
    } else if (kind === "export") {
      runtime.importScripts("../exceljs.min.js");
      runtime.postMessage({ progress: "Organizando as abas e fórmulas…" });
      const { workbook } = buildCoordinatorWorkbook(state, runtime.ExcelJS, logo, filters);
      runtime.postMessage({ progress: "Gerando o arquivo Excel…" });
      const bytes = await workbook.xlsx.writeBuffer();
      const buffer = new Uint8Array(bytes instanceof ArrayBuffer ? bytes : bytes).slice().buffer;
      runtime.postMessage({ ok: true, result: buffer }, [buffer]);
    } else throw new Error("Operação PW desconhecida.");
  } catch (error) { runtime.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
};
