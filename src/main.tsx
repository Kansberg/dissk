import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AuthProvider } from "./context/AuthContext"; // ← NY

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>       {/* ← NY */}
      <App />
    </AuthProvider>      {/* ← NY */}
  </React.StrictMode>
);
