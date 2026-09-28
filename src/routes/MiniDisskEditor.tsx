import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  ArrowLeft,
  Copy,
  Eye,
  EyeOff,
  Printer,
  Save,
  Trash2,
} from "lucide-react";
import Topbar from "../components/Topbar";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import {
  MINI_DISSK_TEXT_FIELDS,
  createEmptyMiniDissk,
  type MiniDisskDoc,
  type MiniDisskTextField,
} from "../types/miniDissk";
import { canUseMiniDissk } from "../utils/miniDisskAccess";
import { queueRecoveryBackup } from "../utils/recoveryBackup";
import "./MiniDisskEditor.css";

type SaveState = "saved" | "dirty" | "saving" | "error";

const FIELD_COPY: Record<
  MiniDisskTextField,
  { title: string; help: string; placeholder: string; tone: string }
> = {
  rationale: {
    title: "Begrundelse for den valgte indsats",
    help: "Hvilke data, observationer eller erfaringer ligger bag valget?",
    placeholder: "Beskriv datagrundlaget og hvorfor netop denne indsats er relevant…",
    tone: "teal",
  },
  theoreticalAssumptions: {
    title: "Teoretiske antagelser",
    help: "Hvilken viden eller forståelse bygger indsatsen på?",
    placeholder: "Formulér de vigtigste faglige antagelser…",
    tone: "blue",
  },
  strategicEffort: {
    title: "Strategisk indsats",
    help: "Hvad vil I konkret gøre anderledes?",
    placeholder: "Beskriv den valgte indsats kort og handlingsorienteret…",
    tone: "amber",
  },
  strategicGoal: {
    title: "Mål for den strategiske indsats",
    help: "Hvilken ønsket forandring skal indsatsen skabe?",
    placeholder: "Formulér et tydeligt og anvendeligt mål…",
    tone: "green",
  },
  goalSigns: {
    title: "Tegn på opfyldelse af målet",
    help: "Hvad skal kunne ses, høres eller måles, hvis I er på rette vej?",
    placeholder: "Beskriv konkrete tegn på fremdrift og målopfyldelse…",
    tone: "violet",
  },
  evaluation: {
    title: "Evaluering",
    help: "Hvordan og hvornår følger I op på indsatsen?",
    placeholder: "Beskriv metode, tidspunkt og hvad evalueringen skal bruges til…",
    tone: "rose",
  },
};

