import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BootGate } from "./BootGate";
import { App } from "./App";
import "./styles.css";
import { CardStyleProvider } from "./decks";

createRoot(document.querySelector("#root")!).render(
  <StrictMode>
    <CardStyleProvider>
      <BootGate>
        <App />
      </BootGate>
    </CardStyleProvider>
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener(
    "load",
    () => {
      void (async () => {
        try {
          await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
        } catch {
          /* Registration must never prevent play. */
        }
      })();
    },
    { once: true },
  );
}
