import { useState } from "react";
import { db } from "../firebase";
import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";

const BRAND = "#03424f";

type Props = {
  userUid: string;
  userEmail: string;
  onClose: () => void;
};

export default function CreateModal({ userUid, userEmail, onClose }: Props) {
  const [stepsCount, setStepsCount] = useState(4);
  const [showTidAnsvar, setShowTidAnsvar] = useState(true);
  const [showAntagelser, setShowAntagelser] = useState(true);
  const [showContext, setShowContext] = useState(false);
  const [stepLabel, setStepLabel] = useState<"trin" | "tema">("trin");
  const [loading, setLoading] = useState(false);

  const nav = useNavigate();

  const handleCreate = async () => {
    try {
      setLoading(true);

      const newRef = doc(collection(db, "projects"));
      const newProjectId = newRef.id;

      await setDoc(newRef, {
        title: "Unavngivet DISSK",
        owner: userEmail,
        createdAt: serverTimestamp(),
        sharedWith: {},
      });

      const steps = Array.from({ length: stepsCount }, (_, i) => ({
        id: String(i + 1),
        title: stepLabel === "tema" ? `Tema ${i + 1}` : `Trin ${i + 1}`,
        time: "",
        sign: "",
        assumption: "",
      }));

      await setDoc(doc(db, "users", userUid, "projects", newProjectId), {
        title: "Unavngivet DISSK",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        owner: userEmail,

        input: "",
        context: "",
        effects: { short: "", long: "" },

        output: "",
        outputAssumption: "",
        outputSign: "",
        outputTime: "",

        steps,
        styles: {},

        showTidAnsvar,
        showAntagelser,
        showContext,
        stepLabel,
      });

      nav(`/editor/${newProjectId}`);
      onClose();
    } catch (err) {
      console.error("[CREATE] Fejl ved oprettelse:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <button onClick={onClose} style={styles.close} aria-label="Luk">
          <X />
        </button>

        <h2 style={styles.title}>Opret ny DISSK</h2>

        {/* Antal trin */}
        <div style={styles.row}>
          <span style={styles.label}>Antal trin</span>
          <select
            value={stepsCount}
            onChange={(e) => setStepsCount(Number(e.target.value))}
            style={styles.select}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {/* Visning toggles */}
        <ToggleRow
          label="Tid & ansvar"
          checked={showTidAnsvar}
          onChange={setShowTidAnsvar}
        />

        <ToggleRow
          label="Antagelser"
          checked={showAntagelser}
          onChange={setShowAntagelser}
        />

        <ToggleRow
          label="Kontekst"
          checked={showContext}
          onChange={setShowContext}
        />

        {/* Segmented control: Trin / Tema */}
        <div style={{ margin: "10px 0 14px 0" }}>
          <div style={styles.segment}>
            <button
              type="button"
              onClick={() => setStepLabel("trin")}
              style={{
                ...styles.segmentBtn,
                background: stepLabel === "trin" ? BRAND : "#fff",
                color: stepLabel === "trin" ? "#fff" : "#000",
              }}
            >
              Trin
            </button>
            <button
              type="button"
              onClick={() => setStepLabel("tema")}
              style={{
                ...styles.segmentBtn,
                background: stepLabel === "tema" ? BRAND : "#fff",
                color: stepLabel === "tema" ? "#fff" : "#000",
              }}
            >
              Tema
            </button>
          </div>
        </div>

        <p style={styles.note}>
          Du kan altid ændre visning og trin-type senere.
        </p>

        <div style={styles.buttons}>
          <button onClick={onClose} style={styles.cancel}>
            Annuller
          </button>
          <button
            onClick={handleCreate}
            style={styles.create}
            disabled={loading}
          >
            {loading ? "Opretter..." : "Opret"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Toggle row ---------- */
function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={styles.toggleRow}>
      <span style={styles.label}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          ...styles.toggle,
          background: checked ? BRAND : "#e5e7eb",
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <span
          style={{
            ...styles.toggleKnob,
            left: checked ? 18 : 2,
          }}
        />
      </button>
    </div>
  );
}

/* ---------- Styles ---------- */
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
    textAlign: "center",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  label: {
    fontSize: 14,
    color: BRAND,
    fontWeight: 600,
  },
  select: {
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid #ccc",
  },
  toggleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "4px 0",
  },
  toggle: {
    width: 34,
    height: 18,
    borderRadius: 999,
    border: "1px solid #d1d5db",
    position: "relative",
    cursor: "pointer",
    padding: 0,
  },
  toggleKnob: {
    position: "absolute",
    top: 2,
    width: 14,
    height: 14,
    borderRadius: "50%",
    background: "#fff",
    transition: "left 120ms ease",
  },
  segment: {
    display: "flex",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    overflow: "hidden",
  },
  segmentBtn: {
    flex: 1,
    padding: "6px 0",
    border: "none",
    fontWeight: 700,
    cursor: "pointer",
  },
  note: {
    fontSize: 13,
    color: "#555",
    marginBottom: 16,
    textAlign: "center",
  },
  buttons: {
    display: "flex",
    justifyContent: "center",
    gap: 12,
  },
  cancel: {
    padding: "8px 16px",
    background: "#ccc",
    color: "#000",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  },
  create: {
    padding: "8px 16px",
    background: BRAND,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 600,
  },
};
