import { Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { useGateway } from "../gateway/gatewayContext";
import { navItemFor } from "../navigation";
import type { RoutePath } from "../router";
import { CommandPalette } from "./CommandPalette";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({ path, children }: { path: RoutePath; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { mode } = useGateway();
  const item = navItemFor(path);

  useEffect(() => {
    document.title = `${item.label} · NEO Workflows`;
  }, [item.label]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#main" className="sr-only z-50 rounded-lg bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Saltar al contenido
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-canvas/60 backdrop-blur-xl lg:block">
        <Sidebar current={path} />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={() => setMenuOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-rise border-r border-line bg-canvas shadow-pop" aria-label="Menú">
            <Sidebar current={path} onNavigate={() => setMenuOpen(false)} onClose={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <Topbar item={item} onMenu={() => setMenuOpen(true)} />

      {mode === "demo" && (
        <div className="border-b border-accent/20 bg-accent-soft/60">
          <p className="mx-auto flex max-w-7xl items-start gap-2 px-4 py-2 text-xs text-fg-muted sm:items-center sm:px-6 lg:px-8">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent sm:mt-0" aria-hidden />
            <span>
              <strong className="font-medium text-fg">Modo demo.</strong> Runs y entrenamientos se simulan en el navegador con los mismos
              eventos SSE que emite neo-api. Cuando el backend esté arriba, elige <em>En vivo</em> o deja <em>Auto</em>.
            </span>
          </p>
        </div>
      )}

      <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div key={path} className="animate-rise">
          {children}
        </div>
      </main>

      <CommandPalette />
    </div>
  );
}
