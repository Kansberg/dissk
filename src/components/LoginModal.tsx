// src/components/LoginModal.tsx
import { useState, useEffect } from "react";
import { auth } from "../firebase";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from "firebase/auth";

import { useAuth } from "../context/AuthContext";

export default function LoginModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot" | "signup">("login");

  const {
    authError,        // FEJL FRA AuthContext (fx adgang nægtet)
    clearAuthError,   // rydder authError
    user,             // bruger når login lykkes
  } = useAuth();

  //
  // 🔥 LUK MODAL når login lykkes (user sat og ingen authError)
  //
  useEffect(() => {
    if (user && !authError) {
      onClose();
    }
  }, [user, authError, onClose]);

  //
  // 🔥 Når modal lukkes manuelt:
  //
  const handleClose = () => {
    clearAuthError(); // rydder adgangsfejl
    setErr("");       // rydder lokale fejl
    setInfo("");
    onClose();
  };

  //
  // GOOGLE LOGIN
  //
  const loginGoogle = async () => {
    try {
      clearAuthError();
      setErr("");
      await signInWithPopup(auth, new GoogleAuthProvider());
      // Modal lukkes automatisk via useEffect hvis login lykkes
    } catch (e: any) {
      setErr(e.message);
    }
  };

  //
  // MICROSOFT LOGIN
  //
  const loginMicrosoft = async () => {
    try {
      clearAuthError();
      setErr("");
      await signInWithPopup(auth, new OAuthProvider("microsoft.com"));
    } catch (e: any) {
      setErr(e.message);
    }
  };

  //
  // EMAIL + PASSWORD LOGIN
  //
  const loginWithEmail = async () => {
    if (busy) return;
    setBusy(true);
    try {
      clearAuthError();
      setErr("");
      setInfo("");
      await signInWithEmailAndPassword(auth, email.trim(), pwd);
    } catch (e: any) {
      setErr(e.code === "auth/invalid-credential"
        ? "E-mail eller adgangskode er forkert."
        : "Login mislykkedes. Prøv igen.");
    } finally {
      setBusy(false);
    }
  };

  const signUpWithEmail = async () => {
    if (busy) return;
    setErr("");
    setInfo("");
    if (pwd !== confirmPwd) {
      setErr("Adgangskoderne er ikke ens.");
      return;
    }
    setBusy(true);
    try {
      clearAuthError();
      const result = await createUserWithEmailAndPassword(auth, email.trim(), pwd);
      await sendEmailVerification(result.user);
      await signOut(auth);
      clearAuthError();
      setPwd("");
      setConfirmPwd("");
      setMode("login");
      setInfo("Brugeren er oprettet. Bekræft din e-mail via linket, vi har sendt, og log derefter ind.");
    } catch (e: any) {
      const messages: Record<string, string> = {
        "auth/email-already-in-use": "E-mailen er allerede i brug. Log ind eller brug Glemt adgangskode.",
        "auth/invalid-email": "Skriv en gyldig e-mailadresse.",
        "auth/weak-password": "Adgangskoden er for svag. Brug en længere adgangskode.",
        "auth/password-does-not-meet-requirements": "Adgangskoden opfylder ikke kravene. Brug en stærkere adgangskode.",
        "auth/operation-not-allowed": "Oprettelse med e-mail er ikke aktiveret endnu.",
        "auth/network-request-failed": "Kontrollér din internetforbindelse og prøv igen.",
        "auth/too-many-requests": "Der er for mange forsøg. Vent lidt og prøv igen.",
      };
      setErr(messages[e.code] || "Brugeren kunne ikke oprettes. Prøv igen.");
    } finally {
      setBusy(false);
    }
  };

  //
  // PASSWORD RESET
  //
  const forgotPassword = async () => {
    try {
      clearAuthError();
      setErr("");
      await sendPasswordResetEmail(auth, email);
      setInfo("Tjek din mail for nulstillingslink.");
      setMode("login");
    } catch (e: any) {
      setErr(e.message);
    }
  };

  //
  // Her viser vi alt i modalen
  //
  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <button onClick={handleClose} style={styles.close}>×</button>

        <img
          src="https://github.com/Kansberg/Consulting/blob/main/db1ab80a-f884-4e2a-9ebe-4e1618ddff66.png?raw=true"
          alt="Logo"
          style={{ width: 90, marginBottom: 16 }}
        />

        {/* GOOGLE */}
        <button style={styles.socialBtn} onClick={loginGoogle}>
          <img src="https://techdocs.akamai.com/identity-cloud/img/social-login/identity-providers/iconfinder-new-google-favicon-682665.png" alt="Google" style={styles.icon} />
          Fortsæt med Google
        </button>

        {/* MICROSOFT */}
        <button style={styles.socialBtn} onClick={loginMicrosoft}>
          <img src="https://mailmeteor.com/logos/assets/PNG/Microsoft_Logo_512px.png" alt="Microsoft" style={styles.icon} />
          Fortsæt med Microsoft
        </button>

        <div style={styles.divider}>— eller —</div>

        {/* EMAIL / PASSWORD */}
        {mode === "login" ? (
          <form style={styles.form} onSubmit={(event) => { event.preventDefault(); void loginWithEmail(); }}>
            <input
              type="email"
              autoComplete="username"
              required
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
            />
            <input
              type="password"
              autoComplete="current-password"
              required
              placeholder="Adgangskode"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              style={styles.input}
            />
            <button type="submit" disabled={busy} style={styles.primaryBtn}>
              Log ind
            </button>
            <button type="button" onClick={() => setMode("signup")} style={styles.link}>
              Opret bruger med e-mail
            </button>
            <button type="button" onClick={() => setMode("forgot")} style={styles.link}>
              Glemt adgangskode?
            </button>
          </form>
        ) : mode === "signup" ? (
          <form style={styles.form} onSubmit={(event) => { event.preventDefault(); void signUpWithEmail(); }}>
            <input type="email" autoComplete="username" required placeholder="E-mail" value={email} onChange={(event) => setEmail(event.target.value)} style={styles.input} />
            <input type="password" autoComplete="new-password" required minLength={6} placeholder="Adgangskode (mindst 6 tegn)" value={pwd} onChange={(event) => setPwd(event.target.value)} style={styles.input} />
            <input type="password" autoComplete="new-password" required minLength={6} placeholder="Gentag adgangskode" value={confirmPwd} onChange={(event) => setConfirmPwd(event.target.value)} style={styles.input} />
            <button type="submit" disabled={busy} style={styles.primaryBtn}>Opret bruger</button>
            <button type="button" onClick={() => setMode("login")} style={styles.link}>Har du allerede en bruger? Log ind</button>
          </form>
        ) : (
          <>
            <input
              type="email"
              placeholder="Din e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
            />
            <button style={styles.primaryBtn} onClick={forgotPassword}>
              Send nulstillingslink
            </button>
            <button onClick={() => setMode("login")} style={styles.link}>
              Tilbage til login
            </button>
          </>
        )}

        {/* 🔥 FEJL VISNING 🔥 */}

        {/* FEJL FRA AuthContext (fx adgang nægtet) */}
        {authError && (
          <div style={styles.error}>
            {authError}
          </div>
        )}

        {/* LOKALE LOGIN-FEJL (forkert password etc.) */}
        {err && !authError && (
          <div style={styles.error}>
            {err}
          </div>
        )}

        {/* INFO TEKSTER */}
        {info && (
          <div style={styles.info}>
            {info}
          </div>
        )}
      </div>
    </div>
  );
}

