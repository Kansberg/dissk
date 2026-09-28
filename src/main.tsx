import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AuthProvider } from "./context/AuthContext";
import { initializeRecoveryBackups } from "./utils/recoveryBackup";
import { UndoProvider } from "./context/UndoContext"; // ✅ Tilføjet

initializeRecoveryBackups();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <UndoProvider> {/* ✅ Nyt lag omkring App */}
        <App />
      </UndoProvider>
    </AuthProvider>
  </React.StrictMode>
);
