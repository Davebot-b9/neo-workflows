import type { ModePreference } from "../../api/createGateway";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { StatusDot } from "../../components/ui/StatusDot";
import { useGateway } from "../gateway/gatewayContext";

const OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "live", label: "En vivo" },
  { value: "demo", label: "Demo" },
] as const satisfies readonly { value: ModePreference; label: string }[];

/** Elige la estrategia de NeoGateway. "Auto" detecta neo-api al arrancar. */
export function ModeSwitch() {
  const { mode, preference, setPreference } = useGateway();
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">Fuente de datos</p>
        <span className="flex items-center gap-1.5 text-[11px] text-fg-muted">
          <StatusDot tone={mode === "live" ? "good" : "accent"} pulse={mode === "live"} />
          {mode === "live" ? "neo-api" : "simulada"}
        </span>
      </div>
      <SegmentedControl label="Fuente de datos" options={OPTIONS} value={preference} onChange={setPreference} size="sm" className="w-full" />
    </div>
  );
}
