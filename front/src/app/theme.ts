import { createStore, useStore } from "../lib/createStore";

export type ThemePreference = "system" | "light" | "dark";

// La llave se guarda como texto plano porque el script inline de index.html la lee antes de React.
const KEY = "neo.theme";
const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;

function apply(pref: ThemePreference): void {
  const dark = pref === "dark" || (pref === "system" && (media?.matches ?? false));
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function initial(): ThemePreference {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  return raw === "light" || raw === "dark" ? raw : "system";
}

export const themeStore = createStore<ThemePreference>(initial(), (pref) => {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* sin persistencia */
  }
  apply(pref);
});

media?.addEventListener("change", () => apply(themeStore.get()));

export const useTheme = () => useStore(themeStore);

const ORDER: ThemePreference[] = ["system", "light", "dark"];
export function cycleTheme(): void {
  themeStore.set((current) => ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]);
}
