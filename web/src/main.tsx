import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App.tsx";
import { readPublicEnvironment } from "@/shared/config/public-environment.ts";

const container = document.getElementById("root");
if (!container) {
  throw new Error("The #root element is missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <App environment={readPublicEnvironment(import.meta.env)} />
  </StrictMode>,
);
