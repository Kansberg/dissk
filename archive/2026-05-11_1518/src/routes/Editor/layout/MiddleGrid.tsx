import type { Doc } from "../../../types/editor";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom"; // ← NY
import ColumnToolbarOverlay from "./ColumnToolbarOverlay";
import { Trash2, ArrowLeft, ArrowRight, ArrowLeftRight, RefreshCcw } from "lucide-react";
import { useUndo } from "../../../context/UndoContext";
import CustomQuill from "../../../components/CustomQuill";




type Props = {
  doc: Doc;
  patch: (partial: Partial<Doc>) => void;
  patchStepField: (stepId: string, field: keyof Doc["steps"][0], value: string) => void; // 👈 tilføj denne
  gridStartCol: number;
  outputCol: number;
  theme: { C: any; RADIUS: number };
  midMarkerRef: React.RefObject<HTMLTextAreaElement>;
};


export default function MiddleGrid({
  doc,
  patch,
   patchStepField,
  gridStartCol,
  outputCol,
  theme,
}: Props) {
  const { RADIUS } = theme;
  const { addToHistory } = useUndo();

const hideTimeout = useRef<NodeJS.Timeout | null>(null);

const timeRefById = useRef<Record<string, HTMLElement | null>>({});
const assumpRefById = useRef<Record<string, HTMLElement | null>>({});
const midRefById = useRef<Record<string, HTMLElement | null>>({});
const signRefById = useRef<Record<string, HTMLElement | null>>({});
const colAnchorRefById = useRef<Record<string, HTMLDivElement | null>>({});

// ▼ Symbol-rail state
const [showSymbolPickerFor, setShowSymbolPickerFor] = useState<string | null>(null);
const symbolCellRefById = useRef<Record<string, HTMLDivElement | null>>({}); // ← NY

// 👇 Afled label for trin-rækken
const stepLabelText = doc.stepLabel === "tema" ? "Tema" : "Trin";

// ▼ Helpers til at læse/gemme symbol pr. step i doc (uden TS-støj)
type StepSymbol = "left" | "right" | "both" | "cycle";

// Brug stepSymbols råt: både numeriske og ikke-numeriske keys er gyldige step.id’er
const symbolsMG = ((doc as any).stepSymbols || {}) as Record<string, StepSymbol>;



// 2) Læs/skriv KUN via id
const getStepSymbol = (id: string): StepSymbol | null =>
  (symbolsMG[id] as StepSymbol) || null;

const setStepSymbol = (stepId: string, sym: StepSymbol | null) => {
  const raw = ((doc as any).stepSymbols || {}) as Record<string, StepSymbol>;
  const next: Record<string, StepSymbol> = { ...raw };        // ← byg direkte på rå map
  const key = String(stepId);
  if (sym) next[key] = sym;
  else delete next[key];

  addToHistory(structuredClone(doc));
  patch({ stepSymbols: next } as any);

  requestAnimationFrame(() => {
    window.dispatchEvent(new Event("force-toolbar-update"));
  });
};







// OUTPUT: direkte refs til contentEditable-bokse
const outputTimeRef   = useRef<HTMLDivElement | null>(null);
const outputAssumpRef = useRef<HTMLDivElement | null>(null);
const outputMidRef    = useRef<HTMLDivElement | null>(null);
const outputSignRef   = useRef<HTMLDivElement | null>(null);

// ✅ Lokalt “hukommelse” for baggrundsfarve pr. kolonne (Tid & ansvar)
const timeBgRef = useRef<Record<string, string>>({});
const assumpBgRef = useRef<Record<string, string>>({});
const midBgRef = useRef<Record<string, string>>({});
const signBgRef = useRef<Record<string, string>>({});

const outputTimeBgRef = useRef<Record<string, string>>({});
const outputAssumpBgRef = useRef<Record<string, string>>({});
const outputMidBgRef = useRef<Record<string, string>>({});
const outputSignBgRef = useRef<Record<string, string>>({});


  const [activeCol, setActiveCol] = useState<string | null>(null);
  const [draggingCol, setDraggingCol] = useState<string | null>(null);
  const dragOverCol = useRef<string | null>(null);

  const [activeCell, setActiveCell] = useState<{
    colId: string;
    type: "time" | "assump" | "sign" | "mid" | null;
  } | null>(null);


function renderSymbolPickerPortal(stepId: string) {
  const anchor = symbolCellRefById.current[stepId];
  if (!anchor) return null;

  const rect = anchor.getBoundingClientRect();
  // placer værktøjslinjen til højre for symbolet og top-justeret
  const top = rect.top;         // øverste kant af symbolet
  const left = rect.right + 6;  // lidt luft til højre

  const cur = getStepSymbol(stepId);
  const options = [
    { key: "left"  as const, title: "Pil venstre",    node: <ArrowLeft      size={18} color="#03424f" /> },
    { key: "right" as const, title: "Pil højre",      node: <ArrowRight     size={18} color="#03424f" /> },
    { key: "both"  as const, title: "Pil begge veje", node: <ArrowLeftRight size={18} color="#03424f" /> },
    { key: "cycle" as const, title: "Pile i cirkel",  node: <RefreshCcw     size={18} color="#03424f" /> },
  ].filter(o => o.key !== cur); // vis KUN de øvrige (ikke det valgte)

  const picker = (
    <div
      data-symbol-picker
      style={{
        position: "fixed",
        top,
        left,
        zIndex: 2147483647,    // lig altid øverst
        pointerEvents: "auto",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Selve boksen omkring ikonerne */}
      <div
        style={{
          display: "flex",
          flexDirection: "column", // VERTIKAL
          width: "20px",
          alignItems: "center",
          gap: 6,
          background: "#ffffff",   // ← baggrund
          border: "0px solid transparent", // ← border
          borderRadius: 10,        // ← rundede hjørner
          padding: 8,              // ← padding
          boxShadow: "0 12px 28px rgba(0,0,0,0.25)", // ← skygge
        }}
      >
        {options.map(o => (
          <button
            key={o.key}
            title={o.title}
            onClick={() => {
              setStepSymbol(stepId, o.key);
              // behold åben, så man kan klikke videre – eller luk, hvis du ønsker
              window.dispatchEvent(new Event("force-toolbar-update"));
            }}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
              lineHeight: 0,
            }}
          >
            {o.node}
          </button>
        ))}

        {/* Skraldespand nederst: fjerner symbol-kolonnen */}
<button
  title="Fjern symbol-kolonne"
  onClick={() => handleRemoveSymbol(stepId)}
  style={{
    background: "transparent",
    border: "none",
    cursor: "pointer",
    paddingTop: 6,
    lineHeight: 0,

    // 👇 VIGTIGT: fjern focus/active-rammen
    outline: "none",
    boxShadow: "none",
  }}
  onMouseDown={(e) => {
    // 👇 forhindrer focus i at blive sat
    e.preventDefault();
  }}
>
  <Trash2 size={16} color="#7f1d1d" />
</button>


      </div>
    </div>
  );

  return createPortal(picker, document.body);
}



  // Marker skjulte celler (persistent)
