import React from "react";
import { hydrateRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/source-serif-4/700.css";
import "@fontsource/ibm-plex-mono/500.css";
import App from "./App";
import { parseInitialState } from "./ssr";

const stateElement = document.getElementById("__RESEARCHNAV_STATE__");
if (!stateElement?.textContent) throw new Error("SSR state is unavailable.");

hydrateRoot(
  document.getElementById("root")!,
  <React.StrictMode>
    <App initialState={parseInitialState(stateElement.textContent)} />
  </React.StrictMode>,
);
