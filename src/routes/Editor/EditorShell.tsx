// src/routes/Editor/EditorShell.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Topbar from "../../components/Topbar";
import { useAuth } from "../../context/AuthContext";
import { createOwnedProject, saveSharedProject } from "../../utils/save";
import { db } from "../../firebase";
import { deleteDoc, doc as fsDoc, getDoc } from "firebase/firestore";
import CanvasPanel from "./CanvasPanel";
import type { Doc } from "../../types/editor";
import ShareModal from "../../components/ShareModal";
import type { DownloadOptions } from "../../components/DownloadModal";
import { exportDissk } from "../../utils/exportDissk";
import { EDITOR_THEME } from "./editorTheme";

function deepMerge<T extends Record<string, any>>(base: T = {} as T, incoming: Partial<T> = {}): T {
  const out: any = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(incoming || {})) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = deepMerge(out[k] || {}, v as any);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

const { C, RADIUS, MIN_COL_W, GAP, ROWS, INPUT_H, EFFECT_H } = EDITOR_THEME;

const LOCAL_KEY = "dissk_local_projects";
const SESSION_KEY = "dissk_anon_session";

/** ---------- Local Storage Helpers ---------- */
const writeLocal = (doc: Doc & { styles?: any }) => {
  try {
    const raw = localStorage.getItem(LOCAL_KEY) || "{}";
    const all = JSON.parse(raw);
    all[doc.id] = doc;
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
  } catch {}
};

/** ---------- Session Storage Helpers (ANON) ---------- */
const readSessionDoc = (): (Doc & { styles?: any; stepSymbols?: any }) | null => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw);

// 🔁 Migration: array → map + objekt med numeriske keys → map
if ((stored as any).steps && Array.isArray((stored as any).steps)) {
  const raw = (stored as any).stepSymbols;
  if (Array.isArray(raw)) {
    const map: Record<string, any> = {};
    raw.forEach((val: any, index: number) => {
      if (!val) return;
      const step = (stored as any).steps[index];
      if (step?.id) map[step.id] = val;
    });
    (stored as any).stepSymbols = map;
} else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
  // Behold objektet som det er — numeriske keys er ok
  (stored as any).stepSymbols = raw;
}

}


    return stored as Doc & { styles?: any; stepSymbols?: any };
  } catch {
    return null;
  }
};


const writeSessionDoc = (doc: Doc & { styles?: any }) => {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(doc));
  } catch {}
};

const clearSessionDoc = () => {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
};

/** ---------- Doc Factories ---------- */
const newStep = (idx: number) => ({
  id: crypto.randomUUID(),
  title: `Trin ${idx}`,
  time: "",
  assumption: "",
  sign: "",
});

const newDoc = (id: string): Doc & { styles: any } => {
  const error = new Error();
  console.groupCollapsed("📛 newDoc() CALLED");
  console.log("→ ID:", id);
  console.log("→ Call stack:");
  console.log(error.stack);
  console.groupEnd();

return {
  id,
  title: "Ny DISSK",
  input: "",
  steps: [newStep(1), newStep(2), newStep(3)],
  output: "",
  outputTime: "",
  outputAssumption: "",
  outputSign: "",
  effects: { short: "", long: "" },
  context: "",
  updatedAt: Date.now(),
  showTidAnsvar: true,
  showAntagelser: true,
  showContext: false,
  stepLabel: "trin",
  styles: { input: { bg: C.brand } },
  // 👇 NYT: start altid som map (aldrig array)
  stepSymbols: {},
};

};

