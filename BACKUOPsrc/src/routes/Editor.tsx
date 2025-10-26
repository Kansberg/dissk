// src/routes/Editor.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Topbar from "../components/Topbar";
import { useAuth } from "../context/AuthContext";
import { saveProject } from "../utils/save";
import { db } from "../firebase";
import { doc as fsDoc, getDoc } from "firebase/firestore";

// ---------- Theme ----------
const C = {
  brand: "#03424f",
  brandDark: "#023641",
  light1: "#f8fafc",
  slate: "#e5e7eb",
  dashed: "#94a3b8",
  edge: "#cbd5e1",
  text: "#0f172a",
};

const RADIUS = 14;
const MIN_COL_W = 260;
const GAP = 16;

// Rækkehøjder (vh)
const ROWS = {
  TIME_H: "5vh",
  ASSUMP_H: "16vh",
  MID_H: "14vh",
  SIGN_H: "30vh",
};

const INPUT_H = "50vh";
const EFFECT_H = "20vh";

// ---------- Types ----------
type Step = {
  id: string;
  title: string;
  time: string;
  assumption: string;
  sign: string;
};

type Doc = {
  id: string;
  title: string;
  input: string;
  steps: Step[];
  output: string;
  outputTime?: string;
  outputAssumption: string;
  outputSign: string;
  effects: { short: string; long: string };
  context: string;
  updatedAt: number;
};

// ---------- LocalStorage ----------
const LOCAL_KEY = "dissk_local_projects";
const readLocal = (id: string): Doc | null => {
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
    return all[id] || null;
  } catch {
    return null;
  }
};
const writeLocal = (doc: Doc) => {
  const all = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
  all[doc.id] = doc;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
};

// ---------- Factories ----------
const newStep = (idx: number): Step => ({
  id: crypto.randomUUID(),
  title: `Trin ${idx}`,
  time: "",
  assumption: "",
  sign: "",
});
const newDoc = (id: string): Doc => ({
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
});

// ---------- Reusable ----------
const label: React.CSSProperties = {
  fontWeight: 800,
  color: C.brand,
  fontSize: 14,
  fontFamily: "Arial, sans-serif",
};

const card = (bg: string, extra?: React.CSSProperties): React.CSSProperties => ({
  background: bg,
  border: `1px solid ${bg === C.brand ? C.brandDark : C.slate}`,
  color: bg === C.brand ? "#fff" : C.text,
  borderRadius: RADIUS,
  padding: 12,
  width: "100%",
  minWidth: MIN_COL_W,
  position: "relative",
  boxSizing: "border-box",
  fontSize: 12,
  fontFamily: "Arial, sans-serif",
  lineHeight: 1.4,
  boxShadow:
    bg === C.brand
      ? "0 4px 12px rgba(0,0,0,0.75)"
      : "0 4px 12px rgba(0,0,0,0.25)",
  ...extra,
});

const arrowTextarea = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: "#e5eff5",
  color: C.text,
  fontWeight: 600,
  clipPath: "polygon(0 0, 92% 0, 100% 50%, 92% 100%, 0 100%)",
  filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.4))",
  border: "none",
  fontSize: 12,
  fontFamily: "Arial, sans-serif",
  lineHeight: 1.3,
  ...extra,
});

const dashedPanelBase: React.CSSProperties = {
  border: `2px dashed ${C.edge}`,
  borderRadius: RADIUS,
  padding: 16,
  width: "fit-content",
  height: "fit-content",
  minWidth: "98vw",
  boxSizing: "border-box",
  position: "relative",
  background: "#fff",
};

// ---------- Component ----------
export default function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [doc, setDoc] = useState<Doc | null>(null);
  const [zoom, setZoom] = useState(1);
  const [zoomMode, setZoomMode] = useState<"auto" | "manual">("auto");

  const [showContext, setShowContext] = useState(false);
