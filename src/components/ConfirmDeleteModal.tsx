// src/components/ConfirmDeleteModal.tsx
import { doc, getDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { X } from "lucide-react";

type Props = {
  projectId: string;
  userUid: string;      // ← Tilføjet så vi ved hvor projektet ligger
  onClose: () => void;
  onDeleted: () => void;
};

export default function ConfirmDeleteModal({ projectId, userUid, onClose, onDeleted }: Props) {
  const handleDelete = async () => {
    console.log("[DELETE] Starter sletning:", projectId);

    // 1️⃣ Hent projektet under den aktuelle bruger
    const ref = doc(db, "users", userUid, "projects", projectId);
    const snap = await getDoc(ref);
    const globalRef = doc(db, "projects", projectId);
    const globalSnap = await getDoc(globalRef);
    const data = globalSnap.data() || snap.data();

    if (!data) {
      console.warn("[DELETE] Projektet findes ikke:", projectId);
      onClose();
      return;
    }

    // 2️⃣ Slet adgang for delte brugere (hvis delt)
    const sharedWith = data.sharedWith || {};
    const batch = writeBatch(db);
    for (const email of Object.keys(sharedWith)) {
      batch.delete(doc(db, "projectAccess", email, "projects", projectId));
    }

    // 3️⃣ Slet både den private ejerudgave og den fælles delingsudgave
    if (snap.exists()) batch.delete(ref);
    if (globalSnap.exists()) batch.delete(globalRef);
    await batch.commit();
    console.log("[DELETE] Projekt slettet:", projectId);

    // 4️⃣ Luk modal og informer parent
    onDeleted();
    onClose();
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <button onClick={onClose} style={styles.close}>
          <X />
        </button>
        <h2 style={styles.title}>Slet projekt?</h2>
        <p style={styles.text}>
          Er du sikker på, at du vil slette dette projekt?
          <br />
          Dette kan <strong>ikke</strong> fortrydes.
        </p>
        <div style={styles.buttons}>
          <button onClick={onClose} style={styles.cancel}>
            Annullér
          </button>
          <button onClick={handleDelete} style={styles.delete}>
            Slet
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
    width: 400,
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
  cancel: {
    padding: "8px 16px",
    background: "#03424f",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    color: "#fff",
  },
  delete: {
    padding: "8px 16px",
    background: "#dc2626",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  },
};
