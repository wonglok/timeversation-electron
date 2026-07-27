import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import { Home } from "./pages/Home.tsx";
import { Chat } from "./pages/Chat.tsx";
import "./index.css";
import "@fontsource-variable/inter/opsz-italic.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <>
        <HashRouter>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/chat/:slug" element={<Chat />} />
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
