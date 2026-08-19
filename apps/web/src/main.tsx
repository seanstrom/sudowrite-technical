import { DefaultDocumentId } from "@app/contracts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { createDocumentRuntime, createEffectRpcGateway } from "./runtime";
import "./styles.css";

const runtime = createDocumentRuntime(createEffectRpcGateway(), DefaultDocumentId);
window.addEventListener("pagehide", () => { void runtime.dispose(); }, { once: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode><App runtime={runtime} /></StrictMode>,
);
