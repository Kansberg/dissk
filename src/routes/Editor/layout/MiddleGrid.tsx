import type { Doc } from "../../../types/editor";
import { useEffect, useRef } from "react";

type Props = {
  doc: Doc;
  patch: (partial: Partial<Doc>) => void;
  gridStartCol: number;
  outputCol: number;
  midMarkerRef: React.RefObject<HTMLDivElement>;
  theme: { C: any; RADIUS: number };
};

export default function MiddleGrid({
  doc,
  patch,
  gridStartCol,
  outputCol,
  midMarkerRef,
  theme,
}: Props) {
  const { RADIUS } = theme;

  // refs per række
  const timeRefs = useRef<HTMLTextAreaElement[]>([]);
  const assumpRefs = useRef<HTMLTextAreaElement[]>([]);
  const midRefs = useRef<HTMLTextAreaElement[]>([]);
  const signRefs = useRef<HTMLTextAreaElement[]>([]);

  // Synkroniser højde pr. række
  const syncRowHeights = (refs: HTMLTextAreaElement[]) => {
    const maxHeight = Math.max(
      ...refs.map((el) => {
        el.style.height = "auto";
        return el.scrollHeight;
      }),
      0
    );
    refs.forEach((el) => (el.style.height = `${maxHeight}px`));
  };

  const handleGrow = (refs: HTMLTextAreaElement[]) => {
    requestAnimationFrame(() => syncRowHeights(refs));
  };

  useEffect(() => {
    handleGrow(timeRefs.current);
    handleGrow(assumpRefs.current);
    handleGrow(midRefs.current);
    handleGrow(signRefs.current);
  }, [doc]);

  const Label = (t: string, col: number, row: string) => (
    <div
      style={{
        gridColumn: String(col),
        gridRow: row,
        fontWeight: 800,
        color: "#000",
        fontSize: 14,
        fontFamily: "Arial, sans-serif",
      }}
    >
      {t}
    </div>
  );

  const Box = (
    refsArr: HTMLTextAreaElement[],
    index: number,
    val: string,
    onVal: (v: string) => void,
    col: number,
    row: string,
    style: React.CSSProperties
  ) => (
    <textarea
      ref={(el) => {
        if (el) refsArr[index] = el;
      }}
      value={val}
      onChange={(e) => onVal(e.target.value)}
      onInput={() => handleGrow(refsArr)}
      style={style}
    />
  );

  const arrowStyle = (col: number, row: string): React.CSSProperties => ({
    gridColumn: String(col),
    gridRow: row,
    background: "#e5eff5",
    color: "#000",
    border: "none",
    borderRadius: RADIUS,
    padding: 12,
    width: "100%",
    fontFamily: "Arial, sans-serif",
    fontWeight: 600,
    fontSize: 12,
    lineHeight: 1.3,
    resize: "none",
    overflow: "hidden",
    boxSizing: "border-box",
    clipPath: "polygon(0 0, 92% 0, 100% 50%, 92% 100%, 0 100%)",
    filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.4))",
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

  return (
    <>
      {doc.steps.map((s, i) => {
        const col = gridStartCol + i;
        return (
          <div key={s.id} style={{ display: "contents" }}>
            {Label("Tid & ansvar", col, "1")}
            {Box(
              timeRefs.current,
              i,
              s.time,
              (v) =>
                patch({
                  steps: doc.steps.map((x) =>
                    x.id === s.id ? { ...x, time: v } : x
                  ),
                }),
              col,
              "2",
              arrowStyle(col, "2")
            )}

            {Label("Antagelser", col, "3")}
            {Box(
              assumpRefs.current,
              i,
              s.assumption,
              (v) =>
                patch({
                  steps: doc.steps.map((x) =>
                    x.id === s.id ? { ...x, assumption: v } : x
                  ),
                }),
              col,
              "4",
              cardStyle(col, "4", "#f8fafc")
            )}

            {Label("Trin", col, "5")}
            {Box(
              midRefs.current,
              i,
              s.title,
              (v) =>
                patch({
                  steps: doc.steps.map((x) =>
                    x.id === s.id ? { ...x, title: v } : x
                  ),
                }),
              col,
              "6",
              cardStyle(col, "6", "#e0f2fe", true)
            )}

            {Label("Tegn", col, "7")}
            {Box(
              signRefs.current,
              i,
              s.sign,
              (v) =>
                patch({
                  steps: doc.steps.map((x) =>
                    x.id === s.id ? { ...x, sign: v } : x
                  ),
                }),
              col,
              "8",
              cardStyle(col, "8", "#f8fafc")
            )}
          </div>
        );
      })}

      {/* Output kolonne */}
      <div style={{ gridColumn: String(outputCol), display: "contents" }}>
        {Label("Tid & ansvar", outputCol, "1")}
        {Box(
          timeRefs.current,
          doc.steps.length,
          doc.outputTime || "",
          (v) => patch({ outputTime: v }),
          outputCol,
          "2",
          arrowStyle(outputCol, "2")
        )}

        {Label("Antagelser", outputCol, "3")}
        {Box(
          assumpRefs.current,
          doc.steps.length,
          doc.outputAssumption,
          (v) => patch({ outputAssumption: v }),
          outputCol,
          "4",
          cardStyle(outputCol, "4", "#f8fafc")
        )}

        {Label("Output", outputCol, "5")}
        {Box(
          midRefs.current,
          doc.steps.length,
          doc.output,
          (v) => patch({ output: v }),
          outputCol,
          "6",
          cardStyle(outputCol, "6", "#e0f2fe", true)
        )}

        {Label("Tegn", outputCol, "7")}
        {Box(
          signRefs.current,
          doc.steps.length,
          doc.outputSign,
          (v) => patch({ outputSign: v }),
          outputCol,
          "8",
          cardStyle(outputCol, "8", "#f8fafc")
        )}
      </div>

      {/* midterlinje-markør */}
      <div
        ref={midMarkerRef}
        style={{
          gridColumn: "1 / -1",
          gridRow: "6",
          alignSelf: "center",
          height: 0,
        }}
      />
    </>
  );
}