//
// STYLES (uændret fra din egen)
//
const BLUE = "#03424f";

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "grid",
    placeItems: "center",
    zIndex: 9999,
  },
  modal: {
    background: "#fff",
    borderRadius: 12,
    padding: 32,
    width: 400,
    boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    position: "relative",
  },
  form: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  close: {
    position: "absolute",
    top: 12,
    right: 16,
    border: "none",
    background: "transparent",
    fontSize: 24,
    cursor: "pointer",
    color: "#888",
  },
  socialBtn: {
    width: "100%",
    padding: "10px 16px",
    margin: "6px 0",
    backgroundColor: "#fff",
    color: "#000",
    fontWeight: 500,
    border: "1px solid #ccc",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 15,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  icon: {
    width: 20,
    height: 20,
    objectFit: "contain",
  },
  primaryBtn: {
    width: "100%",
    padding: "10px 16px",
    margin: "12px 0 6px",
    backgroundColor: BLUE,
    color: "#fff",
    fontWeight: 600,
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 15,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    margin: "6px 0",
    borderRadius: 6,
    border: "1px solid #ccc",
    fontSize: 14,
    background: "#eaf0fb",
    color: "#000",
  },
  link: {
    marginTop: 10,
    background: "none",
    border: "none",
    color: BLUE,
    cursor: "pointer",
    fontSize: 13,
    textDecoration: "underline",
  },
  divider: {
    margin: "16px 0",
    width: "100%",
    textAlign: "center",
    color: "#888",
    fontSize: 13,
  },
  error: {
    color: "#dc2626",
    marginTop: 10,
    fontSize: 13,
    textAlign: "center",
  },
  info: {
    color: "#15803d",
    marginTop: 10,
    fontSize: 13,
    textAlign: "center",
  },
};
