import { Logo } from "../../components/brand/Logo";

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-live="polite">
      <div className="flex animate-fade-in flex-col items-center gap-4">
        <Logo className="size-12 animate-pulse" />
        <p className="text-sm text-fg-muted">Buscando neo-api…</p>
      </div>
    </div>
  );
}
