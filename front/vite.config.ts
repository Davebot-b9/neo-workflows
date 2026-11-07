import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Puertos fijos del brief: web en 5173, neo-api en 8080.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8080",
      "/healthz": "http://localhost:8080",
    },
  },
});