// --- GLOBAL VISNING VIA TOPBAR ---
const isHidden = (step: any, type: "time" | "assump" | "sign") => {
  if (type === "time" && !doc.showTidAnsvar) return true;
  if (type === "assump" && !doc.showAntagelser) return true;
  return !!step?.hidden?.[type];
};

const isOutputHidden = (d: any, type: "time" | "assump" | "sign") => {
  if (type === "time" && !doc.showTidAnsvar) return true;
  if (type === "assump" && !doc.showAntagelser) return true;
  return !!d?.outputHidden?.[type];
};


// ➕ Tilføj kolonne efter
const handleAddAfter = (afterId: string) => {
  const idx = doc.steps.findIndex((s) => s.id === afterId);
  if (idx === -1) return;

  // Gem tilstand FØR ændringen
  addToHistory(structuredClone(doc));

  const newStep = {
    id: crypto.randomUUID(),
    title: "",
    time: "",
    assumption: "",
    sign: "",
  };

  const updatedSteps = [...doc.steps];
  updatedSteps.splice(idx + 1, 0, newStep);

  // Udfør ændringen
  patch({ steps: updatedSteps });
  setActiveCol(newStep.id);
};

// Fjern symbol for en kolonne + gem + reflow (patch fjerner rigtigt i DB)
const handleRemoveSymbol = (stepId: string) => {
  const raw = (doc as any).stepSymbols;
  const curr: Record<string, "left" | "right" | "both" | "cycle"> =
    raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};

  const next: Record<string, "left" | "right" | "both" | "cycle"> = { ...curr };
  delete next[stepId]; // fjern symbolet

  // undo-snapshot
  addToHistory(structuredClone(doc));

  // 👇 Hvis ingen symboler tilbage → nulstil feltet helt
const hasSymbols = Object.keys(next).length > 0;
const payload = hasSymbols ? next : {};   // 👈 aldrig null

patch({ stepSymbols: payload } as any);


  // luk picker og tving et lille reflow
  setShowSymbolPickerFor(null);
  window.dispatchEvent(new Event("force-toolbar-update"));
};




// 🗑 Fjern kolonne
const handleRemove = (id: string) => {
  if (doc.steps.length <= 1) return;

  const confirmed = window.confirm("Er du sikker på, at du vil slette denne kolonne?");
  if (!confirmed) return;

  // Gem tilstand FØR ændringen
  addToHistory(structuredClone(doc));

  const updatedSteps = doc.steps.filter((s) => s.id !== id);
  patch({ steps: updatedSteps });

  if (activeCol === id) setActiveCol(updatedSteps[0]?.id || null);
};

// ❌ Slet celleindhold
const handleDeleteCell = (
  type: "time" | "assump" | "sign",
  colId: string,
  isOutput = false
) => {
  if (!window.confirm("Vil du slette dette felt permanent?")) return;

  // Gem tilstand FØR ændringen
  addToHistory(structuredClone(doc));

  if (!isOutput) {
    const updatedSteps = doc.steps.map((s: any) => {
      if (s.id !== colId) return s;
      const newStep = { ...s };
      if (type === "time") delete newStep.time;
      if (type === "assump") delete newStep.assumption;
      if (type === "sign") delete newStep.sign;
      newStep.hidden = { ...(s.hidden || {}), [type]: true };
      return newStep;
    });

    patch({ steps: updatedSteps });
  } else {
    const key =
      type === "time"
        ? "outputTime"
        : type === "assump"
        ? "outputAssumption"
        : "outputSign";

    patch({
      [key]: "",
      outputHidden: { ...(doc.outputHidden || {}), [type]: true },
    });
  }

  setActiveCell(null);
};

// Hold output-felter i sync ved load / reload – men rør ikke caret
useEffect(() => {
  if (outputTimeRef.current) {
    const html = doc.outputTime || "";
    if (outputTimeRef.current.innerHTML !== html) {
      outputTimeRef.current.innerHTML = html;
    }
  }
}, [doc.outputTime]);

