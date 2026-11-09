import InputColumn from "./layout/InputColumn";
import MiddleGrid from "./layout/MiddleGrid";
import EffectsColumn from "./layout/EffectsColumn";
import type { Doc } from "../../types/editor";

type Theme = {
  C: any;
  RADIUS: number;
  MIN_COL_W: number;
  GAP: number;
  ROWS: {
    TIME_H: string;
    ASSUMP_H: string;
    MID_H: string;
    SIGN_H: string;
  };
  INPUT_H: string;
  EFFECT_H: string;
};

type Props = {
  doc: Doc;
  patch: (partial: Partial<Doc>) => void;
  patchStepField: (
    stepId: string,
    field: keyof Doc["steps"][0],
    value: string
  ) => void;
  theme: Theme;
  panelRef: React.RefObject<HTMLDivElement>;
  midMarkerRef: React.RefObject<HTMLTextAreaElement>;
  isExport?: boolean;
};

export default function CanvasPanel({
  doc,
  patch,
  patchStepField,
  theme,
  panelRef,
  midMarkerRef,
  isExport = false,
}: Props) {
  const { C, RADIUS, MIN_COL_W, GAP } = theme;

  // ---- LOG START ----
  console.log("🟢 [CanvasPanel] render - steps:", doc.steps.length);
  console.log("🟢 [CanvasPanel] stepSymbols:", (doc as any).stepSymbols);
  // ---- LOG SLUT ----

// Brug stepSymbols som et rent map – både numeriske og ikke-numeriske keys er gyldige IDs
const symbols = ((doc as any).stepSymbols ?? {}) as Record<string, string>;



  const gridTemplateColumns = (() => {
    const cols: string[] = [`minmax(${MIN_COL_W}px, ${MIN_COL_W}px)`];
    for (const step of doc.steps) {
      cols.push(`minmax(${MIN_COL_W}px, ${MIN_COL_W}px)`);
      if (symbols[step.id]) {
        console.log("🟢 [CanvasPanel] Tilføjer symbolkolonne for", step.id);
        cols.push("50px");
      }
    }
    cols.push(`minmax(${MIN_COL_W}px, ${MIN_COL_W}px)`);
    cols.push(`repeat(2, minmax(${MIN_COL_W}px, ${MIN_COL_W}px))`);
    return cols.join(" ");
  })();

  const outputCol =
    2 + doc.steps.length + doc.steps.filter((s) => symbols[s.id]).length;

const gridKey =
  "grid-" +
  doc.steps.map((s) => `${s.id}:${symbols?.[s.id] ? 1 : 0}`).join("|");



  console.log("🟢 [CanvasPanel] gridKey:", gridKey);
  console.log("🟢 [CanvasPanel] gridTemplateColumns:", gridTemplateColumns);

  return (
    <div
      ref={panelRef}
      style={{
        position: "relative",
        width: "fit-content",
        padding: 16,
        borderRadius: RADIUS,
        border: isExport ? "none" : `2px dashed ${C.edge}`,
        display: "grid",
        gridTemplateColumns,
        gridTemplateRows: "auto auto auto auto auto auto auto auto auto",
        columnGap: GAP,
        rowGap: 12,
        background: "transparent",
      }}
    >
      {/* ----------- VENSTRE KOLONNE ----------- */}
      <div
        style={{
          display: "contents",
        }}
      >
        <InputColumn doc={doc} patch={patch} theme={{ C, RADIUS }} />
      </div>

      {/* ----------- MIDTERKOLONNE (TRIN) ----------- */}
      <div style={{ display: "contents" }}>
        <div
          key={gridKey}
          style={{
            display: "contents",
          }}
        >
          <MiddleGrid
            doc={doc}
            patch={patch}
            patchStepField={patchStepField}
            gridStartCol={2}
            outputCol={outputCol}
            theme={{ C, RADIUS }}
            midMarkerRef={midMarkerRef}
          />
        </div>
      </div>

      {/* ----------- HØJRE KOLONNE (EFFECTS) ----------- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(2, minmax(${MIN_COL_W}px, ${MIN_COL_W}px))`,
          columnGap: GAP,
          rowGap: 12,
          gridColumn: `${outputCol + 1} / span 2`,
          gridRow: "1 / span 9",
          alignSelf: "start",
          alignContent: "start",
          position: "relative",
        }}
      >
        <EffectsColumn doc={doc} patch={patch} theme={{ C, RADIUS }} />
      </div>
    </div>
  );
}
