/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
// Entry point for credits.html (a page of its own, linked from the main menu).
import React from "react";
import ReactDOM from "react-dom/client";
import "./ui/greybox.css";
import { CreditsPage } from "./ui/CreditsPage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CreditsPage />
  </React.StrictMode>,
);
