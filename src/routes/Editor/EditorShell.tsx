import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Topbar from "../../components/Topbar";
import { useAuth } from "../../context/AuthContext";
import { saveProject } from "../../utils/save";
import { db } from "../../firebase";
import { doc as fsDoc, getDoc } from "firebase/firestore";
import CanvasPanel from "./CanvasPanel";
import type { Doc } from "../../types/editor";

const C = {
  brand: "#03424f",
  brandDark: "#023641",
  light1: "#f8fafc",
  dashed: "#94a3b8",
  edge: "#cbd5e1",
};
const RADIUS = 14;
const MIN_COL_W = 260;
const GAP = 16;
const ROWS = {
  TIME_H: "5vh",
  ASSUMP_H: "16vh",
  MID_H: "14vh",
  SIGN_H: "30vh",
};
const INPUT_H = "50vh";
const EFFECT_H = "20vh";

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

const newStep = (idx: number) => ({
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

export default function EditorShell() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [doc, setDoc] = useState<Doc | null>(null);

  const [zoom, setZoom] = useState(1);
  const [zoomMode, setZoomMode] = useState<"auto" | "manual">("auto");

  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // VIGTIG: midMarkerRef skal være DIV (ikke textarea)
  const midMarkerRef = useRef<HTMLDivElement | null>(null);
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
          ref={panelRef}
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            display: "inline-block",
            marginTop: 64,
            padding: 16,
          }}
        >
          <CanvasPanel
            doc={doc}
            patch={patch}
            theme={{ C, RADIUS, MIN_COL_W, GAP, ROWS, INPUT_H, EFFECT_H }}
            midMarkerRef={midMarkerRef}
            midlineTop={midlineTop}
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
        <button onClick={() => { setZoomMode("manual"); setZoom((z) => Math.max(z - 0.1, 0.3)); }} style={zoomBtn}>–</button>
        <button onClick={() => { setZoomMode("manual"); setZoom(1); }} style={zoomBtn}>
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={() => { setZoomMode("manual"); setZoom((z) => Math.min(z + 0.1, 2)); }} style={zoomBtn}>+</button>
        <button onClick={() => { setZoomMode("auto"); requestAnimationFrame(() => autoFit()); }} style={zoomBtn}>Auto</button>
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
  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
};
