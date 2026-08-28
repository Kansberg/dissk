import type { Doc } from "../../../types/editor";
import { useEffect, useMemo, useRef, useState } from "react";
import CustomQuill from "../../../components/CustomQuill";
import { useUndo } from "../../../context/UndoContext";

type Props = {
  doc: Doc;
  patch: (partial: Partial<Doc>) => void;
  theme: { C: any; RADIUS: number };
};

// Helper til korte previews i logs
const preview = (s: string, n = 60) =>
  (s || "").replace(/\s+/g, " ").slice(0, n) + ((s || "").length > n ? "…" : "");

export default function InputColumn({ doc, patch, theme }: Props) {
  const { C } = theme;
  const { addToHistory } = useUndo();

  const seqRef = useRef(0);
  const mountTime = useRef(Date.now());
  const containerRef = useRef<HTMLDivElement | null>(null);

  // --- LOKAL STATE FOR INPUT ---
  const [inputHtml, setInputHtml] = useState<string>(doc.input || "");
  const latestInputRef = useRef<string>(doc.input || "");
  const autoCommitTimerRef = useRef<number | ReturnType<typeof setTimeout> | null>(null);

  // Hold input i sync, hvis doc.input ændres udefra (fx ved load/undo)
  useEffect(() => {
    if (doc.input !== latestInputRef.current) {
      setInputHtml(doc.input || "");
      latestInputRef.current = doc.input || "";
    }
  }, [doc.input]);

  // 🔹 Læs farven direkte fra doc (eller default)
  const docBoxColor: string = useMemo(() => {
    const col = (((doc as any)?.styles || {})?.input || {})?.bg ?? C.brand;
    console.log("[InputColumn:docBoxColor:compute]", { col });
    return col;
  }, [(doc as any)?.styles?.input?.bg, C.brand]);

  const [boxColor, setBoxColor] = useState<string>(docBoxColor);

  useEffect(() => {
    const hasValidDocColor = !!(doc as any)?.styles?.input?.bg;
    if (!hasValidDocColor) {
      console.log("[InputColumn] docBoxColor mangler — bevarer UI boxColor");
      return;
    }

    if (docBoxColor !== boxColor) {
      console.log("[InputColumn] Opdaterer farve fra doc:", { from: boxColor, to: docBoxColor });
      setBoxColor(docBoxColor);
    } else {
      console.log("[InputColumn] Beholder nuværende farve (ingen ændring)");
    }
  }, [docBoxColor]);

  // ---------- AUTOGROW ----------
  const autoGrow = () => {
    try {
      const el = containerRef.current?.querySelector(".ql-editor") as HTMLElement | null;
      if (!el) {
        console.log("[InputColumn:autoGrow] .ql-editor not found");
        return;
      }
      const minHeight = (window.innerHeight * 40) / 100;
      el.style.height = "auto";
      const before = el.scrollHeight;
      el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
      console.log("[InputColumn:autoGrow]", {
        minHeight,
        scrollHeightBefore: before,
        finalHeight: el.style.height,
      });
    } catch (e) {
      console.error("[InputColumn:autoGrow:error]", e);
    }
  };

  useEffect(() => {
    console.log("[InputColumn:useEffect initial autoGrow]");
    autoGrow();
  }, []);

  useEffect(() => {
    console.log("[InputColumn:useEffect doc.input changed -> autoGrow]", {
      inputLen: (doc?.input || "").length,
      inputPreview: preview(doc?.input || ""),
    });
    autoGrow();
  }, [doc.input]);

  const safePatch = (partial: Partial<Doc>, reason: string) => {
    const seq = ++seqRef.current;
    console.log("[InputColumn:patch:pre]", { seq, reason, partialKeys: Object.keys(partial) });
    try {
      patch(partial);
      console.log("[InputColumn:patch:ok]", { seq, reason, partial });
    } catch (e) {
      console.error("[InputColumn:patch:ERROR]", { seq, reason, error: e });
    }
  };

  const labelStyle: React.CSSProperties = {
    fontWeight: 800,
    color: C.brand,
    fontSize: 14,
    fontFamily: "Arial, sans-serif",
    marginBottom: 4,
  };

  console.log("[InputColumn:render]", {
    time: new Date().toISOString(),
    mountSinceMs: Date.now() - mountTime.current,
    inputLen: (doc?.input || "").length,
    inputPreview: preview(doc?.input || ""),
    uiBoxColor: boxColor,
    docBoxColor,
  });

  // --- Commit helpers (blur / 10min) ---
  const scheduleAutoCommit = () => {
    if (autoCommitTimerRef.current) clearTimeout(autoCommitTimerRef.current as any);
    autoCommitTimerRef.current = setTimeout(() => {
      // snapshot før commit – som du gør andre steder
      addToHistory({ ...doc, input: latestInputRef.current });
      safePatch({ input: latestInputRef.current }, "input:autoCommit:10min");
    }, 10 * 60 * 1000);
  };

  const commitOnBlur = () => {
    // snapshot før commit
    addToHistory({ ...doc, input: latestInputRef.current });
    safePatch({ input: latestInputRef.current }, "input:blur");
  };

  return (
    <div style={{ width: "100%" }} ref={containerRef}>
      <div style={labelStyle}>Input</div>

      <CustomQuill
        value={inputHtml}
        onChange={(html) => {
          const seq = ++seqRef.current;
          const from = latestInputRef.current;
          const same = from === html;

          console.log("[InputColumn:onChange]", {
            seq,
            time: new Date().toISOString(),
            htmlLen: (html || "").length,
            htmlPreview: preview(html || ""),
            sameAsLastPatched: same,
          });

          // Opdater KUN lokalt — ingen patch her
          setInputHtml(html);
          latestInputRef.current = html;

          // Behold din historik-adfærd (snapshot af den nye tilstand)
          addToHistory({ ...doc, input: html });

          // Autogrow og planlæg 10-min commit
          autoGrow();
          scheduleAutoCommit();
        }}
        onRefReady={(el) => {
          // Bind blur (focusout) direkte på editor-root, så vi committer på blur
          if (el && !(el as any).__inputBlurBound) {
            (el as any).__inputBlurBound = true;
            el.addEventListener(
              "focusout",
              () => {
                // vent en frame så evt. DOM/Quill kan færdiggøre updates
                requestAnimationFrame(() => commitOnBlur());
              },
              true
            );
          }
        }}
        boxColor={boxColor}
        onBoxColorChange={(color) => {
          const seq = ++seqRef.current;
          console.log("[InputColumn:onBoxColorChange]", {
            seq,
            from: boxColor,
            to: color,
          });

          const currentBg = (doc as any)?.styles?.input?.bg ?? C.brand;
          if (color === currentBg) return; // ingen ændring → ingen historik

          const currentStyles: any = (doc as any).styles || {};
          const nextStyles: any = {
            ...currentStyles,
            input: { ...(currentStyles.input || {}), bg: color },
          };

          // 👉 Læg den NUVÆRENDE tilstand i historikken (før ændringen)
          addToHistory(doc);

          // Gem kun styles (som før)
          safePatch(({ ...( { styles: nextStyles } as any ) }) as Partial<Doc>, "boxColorChange");

          // Opdater UI-farven lokalt
          setBoxColor(color);
        }}
      />
    </div>
  );
}
