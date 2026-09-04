import { useEffect, useRef, useState } from "react";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { X } from "lucide-react";

type Props = {
  projectId: string;
  userUid: string;
  userEmail: string;
  onClose: () => void;
  onCopied: (newProjectId: string) => void;
};

export default function ConfirmCopyModal({
  projectId,
  userUid,
  userEmail,
  onClose,
  onCopied,
}: Props) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const autoCopyStarted = useRef(false);

  // Tjek om projektet er delt
  useEffect(() => {
    (async () => {
      try {
        const ref = doc(db, "projects", projectId);
        const snap = await getDoc(ref);
        const data = snap.data();
        const isShared = !!(data?.sharedWith && Object.keys(data.sharedWith).length > 0);
        setShowModal(isShared);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, userUid]);

  if (loading) return null;

  const handleCopy = async (copyShare: boolean) => {
    console.log("[COPY] Starter for", projectId, "copyShare:", copyShare);

    // 1️⃣ Hent original fra brugerens egen projektsamling
    const originalRef = doc(db, "projects", projectId);
    const originalSnap = await getDoc(originalRef);
    const original = originalSnap.data();
    if (!original) {
      console.warn("[COPY] Projekt findes ikke:", projectId);
      return;
    }

    // 2️⃣ Nyt projekt-id
    const newRef = doc(collection(db, "projects"));
    const newProjectId = newRef.id;

    // 3️⃣ Byg fuld kopi af ALLE felter
    const newProject = {
      ...original,
      id: newProjectId,
      title: `${original.title || "DISSK"} (kopi)`,
      owner: userEmail.toLowerCase(),
      ownerUid: userUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      sharedWith: copyShare ? (original.sharedWith || {}) : {},
    };

    // 4️⃣ Gem den nye model som præcis ét projektdokument
    await setDoc(newRef, newProject);
    console.log("[COPY] Fuldt projekt kopieret med id", newProjectId);

    // 6️⃣ Kopiér deling hvis valgt
    if (copyShare && original.sharedWith) {
      for (const [email, access] of Object.entries(
        original.sharedWith as Record<string, "read" | "write">
      )) {
        await setDoc(
          doc(db, "projectAccess", email, "projects", newProjectId),
          { access, projectId: newProjectId }
        );
        console.log("[COPY] Givet adgang til", email, "->", access);
      }
    }

    onCopied(newProjectId);
    onClose();
  };

  if (!showModal) {
    if (!autoCopyStarted.current) {
      autoCopyStarted.current = true;
      void handleCopy(false);
    }
    return null;
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <button onClick={onClose} style={styles.close} aria-label="Luk">
          <X />
        </button>
        <h2 style={styles.title}>Kopier deling?</h2>
        <p style={styles.text}>
          Dette projekt er delt med andre brugere.
          <br />
          Vil du kopiere delingsindstillingerne til din kopi?
        </p>
        <div style={styles.buttons}>
          <button onClick={() => handleCopy(false)} style={styles.onlyMe}>
            Nej, kun for mig
          </button>
          <button onClick={() => handleCopy(true)} style={styles.copyShare}>
            Ja, kopier deling
          </button>
        </div>
      </div>
    </div>
  );
}

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
    borderRadius: 10,
    padding: 24,
    width: 420,
    maxWidth: "90%",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    position: "relative",
    textAlign: "center",
  },
  close: {
    position: "absolute",
    top: 12,
    right: 12,
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#000",
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 12,
    color: "#03424f",
  },
  text: {
    fontSize: 15,
    marginBottom: 24,
    color: "#333",
  },
  buttons: {
    display: "flex",
    justifyContent: "center",
    gap: 16,
  },
  onlyMe: {
    padding: "8px 16px",
    background: "#dc2626",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    color: "#fff",
  },
  copyShare: {
    padding: "8px 16px",
    background: "#03424f",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  },
};
