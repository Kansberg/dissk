// src/components/Topbar.tsx
import { useAuth } from "../context/AuthContext";

type Props = {
  mode: "home" | "editor";
  title?: string;
  onRename?: (newTitle: string) => void;
};

const BRAND = "#03424f";

export default function Topbar({ mode, title, onRename }: Props) {
  const { user, loginGoogle, logout } = useAuth();

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        background: BRAND,
        color: "#fff",
        padding: "0 16px",
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <img
        src="https://github.com/Kansberg/Consulting/blob/main/WhiteLogoNoBG.png?raw=true"
        alt="Logo"
        style={{ height: 28 }}
      />

      {/* Titel – redigerbar direkte */}
<input
  value={title}
  onChange={(e) => onRename?.(e.target.value)}
  aria-label="Redigér titel"
  style={{
    flex: 1,
    margin: "0 60px",
    background: "transparent",
    border: "none",
    borderBottom: "none",
    outline: "none",
    boxShadow: "none",        // ← Fjern den grimme linje
    color: "#fff",
    fontWeight: 800,
    fontSize: 16,
    textAlign: "center",
    WebkitAppearance: "none",
    MozAppearance: "none",
    appearance: "none",
  }}
/>


      {/* Højre kontrolgruppe */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {mode === "editor" && (
          <>
            {/* Del-ikon */}
            <button
              title="Del"
              style={{
                all: "unset", // nulstil al browser-standard
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M15 19c0-2.761-3.134-5-7-5s-7 2.239-7 5"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle
                  cx="8"
                  cy="7"
                  r="4"
                  stroke="#fff"
                  strokeWidth="2"
                />
                <path
                  d="M19 7v6M22 10h-6"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            {/* Eksporter-ikon */}
            <button
              title="Eksporter"
              style={{
                all: "unset",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </>
        )}

        {/* Login/Logout */}
        {!user ? (
          <button
            onClick={loginGoogle}
            style={{
              border: "1px solid rgba(255,255,255,.6)",
              background: "transparent",
              color: "#fff",
              borderRadius: 8,
              padding: "6px 10px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Log ind
          </button>
        ) : (
          <>
            <div
              title={user.email || ""}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "#fff",
                color: BRAND,
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
              }}
            >
              {user.email?.[0]?.toUpperCase() || "?"}
            </div>
            <button
              onClick={logout}
              style={{
                border: "1px solid rgba(255,255,255,.6)",
                background: "transparent",
                color: "#fff",
                borderRadius: 8,
                padding: "6px 10px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Log ud
            </button>
          </>
        )}
      </div>
    </div>
  );
}
