import { GitBranch, X } from "lucide-react";

import { Logo } from "../../components/brand/Logo";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";
import { NAV_ITEMS } from "../navigation";
import { href, type RoutePath } from "../router";
import { ModeSwitch } from "./ModeSwitch";

interface SidebarProps {
  current: RoutePath;
  onNavigate?: () => void;
  onClose?: () => void;
}

export function Sidebar({ current, onNavigate, onClose }: SidebarProps) {
  return (
    <div className="flex h-full flex-col gap-6 px-4 py-5">
      <div className="flex items-center justify-between px-2">
        <a href={href("/")} onClick={onNavigate} className="flex items-center gap-2.5 rounded-lg">
          <Logo className="size-8" />
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-tight">NEO</span>
            <span className="block text-[11px] text-fg-subtle">Workflows</span>
          </span>
        </a>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar menú">
            <X className="size-4" />
          </Button>
        )}
      </div>

      <nav aria-label="Principal" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = item.path === current;
          const Icon = item.icon;
          return (
            <a
              key={item.path}
              href={href(item.path)}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150",
                active ? "bg-surface text-fg shadow-panel" : "text-fg-muted hover:bg-surface/60 hover:text-fg",
              )}
            >
              {active && <span className="absolute top-2 bottom-2 -left-4 w-0.5 rounded-full bg-accent" aria-hidden />}
              <Icon className={cn("size-4", active ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted")} aria-hidden />
              {item.label}
            </a>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <ModeSwitch />
        <p className="flex items-center gap-1.5 px-2 text-[11px] text-fg-subtle">
          <GitBranch className="size-3" aria-hidden />
          <span className="font-mono">neo-web v0.2 · Fase 0</span>
        </p>
      </div>
    </div>
  );
}
