import { Radio } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "../../lib/cn";
import type { LogEntry } from "./types";

const TYPE_COLOR: Record<string, string> = {
  "run.stage": "text-signal",
  "run.decision": "text-accent",
  "run.done": "text-good",
  "run.error": "text-critical",
};

/** Consola del stream SSE: los eventos crudos, tal como llegan de neo-api. */
export function EventLog({ entries, startedAt, live }: { entries: LogEntry[]; startedAt: number | null; live: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [entries.length]);

  return (
    <details className="group rounded-2xl border border-line bg-surface shadow-panel" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3.5 select-none">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Radio className={cn("size-4", live ? "text-accent" : "text-fg-subtle")} aria-hidden />
          Stream SSE
          <span className="font-mono text-xs font-normal text-fg-subtle">{entries.length} eventos</span>
        </span>
        <span className="text-xs text-fg-subtle group-open:hidden">Mostrar</span>
        <span className="hidden text-xs text-fg-subtle group-open:inline">Ocultar</span>
      </summary>
      <div className="max-h-64 overflow-auto border-t border-line bg-surface-2/40 px-5 py-3 font-mono text-[11px] leading-relaxed" role="log" aria-live="polite">
        {entries.length === 0 ? (
          <p className="text-fg-subtle">{live ? "Esperando eventos…" : "Sin eventos todavía."}</p>
        ) : (
          entries.map(({ at, event }) => (
            <div key={`${event.id}-${event.type}`} className="flex gap-3 whitespace-pre">
              <span className="w-14 shrink-0 text-right text-fg-subtle tabular">+{startedAt ? at - startedAt : 0}ms</span>
              <span className={cn("w-24 shrink-0", TYPE_COLOR[event.type] ?? "text-fg-muted")}>{event.type}</span>
              <span className="text-fg-muted">{JSON.stringify(event.data)}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </details>
  );
}
