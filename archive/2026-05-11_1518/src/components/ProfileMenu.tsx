// src/components/ProfileMenu.tsx
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { useNavigate } from "react-router-dom";

type Props = {
  onClose: () => void;
};

export default function ProfileMenu({ onClose }: Props) {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  if (!user) return null;

  // Init navn + tjek admin-role
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const baseName =
        user.displayName ||
        (user.email ? user.email.split("@")[0] : "") ||
        "";

      if (!cancelled) {
        setDisplayName(baseName);
      }

      try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        if (!cancelled && snap.exists()) {
          const data = snap.data() as any;
          if (typeof data.role === "string" && data.role === "admin") {
            setIsAdmin(true);
          }
          if (!user.displayName && typeof data.displayName === "string") {
            setDisplayName(data.displayName);
          }
        }
      } catch (e) {
        console.error("Kunne ikke hente brugerrolle:", e);
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSaveName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed || !user) return;

    try {
      setIsSavingName(true);
      setNameMessage(null);

      // Opdater Firebase Auth profil
      await updateProfile(user, { displayName: trimmed });

      // Opdater Firestore users/{uid}
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { displayName: trimmed });

      setNameMessage("Navn opdateret.");
    } catch (e: any) {
      console.error(e);
      setNameMessage("Kunne ikke opdatere navn. Prøv igen.");
    } finally {
      setIsSavingName(false);
    }
  };

const handleDeleteAllConfirmed = async () => {
  setShowDeleteConfirm(false);

  try {
    // RIGTIG sti:
    // users/{uid}/projects
    const projectsRef = collection(db, "users", user.uid, "projects");
    const snap = await getDocs(projectsRef);

    // SLET ALLE PROJECTS
    const deletions = snap.docs.map(docSnap => deleteDoc(docSnap.ref));
    await Promise.all(deletions);

    alert("Alle dine DISSK (projects) er nu slettet.");

    onClose();
    nav("/"); // <-- send brugeren tilbage til home
  } catch (e) {
    console.error("Fejl ved slet alle DISSK:", e);
    alert("Der opstod en fejl ved sletning. Prøv igen.");
  }
};


  const handleLogoutConfirmed = async () => {
    setShowLogoutConfirm(false);
    await logout();
    nav("/"); // ← SEND TILBAGE TIL HOME
    onClose();
  };

  return (
    <>
      {/* SELVE MENUEN */}
      <div style={styles.menu}>
        {/* Visningsnavn */}
        <div
          style={{
            padding: "10px 14px 6px 14px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: 0.04,
              marginBottom: 4,
              color: "#6b7280",
            }}
          >
            Visningsnavn
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={{
                flex: 1,
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 13,
                color: "#111827",
                background: "#fff",
              }}
            />
            <button
              onClick={handleSaveName}
              disabled={isSavingName}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "none",
                background: "#03424f",
                color: "#fff",
                fontSize: 13,
                cursor: isSavingName ? "default" : "pointer",
                opacity: isSavingName ? 0.7 : 1,
                fontWeight: 600,
              }}
            >
              {isSavingName ? "Gemmer…" : "Gem"}
            </button>
          </div>
          {nameMessage && (
            <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
              {nameMessage}
            </div>
          )}
        </div>

        {/* Slet alle */}
        <button style={styles.menuItem} onClick={() => setShowDeleteConfirm(true)}>
          Slet alle DISSK
        </button>

        {/* Admin-konsol */}
        {isAdmin && (
          <button
            style={styles.menuItem}
            onClick={() => {
              nav("/admin");
              onClose();
            }}
          >
            Admin-konsol
          </button>
        )}

        {/* Log ud */}
        <button
          style={{ ...styles.menuItem, color: "#b91c1c" }}
          onClick={() => setShowLogoutConfirm(true)}
        >
          Log ud
        </button>
      </div>

      {/* MODAL – Slet alle */}
      {showDeleteConfirm && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3 style={{ marginTop: 0, marginBottom: 8, color: "#000" }}>
              Slet alle DISSK?
            </h3>
            <p
              style={{
                marginTop: 0,
                marginBottom: 16,
                color: "#000",
                fontSize: 14,
              }}
            >
              Dette vil slette alle dine DISSK-forløb. Handlingen kan ikke
              fortrydes.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={buttonStyles.secondary}
              >
                Annullér
              </button>
              <button
                onClick={handleDeleteAllConfirmed}
                style={buttonStyles.danger}
              >
                Slet alle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL – Log ud */}
      {showLogoutConfirm && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3 style={{ marginTop: 0, marginBottom: 8, color: "#000" }}>
              Log ud?
            </h3>
            <p
              style={{
                marginTop: 0,
                marginBottom: 16,
                color: "#000",
                fontSize: 14,
              }}
            >
              Er du sikker på, at du vil logge ud?
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                style={buttonStyles.secondary}
              >
                Annullér
              </button>
              <button
                onClick={handleLogoutConfirmed}
                style={buttonStyles.primary}
              >
                Log ud
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

//
// Styles
//
const styles: Record<string, React.CSSProperties> = {
  menu: {
    position: "absolute",
    top: "100%",
    right: 0,
    marginTop: 8,
    background: "#fff",
    borderRadius: 8,
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    display: "flex",
    flexDirection: "column",
    minWidth: 220,
    zIndex: 9999,
    overflow: "hidden",
    border: "1px solid #e5e7eb",
  },
  menuItem: {
    textAlign: "left",
    padding: "10px 14px",
    background: "transparent",
    border: "none",
    fontSize: 14,
    width: "100%",
    cursor: "pointer",
    color: "#111827",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "grid",
    placeItems: "center",
    zIndex: 10000,
  },
  modal: {
    background: "#fff",
    borderRadius: 10,
    padding: "20px 24px",
    maxWidth: 360,
    width: "90%",
    boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
  },
};

const buttonStyles: Record<string, React.CSSProperties> = {
  secondary: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #d1d5db",
    background: "#f3f4f6",
    color: "#111827",
    cursor: "pointer",
    fontSize: 14,
  },
  primary: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "none",
    background: "#03424f",
    color: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
  danger: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "none",
    background: "#b91c1c",
    color: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
};
