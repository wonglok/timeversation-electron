import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AgentMenu } from "./pages/AgentMenu.tsx";
import { Chat } from "./pages/Chat.tsx";
import "./index.css";
import "@fontsource-variable/inter/opsz-italic.css";
import { Home } from "./pages/Home.tsx";
import { SetupLLM } from "./pages/SetupLLM.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <>
        <HashRouter>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/menu" element={<AgentMenu />} />
                <Route path="/chat/:slug/:conversationId?" element={<Chat />} />

                {/* Setup llm */}
                <Route path="/setup" element={<SetupLLM />} />
            </Routes>
        </HashRouter>
    </>,
);

// Hide the CSS loader once React has rendered its first frame
requestAnimationFrame(() => {
    const loader = document.getElementById("cssloader");
    if (loader) {
        loader.classList.add("hide");
        setTimeout(() => loader.remove(), 500);
    }
});

/*
React.StrictMode
React.StrictMode
*/

// Use contextBridge
window.ipcRenderer.on("main-process-message", (_event, message) => {
    console.log(message);
});

//