export default function EditorShell() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth() as { user?: any };

  const [doc, setDoc] = useState<(Doc & { styles?: any }) | null>(null);
  const [projectAccess, setProjectAccess] = useState<"owner" | "read" | "write">("owner");
  const [zoom, setZoom] = useState(1);
  const [zoomMode, setZoomMode] = useState<"auto" | "manual">("auto");
  const [showShare, setShowShare] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null!);
  const midMarkerRef = useRef<HTMLTextAreaElement>(null!);
  const migratedRef = useRef(false);

  const handleDownloadRequested = async (options: DownloadOptions) => {
    if (!panelRef.current) return;
    await exportDissk(panelRef.current, options);
  };

  /** ---------- Route: create new ---------- */
  useEffect(() => {
    if (id !== "new") return;

    // Afvent auth init
    if (user === undefined) {
      console.log("[EditorShell:new] Afventer Auth – user er undefined");
      return;
    }

    // ANONYM BRUGER → brug sessionStorage, ingen Firestore/localStorage
    if (!user) {
      const existing = readSessionDoc();
      if (existing) {
        console.log("[EditorShell:new] Loader anonym DISSK fra sessionStorage");
        setDoc(existing);
      } else {
        console.log("[EditorShell:new] Ingen anonym DISSK – opretter ny i session");
        const tempId = crypto.randomUUID();
        const fresh = newDoc(tempId);
        setDoc(fresh);
        writeSessionDoc(fresh);
      }
      return;
    }

    // LOGGET IND → opret nyt projekt som før
    const nid = crypto.randomUUID();
    const fresh = newDoc(nid);
    writeLocal(fresh);
    navigate(`/editor/${nid}`, { replace: true });
  }, [id, navigate, user]);

  const projectId = useMemo(() => (id && id !== "new" ? id : null), [id]);

  /** ---------- Load Project (kun for loggede brugere + rigtige IDs) ---------- */
  useEffect(() => {
    if (!projectId || id === "new") return;

    if (user === undefined) {
      console.log("[EditorShell:load] Afventer Auth – user er undefined");
      return;
    }

    if (!user) {
      console.warn("[EditorShell:load] Ingen bruger logget ind — indlæser ikke Firestore-projekt");
      return;
    }

    const load = async () => {
      try {
        console.log("[EditorShell:load] Tjekker Firestore for projekt:", projectId);
        const ownRef = fsDoc(db, "users", user.uid, "projects", projectId);
        const globalRef = fsDoc(db, "projects", projectId);
        const [ownSnap, globalSnap] = await Promise.all([getDoc(ownRef), getDoc(globalRef)]);
        const email = String(user.email || "").toLowerCase();
        const globalData = globalSnap.exists() ? globalSnap.data() : null;
        const isOwner = globalData?.ownerUid === user.uid
          || String(globalData?.owner || "").toLowerCase() === email
          || (!globalData && ownSnap.exists());
        const sharedRole = globalData?.sharedWith?.[email];
        const selectedData = isOwner && ownSnap.exists()
          ? { ...globalData, ...ownSnap.data(), sharedWith: globalData?.sharedWith || {} }
          : globalData;

        setProjectAccess(isOwner ? "owner" : sharedRole);

        if (selectedData && (isOwner || sharedRole === "read" || sharedRole === "write")) {
          console.log("[EditorShell:load] Loaded from Firestore ✅");

          const data = selectedData;

const normalized: any = {
  id: projectId,
  title: data.title ?? "Ny DISSK",
  input: data.input ?? "",
  steps:
    Array.isArray(data.steps) && data.steps.length
      ? data.steps
      : [newStep(1), newStep(2), newStep(3)],
  output: data.output ?? "",
  outputTime: data.outputTime ?? "",
  outputAssumption: data.outputAssumption ?? "",
  outputSign: data.outputSign ?? "",
  effects: data.effects ?? { short: "", long: "" },
  context: data.context ?? "",
  updatedAt: Date.now(),
  styles: data.styles ?? {},
  showTidAnsvar: data.showTidAnsvar ?? true,
  showAntagelser: data.showAntagelser ?? true,
  showContext: data.showContext ?? false,
  stepLabel: data.stepLabel === "tema" ? "tema" : "trin",


// i EditorShell.tsx, inde i "normalized" objektet
stepSymbols: (() => {
  const raw = (data as any).stepSymbols;
  if (raw == null) return {};

  // Array → map
  if (Array.isArray(raw)) {
    const out: Record<string, "left" | "right" | "both" | "cycle"> = {};
    (data.steps || []).forEach((s: any, i: number) => {
      const v = raw[i];
      if (v) out[s.id] = v;
    });
    return out;
  }

// Objekt → brug som map direkte (numeriske keys kan være gyldige step.id’er)
if (typeof raw === "object") {
  const out: Record<string, "left" | "right" | "both" | "cycle"> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[String(k)] = v as any;
  }
  return out;
}


  return {};
})(),



};


          setDoc(normalized);
          if (isOwner && ownSnap.exists()) {
            const migration = globalSnap.exists()
              ? saveSharedProject(projectId, {
                  ...normalized,
                  owner: globalData?.owner,
                  ownerUid: globalData?.ownerUid || user.uid,
                  sharedWith: globalData?.sharedWith || {},
                })
              : createOwnedProject(user.uid, email, projectId, normalized);
            void migration
              .then(() => deleteDoc(ownRef))
              .catch((error) =>
                console.error("[EditorShell:load] Kunne ikke migrere projektet", error)
              );
          }
          requestAnimationFrame(() => autoFit());

          return;
        }

        console.warn("[EditorShell:load] Firestore-projekt ikke fundet — opretter ikke nyt automatisk");
        return;
      } catch (e) {
        console.error("[EditorShell:load:firestore ERROR]", e);
      }

      console.warn("[EditorShell:load] Local + Firestore mangler → laver ny");
      const fresh = newDoc(projectId);
      setDoc(fresh);
      writeLocal(fresh);
    };

    load();
  }, [projectId, user, id]);

  /** ---------- Migrer anonym DISSK til bruger ved login ---------- */
  useEffect(() => {
    if (!user) return;
    if (id !== "new") return;
    if (migratedRef.current) return;

    const sessionDoc = readSessionDoc();
    if (!sessionDoc) return;

    migratedRef.current = true;

    const newId = crypto.randomUUID();
    const migrated: Doc & { styles?: any } = {
      ...sessionDoc,
      id: newId,
      updatedAt: Date.now(),
    };

    console.log("[EditorShell:migrate] Migrerer anonym DISSK til brugerprojekt", newId);

    createOwnedProject(user.uid, user.email || "", newId, migrated)
      .then(() => {
        writeLocal(migrated);
        clearSessionDoc();
        navigate(`/editor/${newId}`, { replace: true });
      })
      .catch((e) => {
        console.error("[EditorShell:migrate] Fejl ved migration", e);
      });
  }, [user, id, navigate]);

