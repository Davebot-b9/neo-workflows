import { Fragment, type JSX, type ReactNode } from "react";

import { useGateway } from "./app/gateway/gatewayContext";
import { GatewayProvider } from "./app/gateway/GatewayProvider";
import { useRoute, type RoutePath } from "./app/router";
import { AppShell } from "./app/shell/AppShell";
import "./app/theme";
import { HistoryPage } from "./features/history/HistoryPage";
import { FineTunePage } from "./features/jobs";
import { OverviewPage } from "./features/overview/OverviewPage";
import { RunPage } from "./features/runs/RunPage";
import { WorkflowsPage } from "./features/workflows/WorkflowsPage";

const PAGES: Record<RoutePath, () => JSX.Element> = {
  "/": OverviewPage,
  "/runs": RunPage,
  "/history": HistoryPage,
  "/workflows": WorkflowsPage,
  "/finetune": FineTunePage,
};

export function App() {
  const { path } = useRoute();
  const Page = PAGES[path];

  return (
    <GatewayProvider>
      <RemountOnModeChange>
        <AppShell path={path}>
          <Page />
        </AppShell>
      </RemountOnModeChange>
    </GatewayProvider>
  );
}

/** Al cambiar de estrategia (en vivo ↔ demo) las páginas se montan de cero contra el nuevo gateway. */
function RemountOnModeChange({ children }: { children: ReactNode }) {
  const { mode } = useGateway();
  return <Fragment key={mode}>{children}</Fragment>;
}