useEffect(() => {
  if (outputAssumpRef.current) {
    const html = doc.outputAssumption || "";
    if (outputAssumpRef.current.innerHTML !== html) {
      outputAssumpRef.current.innerHTML = html;
    }
  }
}, [doc.outputAssumption]);

useEffect(() => {
  if (outputMidRef.current) {
    const html = doc.output || "";
    if (outputMidRef.current.innerHTML !== html) {
      outputMidRef.current.innerHTML = html;
    }
  }
}, [doc.output]);

useEffect(() => {
  if (outputSignRef.current) {
    const html = doc.outputSign || "";
    if (outputSignRef.current.innerHTML !== html) {
      outputSignRef.current.innerHTML = html;
    }
  }
}, [doc.outputSign]);



  const handleDragStart = (id: string, e?: React.DragEvent) => {
    setDraggingCol(id);
    if (e?.dataTransfer) {
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
    }
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    dragOverCol.current = id;
  };

const handleDrop = () => {
  const fromId = draggingCol;
  const toId = dragOverCol.current;
  setDraggingCol(null);
  dragOverCol.current = null;
  if (!fromId || !toId || fromId === toId) return;

  const oldIdx = doc.steps.findIndex((s) => s.id === fromId);
  const newIdx = doc.steps.findIndex((s) => s.id === toId);
  if (oldIdx === -1 || newIdx === -1) return;

  const reordered = [...doc.steps];
  const [moved] = reordered.splice(oldIdx, 1);
  reordered.splice(newIdx, 0, moved);

  const next = { ...doc, steps: reordered };
  addToHistory(next);
  patch({ steps: reordered });

  setActiveCol(moved.id);
  window.dispatchEvent(new Event("force-toolbar-update"));
};



useEffect(() => {
  const handleClickOutside = (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    // Ignorer klik inde i toolbaren
    if (target.closest(".column-toolbar-overlay")) return;

    // Ignorer klik inde i symbol-picker (portalen)
    if (target.closest("[data-symbol-picker]")) return;

    // Luk symbol-picker hvis åben
    if (showSymbolPickerFor) setShowSymbolPickerFor(null);

    // Klik udenfor grid → nulstil aktiv celle
    const gridEl = target.closest("[data-grid-container]");
    if (!gridEl) setActiveCell(null);
  };

  document.addEventListener("mousedown", handleClickOutside);
  return () => document.removeEventListener("mousedown", handleClickOutside);
}, [showSymbolPickerFor]);






const Label = (text: string, col: number, row: string) => (
  <div
    style={{
      gridColumn: String(col),
      gridRow: row,
      fontWeight: 800,
      color: "#000",
      fontSize: 14,
      fontFamily: "Arial, sans-serif",
      pointerEvents: "none", // 👈 gør labelen “gennemsigtig” for drag/drop
    }}
  >
    {text}
  </div>
);