/** ---------- Hjælpefunktion: Saml numeriske keys til arrays ---------- */
function normalizeNumericKeys(obj: any, parentKey?: string): any {
  if (Array.isArray(obj)) {
    return obj.slice(-10);
  }

  if (obj && typeof obj === "object") {
    // ⛔️ VIGTIGT: rør ALDRIG stepSymbols – vi skal BEHOLDE "1","2","3" som string keys
    if (parentKey === "stepSymbols") return obj;

    const keys = Object.keys(obj);
    const numericKeys = keys.filter((k) => /^\d+$/.test(k));

    if (numericKeys.length === keys.length && numericKeys.length > 0) {
      const arr = numericKeys
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => (obj as any)[k])
        .slice(-10);
      return arr;
    }

    const out: any = {};
    for (const k of keys) {
      out[k] = normalizeNumericKeys((obj as any)[k], k);
    }
    return out;
  }

  return obj;
}


  /** ---------- PATCH (forbedret) ---------- */
  const patch = (partial: Partial<Doc>) => {
    setDoc((prev) => {
      if (!prev) return prev;
      if (projectAccess === "read") return prev;

const next: Doc & { styles?: any } = deepMerge(prev, {
  ...partial,
  updatedAt: Date.now(),
});

// 👇 VIGTIGT: stepSymbols skal REPLACE'es (deepMerge kan ikke slette keys)
if (Object.prototype.hasOwnProperty.call(partial, "stepSymbols")) {
  (next as any).stepSymbols = (partial as any).stepSymbols ?? {};
}


      // Normaliser steps / numeriske keys
      if (next.steps && !Array.isArray(next.steps)) {
        const stepKeys = Object.keys(next.steps).filter((k) => /^\d+$/.test(k));
        if (stepKeys.length > 0) {
          next.steps = stepKeys
            .sort((a, b) => Number(a) - Number(b))
            .map((k) => (next.steps as Record<string, any>)[k])
            .slice(-10);
        }


      }

// --- SIKR stepSymbols altid er et MAP, ikke et array ---
const nextForNormalize: any = { ...next };

if (nextForNormalize.stepSymbols && typeof nextForNormalize.stepSymbols === "object") {
  const fixed: Record<string, any> = {};
  Object.entries(nextForNormalize.stepSymbols).forEach(([k, v]) => {
    fixed[String(k)] = v;
  });
  nextForNormalize.stepSymbols = fixed;
}


// Tving ALLE keys til strings ("1","2","3" i stedet for 1,2,3)
if (nextForNormalize.stepSymbols && typeof nextForNormalize.stepSymbols === "object") {
  const fixed: Record<string, any> = {};
  Object.entries(nextForNormalize.stepSymbols).forEach(([k, v]) => {
    fixed[String(k)] = v;
  });
  nextForNormalize.stepSymbols = fixed;
}

// -----------------------------------------------------------

// Normalisér resten af dokumentet (stepSymbols er nu “låst”)
const cleaned = normalizeNumericKeys(nextForNormalize);


      if (user?.uid) {
        const save = saveSharedProject(cleaned.id, cleaned);
        save
          .then(() => console.log("✅ gemt"))
          .catch((e) => console.error("❌ gem fejlede", e));
      } else {
        // ANONYM → kun sessionStorage
        console.warn("⚠️ Ingen bruger logget ind – gemmer kun i session (midlertidig DISSK)");
        writeSessionDoc(cleaned);
      }

      return cleaned;
    });
  };

  // patchstepfields//
  // patchStepField – ERSTAT HELE DENNE FUNKTION
