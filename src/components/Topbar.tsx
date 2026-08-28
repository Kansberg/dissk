// src/components/Topbar.tsx
import { useAuth } from "../context/AuthContext";
import { useUndo } from "../context/UndoContext";
import { Undo2, LogOut, User, Menu, ArrowLeft } from "lucide-react";
import type { Doc } from "../types/editor";
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import LoginModal from "../components/LoginModal";
import DownloadModal from "../components/DownloadModal";
import ProfileMenu from "../components/ProfileMenu";
import type { DownloadOptions } from "../components/DownloadModal";
import ExportLoadingOverlay from "../components/ExportLoadingOverlay";

type Props = {
  mode: "home" | "editor";
  title?: string;
  onRename?: (newTitle: string) => void;
  doc?: Doc;
  patch?: (partial: Partial<Doc>) => void;
  onShareClick?: () => void;
  onToggleView?: () => void;    // beholdt for compat (ikke brugt)
  onSettingsClick?: () => void; // beholdt for compat (ikke brugt)
  onDownloadRequested?: (options: DownloadOptions) => Promise<void> | void;
};

const BRAND = "#03424f";

export default function Topbar({
  mode,
  title,
  onRename,
  doc,
  patch,
  onShareClick,
  onDownloadRequested,
}: Props) {
  const { user, logout } = useAuth();
  const { undo, canUndo } = useUndo();
  const nav = useNavigate();

  // Modals / advarsler
  const [showLogin, setShowLogin] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [anonWarning, setAnonWarning] = useState<null | string>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Profile menu
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Burger-menu
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  // ---- Visning (lokal UI-state der følger doc, så UI altid viser det rigtige) ----
const deriveTid = (d: any) => {
  if (typeof d?.showTidAnsvar === "boolean") return d.showTidAnsvar;
  if (d && typeof d.view === "object") {
    if (typeof d.view?.tid === "boolean") return d.view.tid;
    if (typeof d.view?.tidOgAnsvar === "boolean") return d.view.tidOgAnsvar;
  }
  return false;
};

const deriveAnt = (d: any) => {
  if (typeof d?.showAntagelser === "boolean") return d.showAntagelser;
  if (d && typeof d.view === "object") {
    if (typeof d.view?.antagelser === "boolean") return d.view.antagelser;
  }
  return false;
};

const deriveContext = (d: any) => {
  if (typeof d?.showContext === "boolean") return d.showContext;
  return !!(d?.context && String(d.context).trim().length);
};

const deriveStepLabel = (d: any): "trin" | "tema" => {
  if (d?.stepLabel === "tema") return "tema";
  return "trin";
};


const [vTid, setVTid] = useState<boolean>(deriveTid(doc as any));
const [vAntagelser, setVAntagelser] = useState<boolean>(deriveAnt(doc as any));
const [vContext, setVContext] = useState<boolean>(deriveContext(doc as any));
const [stepLabel, setStepLabel] = useState<"trin" | "tema">(
  deriveStepLabel(doc as any)
);


useEffect(() => {
  setVTid(deriveTid(doc as any));
  setVAntagelser(deriveAnt(doc as any));
  setVContext(deriveContext(doc as any));
  setStepLabel(deriveStepLabel(doc as any)); // 👈 NYT
}, [doc]);



  // Klik-udenfor: profil
  useEffect(() => {
    if (!showProfileMenu) return;
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showProfileMenu]);

  // Klik-udenfor: burger
  useEffect(() => {
    if (!showActionsMenu) return;
    const handler = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showActionsMenu]);

  const handleUndo = () => {
    const prevDoc = undo();
    if (!prevDoc || !patch) return;
    patch(JSON.parse(JSON.stringify(prevDoc)));
  };

  const handleExport = async (options: DownloadOptions) => {
    if (!onDownloadRequested || isExporting) return;

    setShowDownloadModal(false);
    setIsExporting(true);

    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      await onDownloadRequested(options);
    } finally {
      setIsExporting(false);
    }
  };

  const profileInitial =
    user?.displayName?.[0]?.toUpperCase() ??
    user?.email?.[0]?.toUpperCase() ??
    "?";

  // Patch helpers – understøtter både doc.view.* og top-level felter
const patchTid = (next: boolean) => {
  patch?.({ showTidAnsvar: next } as any);
};

const patchAnt = (next: boolean) => {
  patch?.({ showAntagelser: next } as any);
};

