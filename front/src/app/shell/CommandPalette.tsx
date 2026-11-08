import { CornerDownLeft, Monitor, Moon, Play, Radio, Search, Sparkles, Sun, Zap, type LucideIcon } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Kbd } from "../../components/ui/misc";
import { useWorkflows } from "../../features/workflows/useWorkflows";
import { cn } from "../../lib/cn";
import { useGateway } from "../gateway/gatewayContext";
import { NAV_ITEMS } from "../navigation";
import { navigate } from "../router";
import { themeStore } from "../theme";
import { closePalette, togglePalette, usePaletteOpen } from "./paletteStore";

interface Command {
  id: string;
  group: "Navegar" | "Ejecutar" | "Preferencias";
  label: string;
  hint?: string;
  keywords: string;
  icon: LucideIcon;
  run: () => void;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** ⌘K / Ctrl+K: navegar, ejecutar un workflow o cambiar preferencias sin tocar el mouse. */
export function CommandPalette() {
  const open = usePaletteOpen();

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  return <PaletteDialog />;
}

function PaletteDialog() {
  const { setPreference } = useGateway();
  const { workflows } = useWorkflows();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(
    () => [
      ...NAV_ITEMS.map((item) => ({
        id: `nav:${item.path}`,
        group: "Navegar" as const,
        label: item.label,
        hint: item.description,
        keywords: item.keywords,
        icon: item.icon,
        run: () => navigate(item.path),
      })),
      ...workflows.map((wf) => ({
        id: `wf:${wf.id}`,
        group: "Ejecutar" as const,
        label: `Ejecutar ${wf.id}`,
        hint: `v${wf.version} · ${wf.model}`,
        keywords: `run workflow ${wf.id}`,
        icon: Play,
        run: () => navigate("/runs", { wf: wf.id }),
      })),
      { id: "mode:auto", group: "Preferencias", label: "Fuente de datos: Auto", keywords: "modo detectar", icon: Radio, run: () => setPreference("auto") },
      { id: "mode:live", group: "Preferencias", label: "Fuente de datos: En vivo", keywords: "modo backend api real", icon: Zap, run: () => setPreference("live") },
      { id: "mode:demo", group: "Preferencias", label: "Fuente de datos: Demo", keywords: "modo simulado mock", icon: Sparkles, run: () => setPreference("demo") },
      { id: "theme:system", group: "Preferencias", label: "Tema del sistema", keywords: "apariencia", icon: Monitor, run: () => themeStore.set("system") },
      { id: "theme:light", group: "Preferencias", label: "Tema claro", keywords: "apariencia light", icon: Sun, run: () => themeStore.set("light") },
      { id: "theme:dark", group: "Preferencias", label: "Tema oscuro", keywords: "apariencia dark", icon: Moon, run: () => themeStore.set("dark") },
    ],
    [workflows, setPreference],
  );

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return commands;
    return commands.filter((c) => normalize(`${c.label} ${c.keywords} ${c.hint ?? ""}`).includes(q));
  }, [commands, query]);

  const activeIndex = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId]);

  function execute(command: Command | undefined) {
    if (!command) return;
    closePalette();
    command.run();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((activeIndex + 1) % Math.max(1, results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((activeIndex - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      execute(results[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
    }
  }

  let lastGroup: string | null = null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[2px]" onClick={closePalette} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Paleta de comandos" className="relative w-full max-w-xl animate-rise overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 text-fg-subtle" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Busca una página, un workflow o una acción…"
            className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results.length ? `${listId}-${activeIndex}` : undefined}
            aria-autocomplete="list"
          />
          <Kbd>Esc</Kbd>
        </div>

        <ul id={listId} role="listbox" aria-label="Resultados" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-fg-subtle">Nada coincide con “{query}”.</li>}
          {results.map((command, i) => {
            const showGroup = command.group !== lastGroup;
            lastGroup = command.group;
            const Icon = command.icon;
            const selected = i === activeIndex;
            return (
              <li key={command.id} role="presentation">
                {showGroup && <p className="px-3 pt-3 pb-1.5 text-[11px] font-medium tracking-wide text-fg-subtle uppercase">{command.group}</p>}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={selected}
                  onPointerMove={() => setActive(i)}
                  onClick={() => execute(command)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    selected ? "bg-accent-soft text-fg" : "text-fg-muted",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", selected ? "text-accent" : "text-fg-subtle")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{command.label}</span>
                    {command.hint && <span className="block truncate text-xs text-fg-subtle">{command.hint}</span>}
                  </span>
                  {selected && <CornerDownLeft className="size-3.5 text-fg-subtle" aria-hidden />}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