const patchStepField = (
  stepId: string,
  field: keyof Doc["steps"][0],
  value: string
) => {
  setDoc((prev) => {
    if (!prev) return prev;
    if (projectAccess === "read") return prev;

    // byg nye steps ud fra seneste prev (ikke fra lukket over "doc")
    const updatedSteps = (prev.steps || []).map((s) =>
      s.id === stepId ? { ...s, [field]: value } : s
    );

    // merge så vi ikke taber felter (output mm.)
    const next: Doc & { styles?: any } = {
      ...prev,
      steps: updatedSteps,
      updatedAt: Date.now(),
    };

// normaliser som i patch(), men SKÅN stepSymbols (må ALDRIG laves til array)
const normalizeNumericKeys = (obj: any, parentKey?: string): any => {
  if (Array.isArray(obj)) {
    return obj.slice(-10);
  }
  if (obj && typeof obj === "object") {
    // ⛔️ Rør ikke stepSymbols – vi skal BEHOLDE "0","1","2" som string-keys
    if (parentKey === "stepSymbols") return obj;

    const keys = Object.keys(obj);
    const numericKeys = keys.filter((k) => /^\d+$/.test(k));

    if (numericKeys.length === keys.length && numericKeys.length > 0) {
      const arr = numericKeys
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => (obj as any)[k])
        .slice(-10);
      return arr;
    }

    const out: any = {};
    for (const k of keys) {
      out[k] = normalizeNumericKeys((obj as any)[k], k);
    }
    return out;
  }
  return obj;
};


        // --- BESKYT stepSymbols mod array-normalisering ---
        const nextForNormalize: any = { ...next };

        if (nextForNormalize.stepSymbols) {
          const ss = nextForNormalize.stepSymbols;
          const fixed: Record<string, any> = {};
          Object.entries(ss).forEach(([k, v]) => {
            fixed[String(k)] = v; // tving string-keys
          });
          nextForNormalize.stepSymbols = fixed;
        }

        // nu normaliserer vi resten af dokumentet
        const cleaned = normalizeNumericKeys(nextForNormalize);

    // persist som i patch()
    if (user?.uid) {
      const save = saveSharedProject(cleaned.id, cleaned);
      save.catch((e) => console.error("❌ Direkte gem fejlede", e));
    } else {
      writeSessionDoc(cleaned);
    }

    return cleaned; // ← funktionel setDoc med samlet doc
  });
};


  /** ---------- Auto Fit (både zoom-ud og zoom-ind) ---------- */
  const autoFit = () => {
    if (!panelRef.current || !scrollRef.current) return;

    const panel = panelRef.current;
    const scroll = scrollRef.current;

    const panelW = panel.scrollWidth;
    const panelH = panel.scrollHeight;
    const vw = scroll.clientWidth;
    const vh = scroll.clientHeight;

    // lidt luft rundt om, så vi med sikkerhed undgår scroll i auto
    const fitW = (vw - 16) / panelW;
    const fitH = (vh - 16) / panelH;

    const desired = Math.min(1, fitW, fitH);

    const MIN_Z = 0.3;
    const MAX_Z = 1;
    const EPS = 0.02;

    const clamped = Math.max(MIN_Z, Math.min(MAX_Z, desired));

    setZoom((z) => {
      if (clamped < z - EPS || clamped > z + EPS) return clamped;
      return z;
    });

    setZoomMode("auto");
  };

  useEffect(() => {
    if (zoomMode !== "auto" || !panelRef.current || !scrollRef.current) return;

    let raf = 0;
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => autoFit());
    };

    const ro = new ResizeObserver(() => schedule());
    ro.observe(panelRef.current);
    ro.observe(scrollRef.current);

    const mo = new MutationObserver(() => schedule());
    mo.observe(panelRef.current, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("resize", schedule);
    schedule();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [zoomMode]);


  useEffect(() => {
    const t = setTimeout(() => autoFit(), 10);
    return () => clearTimeout(t);
  }, [doc]);

  // VIGTIGT: nu må manglende user IKKE blokere editoren (anonym mode)
  if (!doc) return null;

  /** ---------- UI ---------- */
  return (
    <div
      style={{
        background: "#fff",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {showShare && user && projectAccess === "owner" && (
        <ShareModal projectId={doc.id} onClose={() => setShowShare(false)} />
      )}

      <Topbar
        mode="editor"
        title={doc.title}
        onRename={(newTitle) => patch({ title: newTitle })}
        doc={doc}
        patch={patch}
        onShareClick={user && projectAccess === "owner" ? () => setShowShare(true) : undefined}
        onToggleView={() =>
          patch({
            showTidAnsvar: !doc.showTidAnsvar,
            showAntagelser: !doc.showAntagelser,
          })
        }
        onSettingsClick={() => setShowSettings((v) => !v)}
        onDownloadRequested={user ? handleDownloadRequested : undefined}
      />

      {/* Banner for anonyme brugere */}
      {!user && (
        <div
          style={{
            position: "fixed",
            top: 56,
            left: 0,
            right: 0,
            background: "#b91c1c",
            color: "#fff",
            padding: "6px 12px",
            textAlign: "center",
            zIndex: 250,
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          DIN DISSK GEMMES IKKE! Log på for at gemme din DISSK.
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div
          style={{
            position: "absolute",
            top: 64,
            left: 20,
            background: "#ffffff",
            border: "1px solid #d0d0d0",
            borderRadius: 8,
            padding: 16,
            width: 220,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 300,
            color: "#000",
            fontFamily: "Arial, sans-serif",
            fontSize: 14,
          }}
        >
          <h4
            style={{
              marginTop: 0,
              marginBottom: 12,
              fontSize: 16,
              fontWeight: 700,
              color: "#000",
            }}
          >
            Visning
          </h4>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
            }}
          >
            <input
              type="checkbox"
              checked={doc.showTidAnsvar}
              onChange={(e) => patch({ showTidAnsvar: e.target.checked })}
              style={{ width: 16, height: 16 }}
            />
            <span>Tid & Ansvar</span>
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <input
              type="checkbox"
              checked={doc.showAntagelser}
              onChange={(e) => patch({ showAntagelser: e.target.checked })}
              style={{ width: 16, height: 16 }}
            />
            <span>Antagelser</span>
          </label>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              onClick={() => setShowSettings(false)}
              style={{
                padding: "6px 12px",
                background: "#eeeeee",
                color: "#000",
                borderRadius: 6,
                border: "1px solid #ccc",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Luk
            </button>
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className="editor-scroll"
        style={{
          width: "100vw",
          height: "calc(100vh - 64px)",
          overflow: zoomMode === "auto" ? "hidden" : "auto",
          position: "relative",
          background: "#fff",
        }}
      >
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            display: "inline-block",
            marginTop: 64,
            padding: 16,
            position: "relative",
            overflow: "visible",
          }}
        >
          <CanvasPanel
            doc={doc}
            patch={patch}
            patchStepField={patchStepField}
            theme={{ C, RADIUS, MIN_COL_W, GAP, ROWS, INPUT_H, EFFECT_H }}
            panelRef={panelRef}
            midMarkerRef={midMarkerRef}
          />
        </div>
      </div>

      <div
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          display: "flex",
          gap: 10,
          zIndex: 200,
          alignItems: "center",
        }}
      >
        <button
          onClick={() => {
            setZoomMode("manual");
            setZoom((z) => Math.max(z - 0.1, 0.3));
          }}
          style={zoomBtn}
        >
          –
        </button>
        <button
          onClick={() => {
            setZoomMode("manual");
            setZoom(1);
          }}
          style={zoomBtn}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => {
            setZoomMode("manual");
            setZoom((z) => Math.min(z + 0.1, 2));
          }}
          style={zoomBtn}
        >
          +
        </button>
        <button
          onClick={() => {
            setZoomMode("auto");
            requestAnimationFrame(() => autoFit());
          }}
          style={zoomBtn}
        >
          Auto
        </button>
      </div>
    </div>
  );
}

const zoomBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
  fontSize: 14,
  color: "black",
  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
};