const [contextText, setContextText] = useState(doc?.context ?? "");


  const scrollRef = useRef<HTMLDivElement>(null);
  const scaledRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const midMarkerRef = useRef<HTMLDivElement>(null);

  const [midlineTop, setMidlineTop] = useState<number>(0);

  useEffect(() => {
    if (id === "new") {
      const nid = crypto.randomUUID();
      const fresh = newDoc(nid);
      writeLocal(fresh);
      navigate(`/editor/${nid}`, { replace: true });
    }
  }, [id, navigate]);

  const projectId = useMemo(() => (id && id !== "new" ? id : null), [id]);

  useEffect(() => {
    const load = async () => {
      if (!projectId) return;
      const local = readLocal(projectId);
      if (local) {
        if (typeof local.outputTime === "undefined") local.outputTime = "";
        setDoc(local);
        return;
      }
      if (user?.uid) {
        try {
          const snap = await getDoc(fsDoc(db, "users", user.uid, "projects", projectId));
          const data = snap.exists() ? (snap.data() as any) : null;
          if (data) {
            const normalized: Doc = {
              id: projectId,
              title: data.title ?? "Ny DISSK",
              input: data.input ?? "",
              steps: Array.isArray(data.steps) && data.steps.length ? data.steps : [newStep(1), newStep(2), newStep(3)],
              output: data.output ?? "",
              outputTime: data.outputTime ?? "",
              outputAssumption: data.outputAssumption ?? "",
              outputSign: data.outputSign ?? "",
              effects: data.effects ?? { short: "", long: "" },
              context: data.context ?? "",
              updatedAt: Date.now(),
            };
            setDoc(normalized);
            writeLocal(normalized);
            return;
          }
        } catch (e) {
          console.error("Firestore read failed:", e);
        }
      }
      const fresh = newDoc(projectId!);
      setDoc(fresh);
      writeLocal(fresh);
    };
    load();
  }, [projectId, user?.uid]);

  const patch = (partial: Partial<Doc>) => {
    if (!doc) return;
    const next: Doc = { ...doc, ...partial, updatedAt: Date.now() };
    setDoc(next);
    writeLocal(next);
    if (user?.uid) {
      saveProject(user.uid, next.id, next).catch((e) => console.error("Firestore write failed:", e));
    }
  };

  const addStep = () => {
    if (!doc) return;
    if (doc.steps.length >= 10) return;
    patch({ steps: [...doc.steps, newStep(doc.steps.length + 1)] });
  };

  const measureMidline = () => {
    if (!panelRef.current || !midMarkerRef.current) return;
    const panelBox = panelRef.current.getBoundingClientRect();
    const midBox = midMarkerRef.current.getBoundingClientRect();
    const midCenter = (midBox.top + midBox.bottom) / 2 - panelBox.top;
    setMidlineTop(midCenter);
  };

  const autoFit = () => {
    if (zoomMode !== "auto" || !panelRef.current || !scrollRef.current) return;
    const panelW = panelRef.current.scrollWidth;
    const panelH = panelRef.current.scrollHeight;
    const vw = scrollRef.current.clientWidth;
    const vh = scrollRef.current.clientHeight;
    const fit = Math.min(1, vw / (panelW + 2), vh / (panelH + 2));
    setZoom(fit);
  };

  useEffect(() => {
    measureMidline();
    autoFit();
    const onResize = () => {
      measureMidline();
      autoFit();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [doc, zoomMode]);

  if (!doc) return null;

const gridCols =
  `minmax(${MIN_COL_W}px, 1fr)` +                      // Input
  ` 5px ` +                                           // spacer EFTER Input
  `repeat(${doc.steps.length}, minmax(${MIN_COL_W}px, 1fr))` +
  `minmax(${MIN_COL_W}px, 1fr)` +                      // Output
  ` 10px ` +                                           // spacer FØR Effekter
  `minmax(${MIN_COL_W}px, 1fr)` +                      // Kortsigtet effekt
  `minmax(${MIN_COL_W}px, 1fr)`;                       // Langsigtet effekt


const INPUT_COL = 1;

const STEP_COL_START = 3;                               // første trin-kolonne
const OUTPUT_COL = STEP_COL_START + doc.steps.length;   // Output kommer efter alle trin

const EFFECT_SPACER_COL = OUTPUT_COL + 1;               // smal spacer-kolonne
const EFFECT_SHORT_COL = OUTPUT_COL + 2;                // Kortsigtet effekt
const EFFECT_LONG_COL = OUTPUT_COL + 3;                 // Langsigtet effekt


  return (
    <div style={{ background: "#fff", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <Topbar
        mode="editor"
        title={doc.title}
        onRename={(newTitle) => patch({ title: newTitle })}
      />

      <div
        ref={scrollRef}
        style={{
          width: "100vw",
          height: "calc(100vh - 64px)",
          overflow: zoomMode === "auto" ? "hidden" : "auto",
        }}
      >


<div
  ref={scaledRef}
  style={{
    transform: `scale(${zoom})`,
    transformOrigin: "top left",
    display: "inline-block",
    width: panelRef.current ? panelRef.current.scrollWidth * zoom : "auto",
    height: panelRef.current ? panelRef.current.scrollHeight * zoom : "auto",
  }}
>



          <div style={{ marginTop: 64, padding: 16, width: "fit-content", boxSizing: "border-box" }}>
            <div ref={panelRef} style={dashedPanelBase}>
              <div style={{ position: "absolute", top: 8, left: 16, zIndex: 3 }}>
                <button
                  onClick={addStep}
                  title="Tilføj kolonne"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    border: `2px dashed ${C.brand}`,
                    background: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    padding: 0,
                    color: "black",
                  }}
                >
                  <span style={{ fontSize: 24, lineHeight: "1" }}>+</span>
                </button>
              </div>
<div style={{ position: "absolute", top: 8, right: 16, zIndex: 3 }}>
  <button
    onClick={() => setShowContext(true)}
    title="Kontekst"
    style={{
      background: "transparent",
      border: "none",
      cursor: "pointer",
      padding: 0,
    }}
  >
<svg width="22" height="22" viewBox="0 0 24 24" fill="none">
  <path
    d="M4 3h12l4 4v14H4V3z"
    stroke={contextText ? "green" : "black"}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  />
  <path
    d="M16 3v5h5"
    stroke={contextText ? "green" : "black"}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  />
</svg>

  </button>
</div>


              

              {/* Vandret midterlinje */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: midlineTop,
                  left: 30,
                  right: 30,
                  borderTop: `2px solid ${C.dashed}`,
                  zIndex: 0,
                }}
              />




              <div
                style={{
                  position: "relative",
                  display: "grid",
                  gridTemplateColumns: gridCols,
                  gridTemplateRows: `
                    auto
                    ${ROWS.TIME_H}
                    auto
                    ${ROWS.ASSUMP_H}
                    auto
                    ${ROWS.MID_H}
                    auto
                    ${ROWS.SIGN_H}
                  `,
                  columnGap: GAP,
                  rowGap: 12,
                  width: "100%",
                  boxSizing: "border-box",
                }}
              >
                <div
                  ref={midMarkerRef}
                  style={{
                    gridColumn: "1 / -1",
                    gridRow: "6",
                    alignSelf: "center",
                    height: 0,
                  }}
                />

{/* Lodret streg i spacer mellem Output og Effekter */}
<div
  aria-hidden
  style={{
    gridColumn: String(EFFECT_SPACER_COL),  // tegn i spacer-kolonnen
    gridRow: "1 / -1",
    borderLeft: `2px dashed ${C.dashed}`,
    zIndex: 0,
  }}
/>



                {/* Input */}
                <div style={{ gridColumn: String(INPUT_COL), gridRow: "3", ...label }}>Input</div>
<textarea
  value={doc.input}
  onChange={(e) => setDoc({ ...doc, input: e.target.value })}
  onBlur={() => patch({ input: doc.input })}
  style={{
    ...card(C.brand, { fontWeight: 800, height: INPUT_H }),
    gridColumn: String(INPUT_COL),
    gridRow: "4",
    marginRight: "40px",   // Ekstra afstand til højre
  }}
/>


                {/* Steps */}
                {doc.steps.map((s: Step, i: number) => {
                  const col = STEP_COL_START + i;
                  return (
                    <div key={s.id} style={{ display: "contents" }}>
                      <div style={{ gridColumn: String(col), gridRow: "1", ...label }}>Tid & ansvar</div>
                      <textarea
                        value={s.time}
                        onChange={(e) => {
                          const steps = doc.steps.map((x) => (x.id === s.id ? { ...x, time: e.target.value } : x));
                          setDoc({ ...doc, steps });
                        }}
                        onBlur={() => patch({ steps: doc.steps })}
                        style={{ ...arrowTextarea({ height: ROWS.TIME_H }), gridColumn: String(col), gridRow: "2" }}
                      />

                      <div style={{ gridColumn: String(col), gridRow: "3", ...label }}>Antagelser</div>
                      <textarea
                        value={s.assumption}
                        onChange={(e) => {
                          const steps = doc.steps.map((x) => (x.id === s.id ? { ...x, assumption: e.target.value } : x));
                          setDoc({ ...doc, steps });
                        }}
                        onBlur={() => patch({ steps: doc.steps })}
                        style={{ ...card(C.light1, { height: ROWS.ASSUMP_H }), gridColumn: String(col), gridRow: "4" }}
                      />

                      <div style={{ gridColumn: String(col), gridRow: "5", ...label }}>Trin</div>
                      <textarea
                        value={s.title}
                        onChange={(e) => {
                          const steps = doc.steps.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x));
                          setDoc({ ...doc, steps });
                        }}
                        onBlur={() => patch({ steps: doc.steps })}
                        style={{ ...card(C.brand, { fontWeight: 800, height: ROWS.MID_H }), gridColumn: String(col), gridRow: "6" }}
                      />

                      <div style={{ gridColumn: String(col), gridRow: "7", ...label }}>Tegn</div>
                      <textarea
                        value={s.sign}
                        onChange={(e) => {
                          const steps = doc.steps.map((x) => (x.id === s.id ? { ...x, sign: e.target.value } : x));
                          setDoc({ ...doc, steps });
                        }}
                        onBlur={() => patch({ steps: doc.steps })}
                        style={{ ...card(C.light1, { height: ROWS.SIGN_H }), gridColumn: String(col), gridRow: "8" }}
                      />
                    </div>
                  );
                })}

                {/* Output */}
                <div style={{ gridColumn: String(OUTPUT_COL), gridRow: "1", ...label }}>Tid & ansvar</div>
                <textarea
                  value={doc.outputTime || ""}
                  onChange={(e) => setDoc({ ...doc, outputTime: e.target.value })}
                  onBlur={() => patch({ outputTime: doc.outputTime || "" })}
                  style={{ ...arrowTextarea({ height: ROWS.TIME_H }), gridColumn: String(OUTPUT_COL), gridRow: "2" }}
                />

                <div style={{ gridColumn: String(OUTPUT_COL), gridRow: "3", ...label }}>Antagelser</div>
                <textarea
                  value={doc.outputAssumption}
                  onChange={(e) => setDoc({ ...doc, outputAssumption: e.target.value })}
                  onBlur={() => patch({ outputAssumption: doc.outputAssumption })}
                  style={{ ...card(C.light1, { height: ROWS.ASSUMP_H }), gridColumn: String(OUTPUT_COL), gridRow: "4" }}
                />

                <div style={{ gridColumn: String(OUTPUT_COL), gridRow: "5", ...label }}>Output</div>
                <textarea
                  value={doc.output}
                  onChange={(e) => setDoc({ ...doc, output: e.target.value })}
                  onBlur={() => patch({ output: doc.output })}
                  style={{ ...card(C.brand, { fontWeight: 800, height: ROWS.MID_H }), gridColumn: String(OUTPUT_COL), gridRow: "6" }}
                />

                <div style={{ gridColumn: String(OUTPUT_COL), gridRow: "7", ...label }}>Tegn</div>
                <textarea
                  value={doc.outputSign}
                  onChange={(e) => setDoc({ ...doc, outputSign: e.target.value })}
                  onBlur={() => patch({ outputSign: doc.outputSign })}
                  style={{ ...card(C.light1, { height: ROWS.SIGN_H }), gridColumn: String(OUTPUT_COL), gridRow: "8" }}
                />

                {/* Effekter */}
                <div style={{ gridColumn: String(EFFECT_SHORT_COL), gridRow: "5", ...label }}>Kortsigtet effekt</div>
                <textarea
                  value={doc.effects.short}
                  onChange={(e) => setDoc({ ...doc, effects: { ...doc.effects, short: e.target.value } })}
                  onBlur={() => patch({ effects: doc.effects })}
                  style={{ ...card("#fff", { height: EFFECT_H }), gridColumn: String(EFFECT_SHORT_COL), gridRow: "6" }}
                />

                <div style={{ gridColumn: String(EFFECT_LONG_COL), gridRow: "5", ...label }}>Langsigtet effekt</div>
                <textarea
                  value={doc.effects.long}
                  onChange={(e) => setDoc({ ...doc, effects: { ...doc.effects, long: e.target.value } })}
                  onBlur={() => patch({ effects: doc.effects })}
                  style={{ ...card("#fff", { height: EFFECT_H }), gridColumn: String(EFFECT_LONG_COL), gridRow: "6" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Zoom-kontrol */}
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
            setZoom((z) => Math.max(z - 0.1, 0.5));
          }}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            fontSize: 18,
            color: "black",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          }}
        >
          –
        </button>

        <button
          onClick={() => {
            setZoomMode("manual");
            setZoom(1);
          }}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            fontSize: 14,
            color: "black",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            minWidth: 64,
          }}
        >
          {Math.round(zoom * 100)}%
        </button>

        <button
          onClick={() => {
            setZoomMode("manual");
            setZoom((z) => Math.min(z + 0.1, 2));
          }}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            fontSize: 18,
            color: "black",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          }}
        >
          +
        </button>

        <button
          onClick={() => {
            setZoomMode("auto");
            requestAnimationFrame(() => {
              measureMidline();
              autoFit();
            });
          }}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            fontSize: 14,
            color: "black",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          }}
        >
          Auto
        </button>
      </div>

{showContext && (
  <div
style={{
  position: "absolute",
  top: "9%", // åbner lige under ikonet
  right: "2%",
  background: "#fff",
  padding: 20,
  borderRadius: 12,
  border: "1px solid #ccc",
  minWidth: "600px",   // svarer ca. til to effektkolonner
  height: "20vh",  // svarer ca. til rækker 1-4
  display: "flex",
  flexDirection: "column",
  zIndex: 2000,
}}

  >
    <textarea
      placeholder="Kontekst"
      value={contextText}
      onChange={(e) => setContextText(e.target.value)}
      onBlur={() => patch({ context: contextText })}
      style={{
        ...card("#fff", { height: "100%" }),
        flex: 1,
        resize: "none",
      }}
    />
    <button
      onClick={() => setShowContext(false)}
      style={{
        marginTop: 12,
        padding: "8px 16px",
        alignSelf: "flex-end",
        borderRadius: 8,
        border: `1px solid ${C.slate}`,
        background: "#fff",
        color: "black",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      Luk
    </button>
  </div>
)}




    </div>
  );
}