const arrowStyle = (col: number, row: string): React.CSSProperties => ({
  gridColumn: String(col),
  gridRow: row,
  background: "#e5eff5",
  color: "#000",
  border: "none",
  borderRadius: 0, // 👈 fjern afrunding
  padding: 12,
  width: "100%",
  fontFamily: "Arial, sans-serif",
  fontWeight: 600,
  fontSize: 12,
  lineHeight: 1.3,
  resize: "none",
  overflow: "visible",
  boxSizing: "border-box",
  clipPath: "polygon(0 0, 92% 0, 100% 50%, 92% 100%, 0 100%)",
  boxShadow: "2px 3px 6px rgba(0,0,0,0.25)", // mere naturlig skygge
});


  const cardStyle = (
    col: number,
    row: string,
    bg: string,
    bold = false
  ): React.CSSProperties => ({
    gridColumn: String(col),
    gridRow: row,
    background: bg,
    color: "#000",
    border: "1px solid #e5e7eb",
    borderRadius: RADIUS,
    padding: 12,
    width: "100%",
    fontFamily: "Arial, sans-serif",
    fontWeight: bold ? 800 : 500,
    fontSize: 12,
    lineHeight: 1.35,
    resize: "none",
    overflow: "hidden",
    boxSizing: "border-box",
    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
  });

  const TrashIconInGridCell = ({
  show,
  col,
  row,
  onClick,
}: {
  show: boolean;
  col: number;
  row: string;
  onClick: () => void;
}) =>
  show ? (
    <button
      type="button"
      // Fyr sletningen før fokus ændres, og undgå at knappen "stjæler" fokus
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      title="Slet celle"
      style={{
        gridColumn: String(col),
        gridRow: row,
        justifySelf: "end",
        alignSelf: "start",
        marginTop: 0,
        marginRight: 2,
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
        zIndex: 5,
      }}
    >
      <Trash2 size={14} color="#000" />
    </button>
  ) : null;

  return (
    <>
      {doc.steps.map((s, i) => {
// antal symbol-kolonner før denne step
const symbolOffsetBefore = (() => {
  let n = 0;
  for (let k = 0; k < i; k++) {
    const sid = doc.steps[k].id;
    if (symbolsMG[sid]) n += 1;
  }
  return n;
})();


const col = gridStartCol + i + symbolOffsetBefore;
        const isDragging = draggingCol === s.id;
        const isActive = activeCol === s.id;



        return (
          <div
            key={s.id}
            style={{
              display: "contents",
              opacity: isDragging ? 0.5 : 1,
              transition: "opacity 0.2s ease",
            }}
            onMouseEnter={() => {
              if (hideTimeout.current) {
                clearTimeout(hideTimeout.current);
                hideTimeout.current = null;
              }
              setActiveCol(s.id);
            }}
            onMouseLeave={() => {
              hideTimeout.current = setTimeout(
                () => setActiveCol(null),
                300
              );
            }}
          >
{/* usynligt anker øverst i kolonnen */}
<div
  ref={(el: HTMLDivElement | null) => {
    colAnchorRefById.current[s.id] = el;
  }}
  data-col-anchor
  data-colid={s.id} // 👈 HER
  style={{
    gridColumn: String(col),
    gridRow: "1",
    position: "relative",
    width: 1,
    height: 1,
    pointerEvents: "none",
    zIndex: 1,
  }}
/>


            
       {/* Tid & ansvar */}
{!isHidden(s, "time") && (
  <>
    {Label("Tid & ansvar", col, "1")}

    <div
      style={{
        gridColumn: String(col),
        gridRow: "1",
        position: "relative",
        zIndex: 0,
      }}
      onDragOver={(e) => handleDragOver(e, s.id)}
      onDrop={() => handleDrop()}
    />

    <TrashIconInGridCell
      show={activeCell?.colId === s.id && activeCell?.type === "time"}
      col={col}
      row="1"
      onClick={() => handleDeleteCell("time", s.id)}
    />

    <CustomQuill
      key={`time-${s.id}`}
      fieldType="time"
      onRefReady={(el) => {
        timeRefById.current[s.id] = el as HTMLElement | null;

        // Bind præcis én blur-listener pr. editor (commit kun ved blur)
        if (el && !(el as any).__timeBlurBound) {
          (el as any).__timeBlurBound = true;
          el.addEventListener(
            "focusout",
            () => {
              // Læs nyeste HTML direkte fra DOM, så vi ikke overskriver med tomt
              const root = timeRefById.current[s.id] as HTMLElement | null;
              const html =
                root?.querySelector(".ql-editor")?.innerHTML ?? "";
              // vent 1 frame så evt. lokale updates er færdige
              requestAnimationFrame(() => {
                addToHistory({ ...doc, steps: (doc.steps || []).map(st => st.id === s.id ? { ...st, time: html } : st) });
                patchStepField(s.id, "time", html);
              });
            },
            true
          );
        }
      }}
      value={s.time || ""}
      onChange={(html: string) => {
        // Opdater kun lokalt (historik), ingen patch her
        const next = { ...doc };
        const stepIndex = next.steps.findIndex((st) => st.id === s.id);
        if (stepIndex === -1) return;

        if ((next.steps[stepIndex].time || "") === html) return;

        next.steps[stepIndex].time = html;
        addToHistory(next); // snapshot FØR ændring

        // Planlæg auto-commit efter 10 min inaktivitet (læser altid seneste DOM)
        clearTimeout((window as any)[`commitTimeout_${s.id}_time`]);
        (window as any)[`commitTimeout_${s.id}_time`] = setTimeout(() => {
          const root = timeRefById.current[s.id] as HTMLElement | null;
          const latestHtml =
            root?.querySelector(".ql-editor")?.innerHTML ?? "";
          addToHistory({ ...doc, steps: (doc.steps || []).map(st => st.id === s.id ? { ...st, time: latestHtml } : st) });
          patchStepField(s.id, "time", latestHtml);
        }, 10 * 60 * 1000);
      }}
      onFocus={() => setActiveCell({ colId: s.id, type: "time" })}
      onBoxColorChange={(color: string) => {
        const currentColor = doc.styles?.time?.[s.id]?.bg || "#e5eff5";
        if (color === currentColor) return;

        // ✅ Husk valgt farve lokalt pr. kolonne
        timeBgRef.current[s.id] = color;

        addToHistory(doc); // snapshot FØR farveskift
        patch({
          styles: {
            ...(doc.styles || {}),
            time: {
              ...(doc.styles?.time || {}),
              [s.id]: { bg: color },
            },
          },
        });
      }}
      onDragOver={(e) =>
        handleDragOver(e as unknown as React.DragEvent, s.id)
      }
      onDrop={() => handleDrop()}
      variant="bare"
      placeholder="Tid & ansvar"
      style={{
        ...arrowStyle(col, "2"),
        padding: 0,
        margin: 0,
        // ✅ Brug lokal farve hvis den findes, ellers styles/doc, ellers default
        background:
          timeBgRef.current[s.id] ??
          doc.styles?.time?.[s.id]?.bg ??
          "#e5eff5",
        overflow: "visible",
        zIndex: 9999,
      }}
    />
  </>
)}

{/* Antagelser */}
{!isHidden(s, "assump") && (
  <>
    {Label("Antagelser", col, "3")}

    <div
      style={{
        gridColumn: String(col),
        gridRow: "3",
        position: "relative",
        zIndex: 0,
      }}
      onDragOver={(e) => handleDragOver(e, s.id)}
      onDrop={() => handleDrop()}
    />

    <TrashIconInGridCell
      show={activeCell?.colId === s.id && activeCell?.type === "assump"}
      col={col}
      row="3"
      onClick={() => handleDeleteCell("assump", s.id)}
    />

    <CustomQuill
      key={`assump-${s.id}`}
      fieldType="assump"
      onRefReady={(el) => {
        assumpRefById.current[s.id] = el as HTMLElement | null;

        // Bind præcis én blur-listener pr. editor (commit kun ved blur)
        if (el && !(el as any).__assumpBlurBound) {
          (el as any).__assumpBlurBound = true;
          el.addEventListener(
            "focusout",
            () => {
              // Læs nyeste HTML direkte fra DOM, så vi ikke overskriver med tomt
              const root = assumpRefById.current[s.id] as HTMLElement | null;
              const html =
                root?.querySelector(".ql-editor")?.innerHTML ?? "";
              // vent 1 frame så evt. lokale updates er færdige
              requestAnimationFrame(() => {
                addToHistory({
                  ...doc,
                  steps: (doc.steps || []).map((st) =>
                    st.id === s.id ? { ...st, assumption: html } : st
                  ),
                });
                patchStepField(s.id, "assumption", html);
              });
            },
            true
          );
        }
      }}
      value={s.assumption || ""}
      onChange={(html: string) => {
        // Opdater kun lokalt (historik), ingen patch her
        const next = { ...doc };
        const stepIndex = next.steps.findIndex((st) => st.id === s.id);
        if (stepIndex === -1) return;

        if ((next.steps[stepIndex].assumption || "") === html) return;

        next.steps[stepIndex].assumption = html;
        addToHistory(next);

        // Planlæg auto-commit efter 10 min inaktivitet (læser altid seneste DOM)
        clearTimeout((window as any)[`commitTimeout_${s.id}_assump`]);
        (window as any)[`commitTimeout_${s.id}_assump`] = setTimeout(() => {
          const root = assumpRefById.current[s.id] as HTMLElement | null;
          const latestHtml =
            root?.querySelector(".ql-editor")?.innerHTML ?? "";
          addToHistory({
            ...doc,
            steps: (doc.steps || []).map((st) =>
              st.id === s.id ? { ...st, assumption: latestHtml } : st
            ),
          });
          patchStepField(s.id, "assumption", latestHtml);
        }, 10 * 60 * 1000);
      }}
      onFocus={() => setActiveCell({ colId: s.id, type: "assump" })}
      onBoxColorChange={(color: string) => {
        const currentColor = doc.styles?.assump?.[s.id]?.bg || "#f8fafc";
        if (color === currentColor) return;

        // ⭐ Gem valgt farve lokalt (så den ikke hopper tilbage)
        assumpBgRef.current[s.id] = color;

        addToHistory(doc);
        patch({
          styles: {
            ...(doc.styles || {}),
            assump: {
              ...(doc.styles?.assump || {}),
              [s.id]: { bg: color },
            },
          },
        });
      }}
      onDragOver={(e) =>
        handleDragOver(e as unknown as React.DragEvent, s.id)
      }
      onDrop={() => handleDrop()}
      variant="bare"
      placeholder="Antagelser"
      style={{
        ...cardStyle(col, "4", ""),
        // ⭐ Brug lokal farve først → ellers db → ellers default
        background:
          assumpBgRef.current[s.id] ??
          doc.styles?.assump?.[s.id]?.bg ??
          "#f8fafc",
        border: "1px solid #e5e7eb",
        borderRadius: RADIUS,
        boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
        padding: 8,
      }}
    />
  </>
)}


{/* Trin (kan ikke slettes) */}
{Label(stepLabelText, col, "5")}

<CustomQuill
  key={`mid-${s.id}`}
  fieldType="mid"
  onRefReady={(el) => {
    midRefById.current[s.id] = el as HTMLElement | null;

    // Bind præcis én blur-listener pr. editor (commit kun ved blur)
    if (el && !(el as any).__midBlurBound) {
      (el as any).__midBlurBound = true;
      el.addEventListener(
        "focusout",
        () => {
          // Læs nyeste HTML direkte fra DOM, så vi ikke overskriver med tomt
          const root = midRefById.current[s.id] as HTMLElement | null;
          const html = root?.querySelector(".ql-editor")?.innerHTML ?? "";
          // vent 1 frame så evt. lokale updates er færdige
          requestAnimationFrame(() => {
            addToHistory({
              ...doc,
              steps: (doc.steps || []).map((st) =>
                st.id === s.id ? { ...st, title: html } : st
              ),
            });
            patchStepField(s.id, "title", html);
          });
        },
        true
      );
    }
  }}
  value={s.title || ""}
  onChange={(html: string) => {
    // Opdater kun lokalt (historik), ingen patch her
    const next = { ...doc };
    const stepIndex = next.steps.findIndex((st) => st.id === s.id);
    if (stepIndex === -1) return;

    if ((next.steps[stepIndex].title || "") === html) return;

    next.steps[stepIndex].title = html;
    addToHistory(next);

    // Planlæg auto-commit efter 10 min inaktivitet (læser altid seneste DOM)
    clearTimeout((window as any)[`commitTimeout_${s.id}_mid`]);
    (window as any)[`commitTimeout_${s.id}_mid`] = setTimeout(() => {
      const root = midRefById.current[s.id] as HTMLElement | null;
      const latestHtml = root?.querySelector(".ql-editor")?.innerHTML ?? "";
      addToHistory({
        ...doc,
        steps: (doc.steps || []).map((st) =>
          st.id === s.id ? { ...st, title: latestHtml } : st
        ),
      });
      patchStepField(s.id, "title", latestHtml);
    }, 10 * 60 * 1000);
  }}
  onFocus={() => setActiveCell({ colId: s.id, type: "mid" })}

  onBoxColorChange={(color: string) => {
    const currentColor = doc.styles?.mid?.[s.id]?.bg || "#e0f2fe";
    if (color === currentColor) return;

    // 💚 lokal farve-hukommelse for TRIN
    midBgRef.current[s.id] = color;

    addToHistory(doc);
    patch({
      styles: {
        ...(doc.styles || {}),
        mid: {
          ...(doc.styles?.mid || {}),
          [s.id]: { bg: color },
        },
      },
    });
  }}

  onDragOver={(e) =>
    handleDragOver(e as unknown as React.DragEvent, s.id)
  }
  onDrop={() => handleDrop()}
  variant="bare"
  placeholder={stepLabelText}
  style={{
    ...cardStyle(col, "6", ""),
    // 💚 brug lokal farve → ellers db → ellers standard
    background:
      midBgRef.current[s.id] ??
      doc.styles?.mid?.[s.id]?.bg ??
      "#e0f2fe",
    border: "1px solid #e5e7eb",
    borderRadius: RADIUS,
    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
    padding: 8,
  }}
/>


{/* --- SYMBOL-KOLONNE EFTER DETTE STEP (mellem kolonner) --- */}
{getStepSymbol(s.id) && (
  <div
    ref={(el: HTMLDivElement | null) => {
      symbolCellRefById.current[s.id] = el;
    }}
    style={{
      gridColumn: String(col+1),
      gridRow: "6",
      alignSelf: "center",
      justifySelf: "center",
      position: "relative",
      zIndex: 2147483600,
      pointerEvents: "auto",
      cursor: "pointer",                // 👈 HÅND-CURSOR
      transition: "transform 120ms ease, opacity 120ms ease",
    }}
    title="Symbol"
    role="button"                       // ♿︎ bedre a11y
    tabIndex={0}                        // ♿︎ fokusérbar
    aria-label="Vælg symbol"
    onKeyDown={(e) => {                 // ♿︎ Enter/Space klikker
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setShowSymbolPickerFor((v) => (v === s.id ? null : s.id));
      }
    }}
    onMouseEnter={(e) => {
      (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
    }}
    onClick={(e) => {
      e.stopPropagation();
      setShowSymbolPickerFor((v) => (v === s.id ? null : s.id));
    }}
  >
    <div style={{ lineHeight: 0 }}>
      {(() => {
        const cur = getStepSymbol(s.id);
        if (cur === "left")  return <ArrowLeft      size={20} strokeWidth={2.4} color="#03424f" />;
        if (cur === "right") return <ArrowRight     size={20} strokeWidth={2.4} color="#03424f" />;
        if (cur === "both")  return <ArrowLeftRight size={20} strokeWidth={2.4} color="#03424f" />;
        return <RefreshCcw size={20} strokeWidth={2.4} color="#03424f" />;
      })()}
    </div>

    {showSymbolPickerFor === s.id && renderSymbolPickerPortal(s.id)}
  </div>
)}



{/* Tegn */}
{!isHidden(s, "sign") && (
  <>
    {Label("Tegn", col, "7")}

    <TrashIconInGridCell
      show={activeCell?.colId === s.id && activeCell?.type === "sign"}
      col={col}
      row="7"
      onClick={() => handleDeleteCell("sign", s.id)}
    />

    <CustomQuill
      key={`sign-${s.id}`}
      fieldType="sign"
      onRefReady={(el) => {
        signRefById.current[s.id] = el as HTMLElement | null;

        // Bind præcis én blur-listener pr. editor (commit kun ved blur)
        if (el && !(el as any).__signBlurBound) {
          (el as any).__signBlurBound = true;
          el.addEventListener(
            "focusout",
            () => {
              // Læs nyeste HTML direkte fra DOM, så vi ikke overskriver med tomt
              const root = signRefById.current[s.id] as HTMLElement | null;
              const html = root?.querySelector(".ql-editor")?.innerHTML ?? "";
              // vent 1 frame så evt. lokale updates er færdige
              requestAnimationFrame(() => {
                addToHistory({
                  ...doc,
                  steps: (doc.steps || []).map((st) =>
                    st.id === s.id ? { ...st, sign: html } : st
                  ),
                });
                patchStepField(s.id, "sign", html);
              });
            },
            true
          );
        }
      }}
      value={s.sign || ""}
      onChange={(html: string) => {
        // Opdater kun lokalt (historik), ingen patch her
        const next = { ...doc };
        const stepIndex = next.steps.findIndex((st) => st.id === s.id);
        if (stepIndex === -1) return;

        if ((next.steps[stepIndex].sign || "") === html) return;

        next.steps[stepIndex].sign = html;
        addToHistory(next);

        // Planlæg auto-commit efter 10 min inaktivitet (læser altid seneste DOM)
        clearTimeout((window as any)[`commitTimeout_${s.id}_sign`]);
        (window as any)[`commitTimeout_${s.id}_sign`] = setTimeout(() => {
          const root = signRefById.current[s.id] as HTMLElement | null;
          const latestHtml = root?.querySelector(".ql-editor")?.innerHTML ?? "";
          addToHistory({
            ...doc,
            steps: (doc.steps || []).map((st) =>
              st.id === s.id ? { ...st, sign: latestHtml } : st
            ),
          });
          patchStepField(s.id, "sign", latestHtml);
        }, 10 * 60 * 1000);
      }}
      onFocus={() => setActiveCell({ colId: s.id, type: "sign" })}

      onBoxColorChange={(color: string) => {
        const currentColor = doc.styles?.sign?.[s.id]?.bg || "#f8fafc";
        if (color === currentColor) return;

        // 🔴 lokal farve-hukommelse for TEGN
        signBgRef.current[s.id] = color;

        addToHistory(doc);
        patch({
          styles: {
            ...(doc.styles || {}),
            sign: {
              ...(doc.styles?.sign || {}),
              [s.id]: { bg: color },
            },
          },
        });
      }}

      onDragOver={(e) =>
        handleDragOver(e as unknown as React.DragEvent, s.id)
      }
      onDrop={() => handleDrop()}
      variant="bare"
      placeholder="Tegn"
      style={{
        ...cardStyle(col, "8", ""),
        // 🔴 brug lokal farve → ellers db → ellers default
        background:
          signBgRef.current[s.id] ??
          doc.styles?.sign?.[s.id]?.bg ??
          "#f8fafc",
        border: "1px solid #e5e7eb",
        borderRadius: RADIUS,
        boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
        padding: 8,
      }}
    />
  </>
)}




{isActive && (
  <ColumnToolbarOverlay
    targetRef={(() => {
      // vælg den første *synlige* kandidat
      const isVisible = (el: HTMLElement | null) =>
        !!el && el.offsetParent !== null && el.offsetWidth > 0 && el.offsetHeight > 0;

      const time   = timeRefById.current[s.id] || null;
      const antag  = assumpRefById.current[s.id] || null;
      const mid    = midRefById.current[s.id] || null;
      const sign   = signRefById.current[s.id] || null;
      const symbol = symbolCellRefById.current[s.id] || null;
      const anchor = colAnchorRefById.current[s.id] || null; // altid sidste fallback

      const ref =
        (isVisible(time)   && time)   ||
        (isVisible(antag)  && antag)  ||
        (isVisible(mid)    && mid)    ||
        (isVisible(sign)   && sign)   ||
        (isVisible(symbol) && symbol) ||
        anchor ||
        null;

      return { current: ref } as React.RefObject<HTMLElement>;
    })()}
    visible={true}
    onAdd={() => handleAddAfter(s.id)}
    onRemove={() => handleRemove(s.id)}
    onAddSymbol={() => {
      setStepSymbol(s.id, "right");
      setShowSymbolPickerFor(s.id);
    }}
    dragHandleProps={{
      draggable: true,
      onDragStart: (e) => handleDragStart(s.id, e),
      style: { cursor: "grab" },
    }}
  />
)}







          </div>
        );
      })}

{/* Output kolonne */}
<div style={{ gridColumn: String(outputCol), display: "contents" }}>

  {/* Output Tid & ansvar */}
  {!isOutputHidden(doc, "time") && (
    <>
      {Label("Tid & ansvar", outputCol, "1")}
      <TrashIconInGridCell
        show={activeCell?.colId === "output" && activeCell?.type === "time"}
        col={outputCol}
        row="1"
        onClick={() => handleDeleteCell("time", "output", true)}
      />

      <CustomQuill
        key={`outputTime-${outputCol}`}
        fieldType={`outputTime-${outputCol}`}
        value={doc.outputTime || ""}
        onFocus={() => setActiveCell({ colId: "output", type: "time" })}
        onRefReady={(el) => {
          if (el && !(el as any).__outputTimeBlurBound) {
            (el as any).__outputTimeBlurBound = true;
            el.addEventListener(
              "focusout",
              () => {
                const latest =
                  (window as any).latest_output_time ?? doc.outputTime ?? "";
                requestAnimationFrame(() => {
                  addToHistory({ ...doc, outputTime: latest });
                  patch({ outputTime: latest });
                });
              },
              true
            );
          }
        }}
        onChange={(html) => {
          // kun lokal opdatering + planlagt gem
          (window as any).latest_output_time = html;
          addToHistory({ ...doc, outputTime: html });

          clearTimeout((window as any).commitTimeout_output_time);
          (window as any).commitTimeout_output_time = setTimeout(() => {
            const latest =
              (window as any).latest_output_time ?? doc.outputTime ?? "";
            addToHistory({ ...doc, outputTime: latest });
            patch({ outputTime: latest });
          }, 10 * 60 * 1000);
        }}
        onBoxColorChange={(color) => {
          const current = doc.styles?.outputTime?.bg || "#e5eff5";
          if (current === color) return;

          outputTimeBgRef.current["output"] = color;
          addToHistory(doc);
          patch({
            styles: {
              ...(doc.styles || {}),
              outputTime: { bg: color },
            },
          });
        }}
        style={{
          ...arrowStyle(outputCol, "2"),
          background:
            outputTimeBgRef.current["output"] ??
            doc.styles?.outputTime?.bg ??
            "#e5eff5",
          border: "1px solid #e5e7eb",
          padding: 8,
          overflow: "visible",
          zIndex: 10,
        }}
      />
    </>
  )}

  {/* Output Antagelser */}
  {!isOutputHidden(doc, "assump") && (
    <>
      {Label("Antagelser", outputCol, "3")}
      <TrashIconInGridCell
        show={activeCell?.colId === "output" && activeCell?.type === "assump"}
        col={outputCol}
        row="3"
        onClick={() => handleDeleteCell("assump", "output", true)}
      />

      <CustomQuill
        key={`outputAssump-${outputCol}`}
        fieldType={`outputAssump-${outputCol}`}
        value={doc.outputAssumption || ""}
        onFocus={() => setActiveCell({ colId: "output", type: "assump" })}
        onRefReady={(el) => {
          if (el && !(el as any).__outputAssumpBlurBound) {
            (el as any).__outputAssumpBlurBound = true;
            el.addEventListener(
              "focusout",
              () => {
                const latest =
                  (window as any).latest_output_assump ??
                  doc.outputAssumption ??
                  "";
                requestAnimationFrame(() => {
                  addToHistory({ ...doc, outputAssumption: latest });
                  patch({ outputAssumption: latest });
                });
              },
              true
            );
          }
        }}
        onChange={(html) => {
          (window as any).latest_output_assump = html;
          addToHistory({ ...doc, outputAssumption: html });

          clearTimeout((window as any).commitTimeout_output_assump);
          (window as any).commitTimeout_output_assump = setTimeout(() => {
            const latest =
              (window as any).latest_output_assump ??
              doc.outputAssumption ??
              "";
            addToHistory({ ...doc, outputAssumption: latest });
            patch({ outputAssumption: latest });
          }, 10 * 60 * 1000);
        }}
        onBoxColorChange={(color) => {
          const current = doc.styles?.outputAssump?.bg || "#f8fafc";
          if (current === color) return;

          outputAssumpBgRef.current["output"] = color;
          addToHistory(doc);
          patch({
            styles: {
              ...(doc.styles || {}),
              outputAssump: { bg: color },
            },
          });
        }}
        style={{
          ...cardStyle(outputCol, "4", ""),
          background:
            outputAssumpBgRef.current["output"] ??
            doc.styles?.outputAssump?.bg ??
            "#f8fafc",
          border: "1px solid #e5e7eb",
          borderRadius: RADIUS,
          padding: 8,
        }}
      />
    </>
  )}

  {/* Output */}
  {Label("Output", outputCol, "5")}

  <CustomQuill
    key={`outputMid-${outputCol}`}
    fieldType={`outputMid-${outputCol}`}
    value={doc.output || ""}
    onFocus={() => setActiveCell({ colId: "output", type: "mid" })}
    onRefReady={(el) => {
      if (el && !(el as any).__outputMidBlurBound) {
        (el as any).__outputMidBlurBound = true;
        el.addEventListener(
          "focusout",
          () => {
            const latest =
              (window as any).latest_output_mid ?? doc.output ?? "";
            requestAnimationFrame(() => {
              addToHistory({ ...doc, output: latest });
              patch({ output: latest });
            });
          },
          true
        );
      }
    }}
    onChange={(html) => {
      (window as any).latest_output_mid = html;
      addToHistory({ ...doc, output: html });

      clearTimeout((window as any).commitTimeout_output_mid);
      (window as any).commitTimeout_output_mid = setTimeout(() => {
        const latest =
          (window as any).latest_output_mid ?? doc.output ?? "";
        addToHistory({ ...doc, output: latest });
        patch({ output: latest });
      }, 10 * 60 * 1000);
    }}
    onBoxColorChange={(color) => {
      const current = doc.styles?.outputMid?.bg || "#e0f2fe";
      if (current === color) return;

      outputMidBgRef.current["output"] = color;
      addToHistory(doc);
      patch({
        styles: {
          ...(doc.styles || {}),
          outputMid: { bg: color },
        },
      });
    }}
    style={{
      ...cardStyle(outputCol, "6", "", true),
      background:
        outputMidBgRef.current["output"] ??
        doc.styles?.outputMid?.bg ??
        "#e0f2fe",
      border: "1px solid #e5e7eb",
      borderRadius: RADIUS,
      padding: 8,
    }}
  />

  {/* Output Tegn */}
  {!isOutputHidden(doc, "sign") && (
    <>
      {Label("Tegn", outputCol, "7")}
      <TrashIconInGridCell
        show={activeCell?.colId === "output" && activeCell?.type === "sign"}
        col={outputCol}
        row="7"
        onClick={() => handleDeleteCell("sign", "output", true)}
      />

      <CustomQuill
        key={`outputSign-${outputCol}`}
        fieldType={`outputSign-${outputCol}`}
        value={doc.outputSign || ""}
        onFocus={() => setActiveCell({ colId: "output", type: "sign" })}
        onRefReady={(el) => {
          if (el && !(el as any).__outputSignBlurBound) {
            (el as any).__outputSignBlurBound = true;
            el.addEventListener(
              "focusout",
              () => {
                const latest =
                  (window as any).latest_output_sign ?? doc.outputSign ?? "";
                requestAnimationFrame(() => {
                  addToHistory({ ...doc, outputSign: latest });
                  patch({ outputSign: latest });
                });
              },
              true
            );
          }
        }}
        onChange={(html) => {
          (window as any).latest_output_sign = html;
          addToHistory({ ...doc, outputSign: html });

          clearTimeout((window as any).commitTimeout_output_sign);
          (window as any).commitTimeout_output_sign = setTimeout(() => {
            const latest =
              (window as any).latest_output_sign ?? doc.outputSign ?? "";
            addToHistory({ ...doc, outputSign: latest });
            patch({ outputSign: latest });
          }, 10 * 60 * 1000);
        }}
        onBoxColorChange={(color) => {
          const current = doc.styles?.outputSign?.bg || "#f8fafc";
          if (current === color) return;

          outputSignBgRef.current["output"] = color;
          addToHistory(doc);
          patch({
            styles: {
              ...(doc.styles || {}),
              outputSign: { bg: color },
            },
          });
        }}
        style={{
          ...cardStyle(outputCol, "8", ""),
          background:
            outputSignBgRef.current["output"] ??
            doc.styles?.outputSign?.bg ??
            "#f8fafc",
          border: "1px solid #e5e7eb",
          borderRadius: RADIUS,
          padding: 8,
        }}
      />
    </>
  )}

</div>







    </>
  );
}