// 👇 NYT: Kontekst
const patchContext = (next: boolean) => {
  patch?.({ showContext: next } as any);
};
// 👇 NYT: Trin-label
const patchStepLabel = (next: "trin" | "tema") => {
  patch?.({ stepLabel: next } as any);
};

const ToggleRow = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "4px 12px",
      gap: 8,
    }}
  >
    <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>

    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 34,
        height: 18,
        borderRadius: 999,
        border: "1px solid #d1d5db",
        background: checked ? BRAND : "#e5e7eb",
        position: "relative",
        cursor: "pointer",
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 1,
          left: checked ? 18 : 1,
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "#ffffff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          transition: "left 120ms ease",
        }}
      />
    </button>
  </div>
);


  return (
    <>
      {/* DOWNLOAD MODAL */}
      <DownloadModal
        open={showDownloadModal}
        onCancel={() => setShowDownloadModal(false)}
        onConfirm={handleExport}
      />

      {/* EXPORT OVERLAY */}
      {isExporting && <ExportLoadingOverlay />}

      {/* LOGIN MODAL */}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}

      {/* ANONYM-ADVARSEL */}
      {anonWarning && (
        <div
          style={{
            position: "fixed",
            top: 80,
            left: 0,
            right: 0,
            background: "#b91c1c",
            color: "white",
            padding: "10px 16px",
            textAlign: "center",
            zIndex: 9999,
            fontWeight: 700,
          }}
        >
          {anonWarning}
        </div>
      )}

      {/* LOGOUT CONFIRM */}
      {showLogoutConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "grid",
            placeItems: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: "24px 28px",
              borderRadius: 10,
              width: 320,
              textAlign: "center",
              boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 12, color: "#000" }}>
              Log ud?
            </h3>
            <p style={{ margin: "0 0 20px 0", color: "#000" }}>
              Er du sikker på, at du vil logge ud?
            </p>

            <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                style={{
                  padding: "8px 14px",
                  background: "#e5e5e5",
                  color: "#000",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Annullér
              </button>

              <button
                onClick={async () => {
                  setShowLogoutConfirm(false);
                  await logout();
                  nav("/");
                }}
                style={{
                  padding: "8px 14px",
                  background: BRAND,
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Log ud
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOPBAR */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: BRAND,
          color: "#fff",
          padding: "0 16px",
          zIndex: 100,
        }}
      >
        {/* LEFT SIDE */}
        {mode === "editor" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* BURGER-MENU */}
            <div ref={actionsRef} style={{ position: "relative" }}>
              <div
                title="Menu"
                style={{
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
                onClick={() => setShowActionsMenu((v) => !v)}
              >
                <Menu size={22} />
              </div>

              {showActionsMenu && (
                <div
                  role="menu"
                  style={{
                    position: "absolute",
                    top: 32,
                    left: 0,
                    background: "#fff",
                    color: "#000",
                    borderRadius: 8,
                    boxShadow: "0 8px 24px rgba(0,0,0,.25)",
                    minWidth: 220,
                    padding: 6,
                    zIndex: 1000,
                  }}
                >
                  {/* Tilbage */}
                  <div
                    role="menuitem"
                    style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                    onClick={() => {
                      setShowActionsMenu(false);
                      nav("/");
                    }}
                  >
                    <ArrowLeft size={16} />
                    Tilbage til projekter
                  </div>

                  {/* Download */}
                  <div
                    role="menuitem"
                    style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                    onClick={() => {
                      if (!user) {
                        setShowActionsMenu(false);
                        setAnonWarning("Log ind for at benytte download");
                        setTimeout(() => setAnonWarning(null), 2000);
                        return;
                      }
                      setShowActionsMenu(false);
                      setShowDownloadModal(true);
                    }}
                  >
                    Download
                  </div>

                  {/* Del */}
                  <div
                    role="menuitem"
                    style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                    onClick={() => {
                      if (!user) {
                        setShowActionsMenu(false);
                        setAnonWarning("Log ind for at benytte delingsfunktionen");
                        setTimeout(() => setAnonWarning(null), 2000);
                        return;
                      }
                      setShowActionsMenu(false);
                      onShareClick?.();
                    }}
                  >
                    Del
                  </div>

                  {/* Visning – overskrift */}
                  <div
                    aria-hidden
                    style={{
                      padding: "8px 12px 4px 12px",
                      fontWeight: 600,
                      opacity: 0.9,
                    }}
                  >
                    Visning
                  </div>

                  {/* Checkbokse direkte under – hvid baggrund – afspejler doc og patcher straks */}
                 <ToggleRow
  label="Tid & ansvar"
  checked={vTid}
  onChange={(next) => {
    setVTid(next);
    patchTid(next);
  }}
/>

<ToggleRow
  label="Antagelser"
  checked={vAntagelser}
  onChange={(next) => {
    setVAntagelser(next);
    patchAnt(next);
  }}
/>

<ToggleRow
  label="Kontekst"
  checked={vContext}
  onChange={(next) => {
    setVContext(next);
    patchContext(next);
  }}
/>

{/* Segmented control: Trin / Tema */}
<div
  style={{
    display: "flex",
    margin: "6px 12px 10px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    overflow: "hidden",
  }}
>
  <button
    type="button"
    onClick={() => {
      setStepLabel("trin");
      patchStepLabel("trin");
    }}
    style={{
      flex: 1,
      padding: "6px 0",
      fontWeight: 700,
      fontSize: 12,
      border: "none",
      cursor: "pointer",
      background: stepLabel === "trin" ? BRAND : "#ffffff",
      color: stepLabel === "trin" ? "#ffffff" : "#000000",
    }}
  >
    Trin
  </button>

  <button
    type="button"
    onClick={() => {
      setStepLabel("tema");
      patchStepLabel("tema");
    }}
    style={{
      flex: 1,
      padding: "6px 0",
      fontWeight: 700,
      fontSize: 12,
      border: "none",
      cursor: "pointer",
      background: stepLabel === "tema" ? BRAND : "#ffffff",
      color: stepLabel === "tema" ? "#ffffff" : "#000000",
    }}
  >
    Tema
  </button>
</div>


                </div>
              )}
            </div>

            {/* Undo-knap (skjult – som før) */}
            <div
              title="Fortryd"
              style={{
                cursor: canUndo ? "pointer" : "not-allowed",
                opacity: canUndo ? 1 : 0.4,
                display: "none",
              }}
              onClick={canUndo ? handleUndo : undefined}
            >
              <Undo2 size={22} />
            </div>
          </div>
        ) : (
          <img
            src="https://github.com/Kansberg/Consulting/blob/main/UCN_LOGO_HVID.png?raw=true"
            alt="UCN Logo"
            onClick={() => nav("/")}
            style={{ height: 28, cursor: "pointer" }}
          />
        )}

        {/* TITLE */}
        {mode === "editor" && (
          <input
            value={title}
            onChange={(e) => onRename?.(e.target.value)}
            aria-label="Redigér titel"
            style={{
              flex: 1,
              margin: "0 60px",
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#fff",
              fontWeight: 800,
              fontSize: 16,
              textAlign: "center",
            }}
          />
        )}

        {/* RIGHT SIDE */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* EDITOR MODE */}
          {mode === "editor" && (
            <>
              {!user && (
                <button
                  onClick={() => setShowLogin(true)}
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
              )}

              {user && (
                <>
                  <div
                    title="Log ud"
                    style={{ cursor: "pointer" }}
                    onClick={() => setShowLogoutConfirm(true)}
                  >
                    <LogOut size={22} />
                  </div>

                  <div ref={profileRef} style={{ position: "relative" }}>
                    <div
                      title="Profil"
                      style={{ cursor: "pointer" }}
                      onClick={() => setShowProfileMenu((v) => !v)}
                    >
                      <User size={22} />
                    </div>

                    {showProfileMenu && (
                      <ProfileMenu onClose={() => setShowProfileMenu(false)} />
                    )}
                  </div>
                </>
              )}

              <img
                src="https://github.com/Kansberg/Consulting/blob/main/UCN_LOGO_HVID.png?raw=true"
                alt="UCN Logo"
                onClick={() => nav("/")}
                style={{ height: 28, cursor: "pointer" }}
              />
            </>
          )}

          {/* HOME MODE */}
          {mode === "home" &&
            (!user ? (
              <button
                onClick={() => setShowLogin(true)}
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
                <div ref={profileRef} style={{ position: "relative" }}>
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
                      cursor: "pointer",
                    }}
                    onClick={() => setShowProfileMenu((v) => !v)}
                  >
                    {profileInitial}
                  </div>

                  {showProfileMenu && (
                    <ProfileMenu onClose={() => setShowProfileMenu(false)} />
                  )}
                </div>

                <button
                  onClick={() => setShowLogoutConfirm(true)}
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
            ))}
        </div>
      </div>
    </>
  );
}
