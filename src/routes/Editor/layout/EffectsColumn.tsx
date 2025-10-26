import type { Doc } from "../../../types/editor";
import { useEffect, useRef } from "react";

type Props = {
  doc: Doc;
  patch: (partial: Partial<Doc>) => void;
  shortCol: number;
  longCol: number;
  effectHeight: string;
  theme: { C: any; RADIUS: number };
};

export default function EffectsColumn({
  doc,
  patch,
  shortCol,
  longCol,
  effectHeight,
  theme,
}: Props) {
  const shortRef = useRef<HTMLTextAreaElement>(null);
  const longRef = useRef<HTMLTextAreaElement>(null);
  const { RADIUS } = theme;

  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    grow(shortRef.current);
    grow(longRef.current);
  }, [doc.effects]);

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
    ref: React.RefObject<HTMLTextAreaElement>,
    val: string,
    onVal: (v: string) => void,
    col: number,
    row: string
  ) => (
    <textarea
      ref={ref}
      value={val}
      onChange={(e) => onVal(e.target.value)}
      onInput={(e) => grow(e.currentTarget)}
      style={{
        gridColumn: String(col),
        gridRow: row,
        background: "#ffffff",
        color: "#000",
        border: "1px solid #e5e7eb",
        borderRadius: RADIUS,
        padding: 12,
        width: "100%",
        fontFamily: "Arial, sans-serif",
        fontSize: 12,
        lineHeight: 1.35,
        resize: "none",
        overflow: "hidden",
        boxSizing: "border-box",
        boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
        height: effectHeight === "auto" ? "auto" : effectHeight,
      }}
    />
  );

  return (
    <>
      {Label("Kortsigtet effekt", shortCol, "5")}
      {Box(
        shortRef,
        doc.effects.short,
        (v) => patch({ effects: { ...doc.effects, short: v } }),
        shortCol,
        "6"
      )}

      {Label("Langsigtet effekt", longCol, "5")}
      {Box(
        longRef,
        doc.effects.long,
        (v) => patch({ effects: { ...doc.effects, long: v } }),
        longCol,
        "6"
      )}
    </>
  );
}
