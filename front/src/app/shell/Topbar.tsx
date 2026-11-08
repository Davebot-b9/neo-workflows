import { Menu, Monitor, Moon, Search, Sun } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { Kbd } from "../../components/ui/misc";
import { StatusDot } from "../../components/ui/StatusDot";
import type { Tone } from "../../domain/meta";
import { useHealth } from "../../hooks/useHealth";
import { useGateway } from "../gateway/gatewayContext";
import type { NavItem } from "../navigation";
import { cycleTheme, useTheme } from "../theme";
import { openPalette } from "./paletteStore";

const THEME_ICON = { system: Monitor, light: Sun, dark: Moon } as const;
const THEME_LABEL = { system: "Tema: sistema", light: "Tema: claro", dark: "Tema: oscuro" } as const;

export function Topbar({ item, onMenu }: { item: NavItem; onMenu: () => void }) {
  const theme = useTheme();
  const ThemeIcon = THEME_ICON[theme];

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Abrir menú">
          <Menu className="size-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight">{item.label}</h1>
          <p className="hidden truncate text-xs text-fg-muted sm:block">{item.description}</p>
        </div>

        <button
          type="button"
          onClick={openPalette}
          className="hidden h-9 w-56 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-fg-subtle transition-colors hover:border-line-strong hover:text-fg-muted md:flex"
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-left">Buscar o ir a…</span>
          <Kbd>⌘K</Kbd>
        </button>
        <Button variant="ghost" size="icon" className="md:hidden" onClick={openPalette} aria-label="Abrir paleta de comandos">
          <Search className="size-4" />
        </Button>

        <HealthPill />

        <Button variant="ghost" size="icon" onClick={cycleTheme} aria-label={`${THEME_LABEL[theme]} (cambiar)`} title={THEME_LABEL[theme]}>
          <ThemeIcon className="size-4" />
        </Button>
      </div>
    </header>
  );
}

function HealthPill() {
  const { mode } = useGateway();
  const health = useHealth(20_000);

  let tone: Tone = "neutral";
  let label = "Revisando";
  if (mode === "demo") {
    tone = "accent";
    label = "Demo";
  } else if (health.status === "operational") {
    tone = "good";
    label = "Operativo";
  } else if (health.status === "degraded") {
    tone = "warn";
    label = "Degradado";
  } else if (health.status === "down") {
    tone = "critical";
    label = "Sin conexión";
  }

  return (
    <span
      className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium sm:flex"
      role="status"
      title={health.error ?? (health.latencyMs !== null ? `/healthz en ${health.latencyMs} ms` : undefined)}
    >
      <StatusDot tone={tone} pulse={tone === "good" || tone === "accent"} />
      {label}
    </span>
  );
}
