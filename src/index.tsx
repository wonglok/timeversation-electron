import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import { Menu } from "./pages/Menu.tsx";
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
                <Route path="/menu" element={<Menu />} />
                <Route path="/chat/:slug/:conversationId?" element={<Chat />} />

                {/* Setup llm */}
                <Route path="/setup" element={<SetupLLM />} />
            </Routes>
        </HashRouter>
    </>,
);

/*
React.StrictMode
React.StrictMode
*/

// Use contextBridge
window.ipcRenderer.on("main-process-message", (_event, message) => {
    console.log(message);
});

//
