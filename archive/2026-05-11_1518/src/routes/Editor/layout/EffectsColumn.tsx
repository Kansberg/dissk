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

  const contextRef = useRef<HTMLElement | null>(null);
  const shortRef = useRef<HTMLElement | null>(null);
  const longRef = useRef<HTMLElement | null>(null);

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

  // -------- Lokale states + refs for kun-blur/10min commit --------
  const [contextHtml, setContextHtml] = useState<string>(doc.context || "");
  const latestContextRef = useRef<string>(doc.context || "");
  const contextTimerRef = useRef<number | ReturnType<typeof setTimeout> | null>(null);

  const [shortHtml, setShortHtml] = useState<string>(doc.effects?.short || "");
  const [longHtml, setLongHtml] = useState<string>(doc.effects?.long || "");
  const latestShortRef = useRef<string>(doc.effects?.short || "");
  const latestLongRef = useRef<string>(doc.effects?.long || "");
  const effectsTimerRef = useRef<number | ReturnType<typeof setTimeout> | null>(null);

  // Hold local state i sync, hvis doc ændres udefra (fx load/undo)
  useEffect(() => {
    if (doc.context !== latestContextRef.current) {
      setContextHtml(doc.context || "");
      latestContextRef.current = doc.context || "";
    }
  }, [doc.context]);

  useEffect(() => {
    const v = doc.effects?.short || "";
    if (v !== latestShortRef.current) {
      setShortHtml(v);
      latestShortRef.current = v;
    }
  }, [doc.effects?.short]);

  useEffect(() => {
    const v = doc.effects?.long || "";
    if (v !== latestLongRef.current) {
      setLongHtml(v);
      latestLongRef.current = v;
    }
  }, [doc.effects?.long]);

  // --------- fælles helpers ---------
  const scheduleEffectsAuto = () => {
    if (effectsTimerRef.current) clearTimeout(effectsTimerRef.current as any);
    effectsTimerRef.current = setTimeout(() => {
      const nextEffects = {
        ...(doc.effects || {}),
        short: latestShortRef.current,
        long: latestLongRef.current,
      };
      addToHistory({ ...doc, effects: nextEffects });
      safePatch({ effects: nextEffects }, "effects:autoCommit:10min");
    }, 10 * 60 * 1000);
  };

  const commitEffectsOnBlur = () => {
    const nextEffects = {
      ...(doc.effects || {}),
      short: latestShortRef.current,
      long: latestLongRef.current,
    };
    addToHistory({ ...doc, effects: nextEffects });
    safePatch({ effects: nextEffects }, "effects:blur");
  };

  const scheduleContextAuto = () => {
    if (contextTimerRef.current) clearTimeout(contextTimerRef.current as any);
    contextTimerRef.current = setTimeout(() => {
      addToHistory({ ...doc, context: latestContextRef.current });
      safePatch({ context: latestContextRef.current }, "context:autoCommit:10min");
    }, 10 * 60 * 1000);
  };

  const commitContextOnBlur = () => {
    addToHistory({ ...doc, context: latestContextRef.current });
    safePatch({ context: latestContextRef.current }, "context:blur");
  };

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
              value={contextHtml}
              onChange={(html: string) => {
                setContextHtml(html);
                latestContextRef.current = html;
                addToHistory({ ...doc, context: html });
                scheduleContextAuto();
              }}
              onRefReady={(el) => {
                contextRef.current = el as HTMLElement | null;
                if (el && !(el as any).__contextBlurBound) {
                  (el as any).__contextBlurBound = true;
                  el.addEventListener(
                    "focusout",
                    () => requestAnimationFrame(() => commitContextOnBlur()),
                    true
                  );
                }
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
          onRefReady={(el) => {
            shortRef.current = el as HTMLElement | null;
            if (el && !(el as any).__shortBlurBound) {
              (el as any).__shortBlurBound = true;
              el.addEventListener(
                "focusout",
                () => requestAnimationFrame(() => commitEffectsOnBlur()),
                true
              );
            }
          }}
          value={shortHtml}
          onChange={(html: string) => {
            setShortHtml(html);
            latestShortRef.current = html;
            addToHistory({
              ...doc,
              effects: {
                ...(doc.effects || {}),
                short: html,
                long: latestLongRef.current,
              },
            });
            scheduleEffectsAuto();
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
          onRefReady={(el) => {
            longRef.current = el as HTMLElement | null;
            if (el && !(el as any).__longBlurBound) {
              (el as any).__longBlurBound = true;
              el.addEventListener(
                "focusout",
                () => requestAnimationFrame(() => commitEffectsOnBlur()),
                true
              );
            }
          }}
          value={longHtml}
          onChange={(html: string) => {
            setLongHtml(html);
            latestLongRef.current = html;
            addToHistory({
              ...doc,
              effects: {
                ...(doc.effects || {}),
                short: latestShortRef.current,
                long: html,
              },
            });
            scheduleEffectsAuto();
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
