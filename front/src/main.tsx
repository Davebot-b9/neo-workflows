import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./index.css";

import { App } from "./App";

const container = document.getElementById("root");
if (!container) throw new Error("No se encontró #root");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
