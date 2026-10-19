import type { Doc } from "../../../types/editor";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import CustomQuill from "../../../components/CustomQuill";
import { useUndo } from "../../../context/UndoContext";

type Props = {
  doc: Doc;
  patch: (partial: Partial<Doc>) => void;
  theme: { C: any; RADIUS: number };
};

export default function EffectsColumn({ doc, patch, theme }: Props) {
  const { addToHistory } = useUndo();
  const { RADIUS } = theme;


  const seqRef = useRef(0);

  // ---------- KORTSIGTET ----------
  const shortDocColor = useMemo(
    () => doc.styles?.effectsShort?.bg || "#ffffff",
    [doc.styles?.effectsShort?.bg]
  );
  const [shortColor, setShortColor] = useState(shortDocColor);
  useEffect(() => {
    if (shortDocColor !== shortColor) setShortColor(shortDocColor);
  }, [shortDocColor, shortColor]);

  // ---------- LANGSIGTET ----------
  const longDocColor = useMemo(
    () => doc.styles?.effectsLong?.bg || "#ffffff",
    [doc.styles?.effectsLong?.bg]
  );
  const [longColor, setLongColor] = useState(longDocColor);
  useEffect(() => {
    if (longDocColor !== longColor) setLongColor(longDocColor);
  }, [longDocColor, longColor]);

  // ---------- KONTEKST ----------
  const contextDocColor = useMemo(
    () => doc.styles?.context?.bg || "#f8fafc",
    [doc.styles?.context?.bg]
  );
  const [contextColor, setContextColor] = useState(contextDocColor);
  useEffect(() => {
    if (contextDocColor !== contextColor) setContextColor(contextDocColor);
  }, [contextDocColor, contextColor]);

  // ---------- PATCH ----------
  const safePatch = (partial: Partial<Doc>, reason: string) => {
    const seq = ++seqRef.current;
    try {
      patch(partial);
      console.log("[EffectsColumn:patch ok]", { seq, reason, partial });
    } catch (e) {
      console.error("[EffectsColumn:patch error]", { seq, reason, e });
    }
  };

  const labelStyle: CSSProperties = {
    fontWeight: 800,
    color: "#000",
    fontSize: 14,
    fontFamily: "Arial, sans-serif",
    marginBottom: 4,
  };

  const boxStyle = (bg: string): CSSProperties => ({
    background: bg,
    border: "1px solid #e5e7eb",
    borderRadius: RADIUS,
    padding: 8,
    fontFamily: "Arial, sans-serif",
    fontSize: 12,
    lineHeight: 1.35,
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
  });

  return (
    <>
      {/* ---------- KONTEKST (STYRES AF doc.showContext) ---------- */}
      {doc.showContext && (
        <>
          <div
            style={{
              ...labelStyle,
              gridColumn: "1 / span 2",
              gridRow: "1",
              textAlign: "left",
              paddingLeft: 4,
            }}
          >
            Kontekst
          </div>

          <div
            style={{
              gridColumn: "1 / span 2",
              gridRow: "2",
              marginBottom: 24,
            }}
          >
            <CustomQuill
              key="effects-context"
              fieldType="context"
              value={doc.context || ""}
              onChange={(html: string) => {
                if ((doc.context || "") === html) return;
                addToHistory(doc);
                patch({ context: html });
              }}

              onBoxColorChange={(color: string) => {
                const currentColor = doc.styles?.context?.bg || "#f8fafc";
                if (color === currentColor) return;
                addToHistory(doc);
                const nextStyles = {
                  ...(doc.styles || {}),
                  context: { bg: color },
                };
                safePatch({ styles: nextStyles }, "context color");
                setContextColor(color);
              }}
              variant="bare"
              placeholder="Kontekst"
              style={{
                ...boxStyle(contextColor),
                minHeight: "15vh",
              }}
            />
          </div>
        </>
      )}

      {/* ---------- KORTSIGTET EFFEKT ---------- */}
      <div style={{ gridColumn: "1", gridRow: "5", ...labelStyle }}>
        Kortsigtet effekt
      </div>

      <div style={{ gridColumn: "1", gridRow: "6" }}>
        <CustomQuill
          key="effects-short"
          fieldType="effectsShort"

          value={doc.effects?.short || ""}
          onChange={(html: string) => {
            if ((doc.effects?.short || "") === html) return;
            addToHistory(doc);
            safePatch({ effects: { ...doc.effects, short: html } }, "short:change");
          }}
          onBoxColorChange={(color: string) => {
            const currentColor = doc.styles?.effectsShort?.bg || "#ffffff";
            if (color === currentColor) return;
            addToHistory(doc);
            const nextStyles = {
              ...(doc.styles || {}),
              effectsShort: { bg: color },
            };
            safePatch({ styles: nextStyles }, "short color");
            setShortColor(color);
          }}
          variant="bare"
          placeholder="Kortsigtet effekt"
          style={boxStyle(shortColor)}
        />
      </div>

      {/* ---------- LANGSIGTET EFFEKT ---------- */}
      <div style={{ gridColumn: "2", gridRow: "5", ...labelStyle }}>
        Langsigtet effekt
      </div>

      <div style={{ gridColumn: "2", gridRow: "6" }}>
        <CustomQuill
          key="effects-long"
          fieldType="effectsLong"

          value={doc.effects?.long || ""}
          onChange={(html: string) => {
            if ((doc.effects?.long || "") === html) return;
            addToHistory(doc);
            safePatch({ effects: { ...doc.effects, long: html } }, "long:change");
          }}
          onBoxColorChange={(color: string) => {
            const currentColor = doc.styles?.effectsLong?.bg || "#ffffff";
            if (color === currentColor) return;
            addToHistory(doc);
            const nextStyles = {
              ...(doc.styles || {}),
              effectsLong: { bg: color },
            };
            safePatch({ styles: nextStyles }, "long color");
            setLongColor(color);
          }}
          variant="bare"
          placeholder="Langsigtet effekt"
          style={boxStyle(longColor)}
        />
      </div>
    </>
  );
}
