import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { CardStyleProvider } from "./decks";

createRoot(document.querySelector("#root")!).render(
  <StrictMode>
    <CardStyleProvider>
      <App />
    </CardStyleProvider>
  </StrictMode>,
);
