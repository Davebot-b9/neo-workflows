import { useCallback, useMemo } from "react";

import { useGateway } from "../../app/gateway/gatewayContext";
import { useResource } from "../../hooks/useResource";
import { mergeHistory, recordFromLedger, useHistory } from "./historyStore";

/** Historial local + bitácora de PostgreSQL (solo en vivo). Si GET /api/runs falla, queda el local. */
export function useMergedHistory() {
  const { gateway, mode } = useGateway();
  const local = useHistory();
  const load = useCallback((signal: AbortSignal) => gateway.listRuns(100, signal), [gateway]);
  const ledger = useResource(`ledger:${mode}`, load);

  const records = useMemo(
    () => mergeHistory(local, (ledger.data ?? []).map(recordFromLedger)),
    [local, ledger.data],
  );

  return { records, ledgerError: mode === "live" ? ledger.error : null, ledgerCount: ledger.data?.length ?? 0, reloadLedger: ledger.reload };
}
