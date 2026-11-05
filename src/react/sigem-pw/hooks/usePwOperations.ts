import { useEffect, useMemo, useState } from "react";
import type { SigemPwState } from "../types/domain";
import { reconcilePwOperations, type PwOperationsReport } from "../services/sigemPwOperations";
import { runPwProcessing } from "../services/sigemPwProcessingClient";

function pending(reason: string): PwOperationsReport {
  return { ready: false, reason, rows: [], byClass: [], diagnostics: [], outside: [],
    totals: { sigem: 0, registerSigem: 0, registerAbsent: 0, registered: 0, issue: 0, issued: 0 },
    reconciliation: { records: 0, documents: 0, pairs: 0, inScopePairs: 0, outsidePairs: 0, duplicates: 0, invalid: 0, omitted: null, revision0: { pairs: 0, inScopePairs: 0, outsidePairs: 0 } } };
}
export function usePwOperations(state: SigemPwState): PwOperationsReport {
  const input = useMemo(() => ({ sigem: state.sigem, pw: state.pw, ld: state.ld, analysisError: state.analysisError, model: state.model ? { normalizedPw: state.model.normalizedPw } : null }), [state.ld, state.pw, state.sigem, state.model, state.analysisError]);
  const [completed, setCompleted] = useState<{ input: typeof input; report: PwOperationsReport }>();
  const compatible = useMemo(() => {
    if (typeof Worker !== "undefined") return null;
    return state.ld.records.length + state.sigem.records.length + state.pw.records.length <= 5000
      ? reconcilePwOperations(state) : pending("Use um navegador com Worker para comparar bases grandes.");
  }, [input]);
  useEffect(() => {
    if (typeof Worker === "undefined") return;
    const controller = new AbortController();
    runPwProcessing<PwOperationsReport>({ kind: "operations", state: input }, controller.signal).then(
      report => { if (!controller.signal.aborted) setCompleted({ input, report }); },
      error => { if (!controller.signal.aborted) setCompleted({ input, report: pending(error instanceof Error ? error.message : "Falha na comparação operacional.") }); },
    );
    return () => controller.abort();
  }, [input]);
  return compatible || (completed?.input === input ? completed.report : pending("Calculando a demanda PW em segundo plano…"));
}
