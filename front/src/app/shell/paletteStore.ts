import { createStore, useStore } from "../../lib/createStore";

const paletteStore = createStore(false);

export const usePaletteOpen = () => useStore(paletteStore);
export const openPalette = () => paletteStore.set(true);
export const closePalette = () => paletteStore.set(false);
export const togglePalette = () => paletteStore.set((open) => !open);