export default function MiniDisskEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [miniDoc, setMiniDoc] = useState<MiniDisskDoc | null>(null);
  const [accessState, setAccessState] = useState<"checking" | "allowed" | "denied">(
    "checking"
  );
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [showGuidance, setShowGuidance] = useState(true);
  const skipNextAutosave = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (miniDoc && accessState === "allowed") queueRecoveryBackup(miniDoc, "mini");
  }, [miniDoc, accessState]);

  const projectRef = useMemo(() => {
    if (!user || !id) return null;
    return doc(db, "users", user.uid, "miniProjects", id);
  }, [id, user]);

  useEffect(() => {
    const load = async () => {
      if (!user || !id) {
        setAccessState("denied");
        return;
      }

      try {
        const allowed = await canUseMiniDissk(user.uid, user.email);
        if (!allowed) {
          setAccessState("denied");
          return;
        }

        setAccessState("allowed");
        const snapshot = await getDoc(doc(db, "users", user.uid, "miniProjects", id));
        if (!snapshot.exists()) {
          setAccessState("denied");
          return;
        }

        const data = snapshot.data();
        skipNextAutosave.current = true;
        setMiniDoc({
          ...createEmptyMiniDissk(id, user.email || ""),
          ...data,
          id,
        } as MiniDisskDoc);
      } catch (error) {
        console.error("[MiniDISSK] Kunne ikke indlæse projektet:", error);
        setAccessState("denied");
      }
    };

    load();
  }, [id, user]);

  const persist = async (documentToSave: MiniDisskDoc) => {
    if (!projectRef) return;
    setSaveState("saving");
    try {
      await setDoc(
        projectRef,
        {
          ...documentToSave,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setSaveState("saved");
    } catch (error) {
      console.error("[MiniDISSK] Kunne ikke gemme:", error);
      setSaveState("error");
    }
  };

  useEffect(() => {
    if (!miniDoc) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(miniDoc), 650);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [miniDoc]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (miniDoc) persist(miniDoc);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [miniDoc, projectRef]);

  const patchText = (field: MiniDisskTextField, value: string) => {
    setSaveState("dirty");
    setMiniDoc((current) => (current ? { ...current, [field]: value } : current));
  };

  const rename = (title: string) => {
    setSaveState("dirty");
    setMiniDoc((current) => (current ? { ...current, title } : current));
  };

  const duplicate = async () => {
    if (!user || !miniDoc) return;
    const copyRef = doc(collection(db, "users", user.uid, "miniProjects"));
    const copy: MiniDisskDoc = {
      ...miniDoc,
      id: copyRef.id,
      title: `${miniDoc.title || "MiniDISSK"} – kopi`,
    };
    await setDoc(copyRef, {
      ...copy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    navigate(`/mini/${copyRef.id}`);
  };

  const clearContent = () => {
    if (!window.confirm("Ryd alt indhold i denne MiniDISSK? Handlingen kan ikke fortrydes.")) {
      return;
    }
    setSaveState("dirty");
    setMiniDoc((current) => {
      if (!current) return current;
      return MINI_DISSK_TEXT_FIELDS.reduce(
        (next, field) => ({ ...next, [field]: "" }),
        current
      );
    });
  };

  const printDocument = async () => {
    if (miniDoc) await persist(miniDoc);
    window.print();
  };

  const completedFields = miniDoc
    ? MINI_DISSK_TEXT_FIELDS.filter((field) => miniDoc[field].trim().length > 0).length
    : 0;
  const completionPercent = Math.round(
    (completedFields / MINI_DISSK_TEXT_FIELDS.length) * 100
  );

  if (accessState === "checking" || (accessState === "allowed" && !miniDoc)) {
    return (
      <div className="mini-editor-page">
        <Topbar mode="home" />
        <div className="mini-editor-state">Henter MiniDISSK…</div>
      </div>
    );
  }

  if (accessState === "denied" || !miniDoc) {
    return (
      <div className="mini-editor-page">
        <Topbar mode="home" />
        <div className="mini-editor-state">
          <h1>Ingen adgang til MiniDISSK</h1>
          <p>Kontakt en administrator, hvis du skal have adgang til værktøjet.</p>
          <button type="button" onClick={() => navigate("/")}>Tilbage til forsiden</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mini-editor-page">
      <Topbar mode="home" />
      <header className="mini-editor-toolbar">
        <button className="mini-icon-button" type="button" onClick={() => navigate("/")}>
          <ArrowLeft size={18} />
          <span>Forside</span>
        </button>
        <div className="mini-title-wrap">
          <input
            value={miniDoc.title}
            onChange={(event) => rename(event.target.value)}
            aria-label="MiniDISSK-titel"
          />
        </div>
        <div className="mini-save-state" data-state={saveState}>
          <span />
          {saveState === "saving"
            ? "Gemmer…"
            : saveState === "dirty"
              ? "Ikke gemt"
              : saveState === "error"
                ? "Kunne ikke gemme"
                : "Gemt"}
        </div>
        <div className="mini-toolbar-actions">
          <button type="button" title="Gem nu" onClick={() => persist(miniDoc)}>
            <Save size={17} />
          </button>
          <button type="button" title="Vis eller skjul hjælpetekster" onClick={() => setShowGuidance((value) => !value)}>
            {showGuidance ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
          <button type="button" title="Lav en kopi" onClick={duplicate}>
            <Copy size={17} />
          </button>
          <button type="button" title="Print eller gem som PDF" onClick={printDocument}>
            <Printer size={17} />
          </button>
          <button type="button" className="danger" title="Ryd indhold" onClick={clearContent}>
            <Trash2 size={17} />
          </button>
        </div>
      </header>

      <main className="mini-editor-main">
        <div className="mini-progress-panel">
          <div>
            <strong>{completionPercent}% udfyldt</strong>
            <span>{completedFields} af {MINI_DISSK_TEXT_FIELDS.length} områder</span>
          </div>
          <div className="mini-progress-track"><span style={{ width: `${completionPercent}%` }} /></div>
        </div>

        <div className="mini-print-area">
          <div className="mini-print-title">
            <h1>{miniDoc.title || "MiniDISSK"}</h1>
          </div>

          <div className="mini-workspace-layout">
            <div className="mini-workspace-main">
              <MiniField
                field="rationale"
                value={miniDoc.rationale}
                onChange={patchText}
                showGuidance={showGuidance}
                className="mini-rationale"
              />

              <section className="mini-strategy-cluster" aria-label="Strategisk klynge">
                <div className="mini-cluster-heading">
                  <span>Strategisk klynge</span>
                  <p>De tre perspektiver udvikles sideløbende og skal hænge sammen.</p>
                </div>
                <div className="mini-cluster-grid">
                  <MiniField field="theoreticalAssumptions" value={miniDoc.theoreticalAssumptions} onChange={patchText} showGuidance={showGuidance} />
                  <MiniField field="strategicEffort" value={miniDoc.strategicEffort} onChange={patchText} showGuidance={showGuidance} />
                  <MiniField field="strategicGoal" value={miniDoc.strategicGoal} onChange={patchText} showGuidance={showGuidance} />
                </div>
              </section>

              <MiniField
                field="goalSigns"
                value={miniDoc.goalSigns}
                onChange={patchText}
                showGuidance={showGuidance}
                className="mini-goal-signs"
              />
            </div>

            <MiniField
              field="evaluation"
              value={miniDoc.evaluation}
              onChange={patchText}
              showGuidance={showGuidance}
              className="mini-evaluation-rail"
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function MiniField({
  field,
  value,
  onChange,
  showGuidance,
  className = "",
}: {
  field: MiniDisskTextField;
  value: string;
  onChange: (field: MiniDisskTextField, value: string) => void;
  showGuidance: boolean;
  className?: string;
}) {
  const copy = FIELD_COPY[field];
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(textarea.scrollHeight, 150)}px`;
  }, [value]);

  return (
    <article className={`mini-field-card tone-${copy.tone} ${className}`}>
      <header>
        <span className="mini-field-dot" />
        <div>
          <h2>{copy.title}</h2>
          {showGuidance && <p>{copy.help}</p>}
        </div>
      </header>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(field, event.target.value)}
        placeholder={showGuidance ? copy.placeholder : "Skriv her…"}
      />
    </article>
  );
}
