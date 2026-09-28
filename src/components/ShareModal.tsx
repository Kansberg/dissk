import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { X, Trash2 } from "lucide-react";

type Props = {
  projectId: string;
  onClose: () => void;
};

type AccessLevel = "read" | "write";

type UserMeta = {
  uid: string;
  email: string;
  displayName: string;
};

export default function ShareModal({ projectId, onClose }: Props) {
  const [emailInput, setEmailInput] = useState("");
  const [role, setRole] = useState<AccessLevel>("read");
  const [shared, setShared] = useState<Record<string, any>>({});
  const [allUsers, setAllUsers] = useState<UserMeta[]>([]);
  const [suggestions, setSuggestions] = useState<UserMeta[]>([]);

  // Hent eksisterende delinger og brugere
  useEffect(() => {
    const loadShared = async () => {
      const snap = await getDoc(doc(db, "projects", projectId));
      if (snap.exists()) {
        const data = snap.data();
        if (data.sharedWith) setShared(data.sharedWith);
      }
    };

    const loadUsers = async () => {
      const snap = await getDocs(collection(db, "users"));
      const users: UserMeta[] = [];
      snap.forEach((d) => {
        const u = d.data();
        if (u.hiddenFromAdmin === true) return;
        users.push({
          uid: u.uid || d.id,
          email: u.emailLower || u.email || "",
          displayName: u.displayName || "",
        });
      });
      setAllUsers(users);
    };

    loadShared();
    loadUsers();
  }, [projectId]);

  // Lokal søgefunktion (søger i navn og email)
  useEffect(() => {
    const term = emailInput.trim().toLowerCase();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }

    const match = allUsers.filter((u) => {
      const email = (u.email || "").toLowerCase();
      const name = (u.displayName || "").toLowerCase();
      return email.includes(term) || name.includes(term);
    });

    setSuggestions(match.slice(0, 5));
  }, [emailInput, allUsers]);

  // Tilføj deling
  const handleAdd = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;

    try {
      const projectRef = doc(db, "projects", projectId);
      const projectSnapshot = await getDoc(projectRef);
      if (!projectSnapshot.exists()) throw new Error("Projektet findes ikke");

      const projectData = projectSnapshot.data();
      const batch = writeBatch(db);
      batch.set(projectRef, {
        sharedWith: { ...(projectData.sharedWith || {}), [email]: role },
      }, { merge: true });
      batch.set(
        doc(db, "projectAccess", email, "projects", projectId),
        { access: role, projectId }
      );
      await batch.commit();

      const updated = { ...shared, [email]: role };
      setShared(updated);
      setEmailInput("");
      setRole("read");
      setSuggestions([]);
    } catch (err) {
      console.error("Fejl ved deling:", err);
    }
  };

  // Fjern deling
const handleRemove = async (mail: string) => {
  const newShared = { ...shared };
  delete newShared[mail];

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, "projects", projectId), { sharedWith: newShared }, { merge: true });
    batch.delete(doc(db, "projectAccess", mail, "projects", projectId));
    await batch.commit();

    // 3️⃣ opdater UI
    setShared(newShared);
  } catch (err) {
    console.error("Fejl ved fjernelse af deling:", err);
  }
};


  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <button onClick={onClose} style={styles.close}>
          <X />
        </button>
        <h2 style={styles.title}>Del projekt</h2>

        <div style={styles.formRow}>
          <input
            type="text"
            autoComplete="off"
            placeholder="Søg efter navn eller e-mail"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            style={styles.input}
          />
          {suggestions.length > 0 && (
            <div style={styles.suggestions}>
              {suggestions.map((s) => (
                <div
                  key={s.uid}
                  style={styles.suggestionItem}
                  onClick={() => {
                    setEmailInput(s.email);
                    setSuggestions([]);
                  }}
                >
                  {s.displayName} ({s.email})
                </div>
              ))}
            </div>
          )}
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AccessLevel)}
            style={styles.select}
          >
            <option value="read">Læs</option>
            <option value="write">Skriv</option>
          </select>
          <button onClick={handleAdd} style={styles.addBtn}>
            Tilføj
          </button>
        </div>

        {Object.keys(shared).length > 0 && (
          <div style={{ marginTop: 24, width: "100%" }}>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>
              Allerede delt med:
            </div>
            {Object.entries(shared).map(([mail, access]) => (
              <div key={mail} style={styles.userRow}>
                <span>{mail}</span>
                <span style={{ fontSize: 13 }}>
                  {typeof access === "string"
                    ? access === "read"
                      ? "Læs"
                      : "Skriv"
                    : access.role === "read"
                    ? "Læs (venter)"
                    : "Skriv (venter)"}
                </span>
                <button
                  onClick={() => handleRemove(mail)}
                  style={styles.removeBtn}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const BRAND = "#03424f";

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "grid",
    placeItems: "center",
    zIndex: 9999,
  },
  modal: {
    background: "#fff",
    borderRadius: 10,
    padding: 24,
    width: 460,
    maxWidth: "90%",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    position: "relative",
  },
  close: {
    position: "absolute",
    top: 12,
    right: 12,
    background: "none",
    border: "none",
    cursor: "pointer",
    color: BRAND,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 16,
    color: BRAND,
  },
  formRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginBottom: 8,
    position: "relative",
  },
  input: {
    flex: 1,
    padding: "8px 10px",
    fontSize: 14,
    borderRadius: 6,
    border: "1px solid #ccc",
    background: "#fff",
    color: "#000",
    minWidth: 0,
  },
  suggestions: {
    position: "absolute",
    top: 40,
    left: 0,
    right: 120,
    background: "#fff",
    border: "1px solid #ccc",
    borderRadius: 6,
    maxHeight: 140,
    overflowY: "auto",
    zIndex: 99999,
    color: BRAND,
  },
  suggestionItem: {
    padding: "6px 10px",
    cursor: "pointer",
  },
  select: {
    padding: "8px 10px",
    fontSize: 14,
    borderRadius: 6,
    border: "1px solid #ccc",
    background: "#fff",
    color: "#000",
    width: 100,
  },
  addBtn: {
    background: BRAND,
    color: "#fff",
    padding: "8px 12px",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  },
  userRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#f3f4f6",
    padding: "8px 12px",
    borderRadius: 6,
    marginBottom: 6,
    color: BRAND,
  },
  removeBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#b91c1c",
  },
};
