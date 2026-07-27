import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import "@fontsource-variable/inter/opsz-italic.css";
import { Home } from "./pages/Home.tsx";
import { Agents } from "./pages/Agents.tsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <HashRouter>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/agents" element={<Agents />} />
            </Routes>
        </HashRouter>
    </React.StrictMode>,
);

// Use contextBridge
window.ipcRenderer.on("main-process-message", (_event, message) => {
    console.log(message);
});
