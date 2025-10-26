import InputColumn from "./layout/InputColumn";
import MiddleGrid from "./layout/MiddleGrid";
import EffectsColumn from "./layout/EffectsColumn";
import type { Doc } from "../../types/editor";

type Theme = {
  C: any;
  RADIUS: number;
  MIN_COL_W: number;
  GAP: number;
  ROWS: { TIME_H: string; ASSUMP_H: string; MID_H: string; SIGN_H: string };
  INPUT_H: string;
  EFFECT_H: string;
};

type Props = {
  doc: Doc;
  patch: (partial: Partial<Doc>) => void;
  theme: Theme;
  midMarkerRef: React.RefObject<HTMLDivElement | null>;
  midlineTop: number;
};

export default function CanvasPanel({ doc, patch, theme, midMarkerRef, midlineTop }: Props) {
  const { C, RADIUS, MIN_COL_W, GAP } = theme;

  // Kolonner: Input | (trin x N) | Output | (spacer) | Effekter (kort/lang)
  const gridCols =
    `minmax(${MIN_COL_W}px, ${MIN_COL_W}px)` + // input
    ` ${GAP}px ` +                             // lille spacer efter input
    `repeat(${doc.steps.length}, minmax(${MIN_COL_W}px, ${MIN_COL_W}px))` +
    ` minmax(${MIN_COL_W}px, ${MIN_COL_W}px)` + // output
    ` ${GAP * 2}px ` +                          // bred spacer før effekter
    `minmax(${MIN_COL_W}px, ${MIN_COL_W}px)` +  // kortsigtet
    ` minmax(${MIN_COL_W}px, ${MIN_COL_W}px)`;  // langsigtet

  // Rækker: alt er AUTO, så rækken vokser efter indhold og skubber de næste rækker ned
  const gridRows = `
    auto   /* labels øverst */
    auto   /* Tid & ansvar (pilefelt) */
    auto   /* labels */
    auto   /* Antagelser */
    auto   /* labels */
    auto   /* Trin */
    auto   /* labels */
    auto   /* Tegn */
  `;

  const INPUT_COL = 1;
  const STEP_COL_START = 3;
  const OUTPUT_COL = STEP_COL_START + doc.steps.length;
  const EFFECT_SPACER_COL = OUTPUT_COL + 1;
  const EFFECT_SHORT_COL = OUTPUT_COL + 2;
  const EFFECT_LONG_COL = OUTPUT_COL + 3;

  return (
    <div
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: gridCols,
        gridTemplateRows: gridRows,
        columnGap: GAP,
        rowGap: 12,
        width: "fit-content",
        boxSizing: "border-box",
        border: `2px dashed ${C.edge}`,
        borderRadius: RADIUS,
        padding: 16,
        background: "#fff",
        color: "#000",
        overflow: "visible",
      }}
    >
      {/* Midterlinje */}
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

      {/* Lodret streg før effekter */}
      <div
        aria-hidden
        style={{
          gridColumn: String(EFFECT_SPACER_COL),
          gridRow: "1 / -1",
          borderLeft: `2px dashed ${C.dashed}`,
          zIndex: 0,
        }}
      />

      {/* Input-kolonne (autogrow, sort tekst) */}
      <InputColumn
        doc={doc}
        patch={patch}
        gridCol={INPUT_COL}
        inputHeight="auto"
        theme={{ C, RADIUS }}
      />

      {/* Midter-sektion (trin/antagelser/tegn) – autogrow pr. felt, rækker vokser automatisk */}
      <MiddleGrid
        doc={doc}
        patch={patch}
        gridStartCol={STEP_COL_START}
        outputCol={OUTPUT_COL}
        midMarkerRef={midMarkerRef}
        theme={{ C, RADIUS }}
      />

      {/* Effekter (autogrow, sort tekst) */}
      <EffectsColumn
        doc={doc}
        patch={patch}
        shortCol={EFFECT_SHORT_COL}
        longCol={EFFECT_LONG_COL}
        effectHeight="auto"
        theme={{ C, RADIUS }}
      />
    </div>
  );
}
