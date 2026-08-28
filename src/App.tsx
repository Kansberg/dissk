// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./routes/Home";
import Editor from "./routes/Editor";
import MiniDisskEditor from "./routes/MiniDisskEditor";
import Admin from "./routes/Admin"; // ⬅️ NYT

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/editor/:id" element={<Editor />} />
        <Route path="/mini/:id" element={<MiniDisskEditor />} />

        {/* 🔐 Admin-side */}
        <Route path="/admin" element={<Admin />} />

        {/* fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
