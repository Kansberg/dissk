import type { Doc } from "../../../types/editor";
import { useEffect, useRef } from "react";

type Props = {
  doc: Doc;
  patch: (partial: Partial<Doc>) => void;
  gridCol: number;
  inputHeight: string;
  theme: { C: any; RADIUS: number };
};

export default function InputColumn({ doc, patch, gridCol, inputHeight, theme }: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const { C } = theme;

  const autoGrow = () => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = ref.current.scrollHeight + "px";
  };

  useEffect(autoGrow, []);
  useEffect(autoGrow, [doc.input]);

  const labelStyle: React.CSSProperties = {
    gridColumn: String(gridCol),
    gridRow: "3",
    fontWeight: 800,
    color: C.brand,
    fontSize: 14,
    fontFamily: "Arial, sans-serif",
  };

  const boxStyle: React.CSSProperties = {
    gridColumn: String(gridCol),
    gridRow: "4",
    background: C.brand,
    color: "#fff",
    border: "none",
    borderRadius: theme.RADIUS,
    padding: 12,
    width: "100%",
    fontFamily: "Arial, sans-serif",
    fontWeight: 800,
    fontSize: 12,
    lineHeight: 1.35,
    resize: "none",
    overflow: "hidden",
    boxShadow: "0 4px 12px rgba(0,0,0,0.75)",
    height: inputHeight,
    boxSizing: "border-box",
  };

  return (
    <>
      <div style={labelStyle}>Input</div>
      <textarea
        ref={ref}
        value={doc.input}
        onChange={(e) => patch({ input: e.target.value })}
        style={boxStyle}
      />
    </>
  );
}
