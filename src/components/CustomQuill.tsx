import { useEffect, useRef, useState } from "react";
import Quill from "quill";
import "quill/dist/quill.snow.css";
import { Palette, List, Type } from "lucide-react";
import { createPortal } from "react-dom";
import { useUndo } from "../context/UndoContext";

type CustomQuillProps = {
  value: string;
  onChange: (html: string) => void;

  boxColor?: string;
  onBoxColorChange?: (color: string) => void;

  fieldType?: string;
  variant?: "bare" | "box";
  placeholder?: string;

  style?: React.CSSProperties;

  onFocus?: () => void;
  onRefReady?: (el: HTMLDivElement | null) => void;

  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
};

const colorGrid = [
  "#111827", "#000000", "#374151", "#6b7280", "#9ca3af", "#d1d5db",
  "#e5e7eb", "#f3f4f6", "#f8fafc", "#ffffff",
  "#ef4444", "#fca5a5", "#fecaca", "#fee2e2",
  "#fb923c", "#fdba74", "#fed7aa", "#ffedd5",
  "#facc15", "#fde68a", "#03424f",
  "#22c55e", "#86efac", "#dcfce7",
  "#3b82f6", "#93c5fd", "#dbeafe",
];

// GLOBALT: Tving Quill til at slippe fokus
export function blurAllQuills() {
  const els = document.querySelectorAll(".ql-editor");
  els.forEach((el: any) => {
    if (el && el.blur) el.blur();
  });
}

export default function CustomQuill({
  value,
  onChange,
  boxColor = "#ffffff",
  onBoxColorChange,
  fieldType,
  variant = "box",
  placeholder,
  style,
  onFocus,
  onRefReady,
  onDragOver,
  onDrop,
}: CustomQuillProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<Quill | null>(null);

  // Sidste værdi vi har skubbet ud via onChange – pr. instans
  const lastValueRef = useRef<string>(value || "");

  const [active, setActive] = useState(false);
  const [showPicker, setShowPicker] = useState<"text" | "bg" | null>(null);

  const { addToHistory } = useUndo();

  useEffect(() => {
    onRefReady?.(wrapperRef.current);
  }, [onRefReady]);

  // INIT – kun én gang pr. komponent (ingen afhængighed af fieldType)
  useEffect(() => {
    if (!editorRef.current || quillRef.current) return;

    const q = new Quill(editorRef.current, {
      theme: "snow",
      modules: { toolbar: false },
      placeholder: placeholder || "",
      bounds: wrapperRef.current ?? document.body,
    });

    quillRef.current = q;

    // Styling
    const cont = editorRef.current.querySelector(
      ".ql-container"
    ) as HTMLElement | null;
    if (cont) {
      cont.style.border = "none";
      cont.style.background = "transparent";
    }
    const ed = editorRef.current.querySelector(
      ".ql-editor"
    ) as HTMLElement | null;
    if (ed) {
      ed.style.background = "transparent";
      ed.style.minHeight = "100%";
    }
    q.root.style.background = "transparent";
    q.root.style.color = "#000";

    // Lyt KUN på text-change fra USER
    q.on("text-change", (_delta, _oldDelta, source) => {
      if (source !== "user") return;
      const html = q.root.innerHTML;
      lastValueRef.current = html;
      onChange(html);
      // Debug pr. felt
      console.log("TEXT CHANGE", { fieldType, html });
    });

    // Init med startværdi
    if (value && value !== q.root.innerHTML) {
      q.clipboard.dangerouslyPasteHTML(value);
      lastValueRef.current = value;
    }

    return () => {
      try {
        q.off("text-change");
      } catch {
        // ignore
      }
      quillRef.current = null;
    };
  }, []); // ⚠️ kun én gang

  // Sync udefrakommende value → Quill (Undo, load fra Firestore osv.)
  useEffect(() => {
    const q = quillRef.current;
    if (!q) return;

    const incoming = value || "";
    const current = q.root.innerHTML || "";

    // Hvis det er det samme som vi selv sidst har sendt → gør ingenting
    if (incoming === lastValueRef.current) return;

    // Hvis Quill allerede matcher incoming → bare opdatér lastValueRef
    if (incoming.trim() === current.trim()) {
      lastValueRef.current = incoming;
      return;
    }

    // Bevar caret hvis muligt
    const sel = q.getSelection();
    q.clipboard.dangerouslyPasteHTML(incoming || "");
    if (sel) {
      try {
        q.setSelection(sel.index, sel.length || 0);
      } catch {
        // ignore
      }
    }
    lastValueRef.current = incoming;

    console.log("EXTERNAL VALUE SYNC", { fieldType, incoming });
}, [value, fieldType]);

  // Luk toolbar når man klikker udenfor
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const target = e.target as Node;

      if (wrapperRef.current?.contains(target)) return;

      const toolbarEl = document.querySelector(".customquill-toolbar");
      if (toolbarEl?.contains(target)) return;

      setActive(false);
      setShowPicker(null);
    };

    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const toggle = (f: "bold" | "italic" | "underline" | "list") => {
    const q = quillRef.current;
    if (!q) return;
    const cur = q.getFormat();
    const isActive = cur[f];
    q.format(f, f === "list" ? (isActive ? false : "bullet") : !isActive);
    const html = q.root.innerHTML;
    lastValueRef.current = html;
    onChange(html);
    addToHistory(html);
  };

  const wrapperStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 8,
    boxShadow: variant === "bare" ? "none" : "0 2px 6px rgba(0,0,0,0.2)",
    background: variant === "box" ? boxColor : undefined,
    minHeight:
      variant === "bare"
        ? fieldType === "assump"
          ? "15vh"
          : fieldType?.startsWith("mid")
          ? "10vh"
          : fieldType === "sign"
          ? "35vh"
          : fieldType?.startsWith("effects")
          ? "35vh"
          : "5vh"
        : "120px",
    ...style,
    overflow: "visible",
    zIndex: 99999,
    isolation: "isolate",
  };

  const [, setToolbarBelow] = useState(false);

  useEffect(() => {
    const measure = () => {
      const top = wrapperRef.current?.getBoundingClientRect().top ?? 0;
      setToolbarBelow(top < 80);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, []);

  const btn: React.CSSProperties = {
    width: 34,
    height: 34,
    border: "2px solid #03424f",
    background: "#03424f",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
    boxShadow: "0 3px 10px rgba(0,0,0,0.25)",
    transition: "background 120ms ease, color 120ms ease, transform 120ms ease",
  };

  const picker: React.CSSProperties = {
    position: "absolute",
    top: 0,
    right: "42px",
    background: "#ffffff",
    border: "1px solid #bfc9cc",
    borderRadius: 8,
    padding: 6,
    display: "grid",
    gridTemplateColumns: "repeat(9, 14px)",
    gap: 4,
    zIndex: 2147483647,
    boxShadow: "0 6px 14px rgba(0,0,0,0.3)",
  };

  const dot: React.CSSProperties = {
    width: 16,
    height: 16,
    borderRadius: 3,
    cursor: "pointer",
    border: "1px solid rgba(0,0,0,0.25)",
    boxSizing: "border-box",
    padding: 0,
    lineHeight: 0,
    appearance: "none",
  };

  return (
    <div
      ref={wrapperRef}
      style={wrapperStyle}
      onClick={() => {
        setActive(true);
        onFocus?.(); // 👉 Fokus markeres KUN her – aldrig via selection-change
      }}
      data-grid-container="true"
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver?.(e);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop?.(e);
      }}
    >
      {active &&
        createPortal(
          (() => {
            const rect = wrapperRef.current?.getBoundingClientRect();
            const top = rect ? rect.top : 0;
            const left = rect ? rect.right + 8 : 0;

            return (
              <div
                className="customquill-toolbar"
                style={{
                  position: "fixed",
                  top,
                  left,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  background: "#ffffff",
                  border: "2px solid #03424f",
                  borderRadius: 10,
                  padding: "10px 8px",
                  boxShadow: "0 12px 28px rgba(0,0,0,0.35)",
                  zIndex: 2147483647,
                  pointerEvents: "auto",
                }}
              >
                <button
                  onClick={() => toggle("bold")}
                  style={btn}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#046271")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "#03424f")
                  }
                >
                  <b>B</b>
                </button>

                <button
                  onClick={() => toggle("italic")}
                  style={{ ...btn, fontStyle: "italic" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#046271")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "#03424f")
                  }
                >
                  <i>I</i>
                </button>

                <button
                  onClick={() => toggle("underline")}
                  style={{ ...btn, textDecoration: "underline" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#046271")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "#03424f")
                  }
                >
                  <u>U</u>
                </button>

                <button
                  onClick={() => toggle("list")}
                  style={btn}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#046271")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "#03424f")
                  }
                  aria-label="Punktopstilling"
                >
                  <List
                    size={18}
                    color="#ffffff"
                    strokeWidth={2.25}
                    style={{ display: "block", flexShrink: 0 }}
                  />
                </button>

                <div style={{ position: "relative" }}>
                  <button
                    onClick={() =>
                      setShowPicker(showPicker === "text" ? null : "text")
                    }
                    style={btn}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#046271")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "#03424f")
                    }
                    aria-label="Tekstfarve"
                  >
                    <Type
                      size={18}
                      color="#ffffff"
                      strokeWidth={2.25}
                      style={{ display: "block", flexShrink: 0 }}
                    />
                  </button>
                  {showPicker === "text" && (
                    <div style={picker}>
                      {colorGrid.map((c) => (
                        <button
                          key={c}
                          onClick={() => {
                            const q = quillRef.current;
                            if (!q) return;
                            q.format("color", c);
                            const html = q.root.innerHTML;
                            lastValueRef.current = html;
                            onChange(html);
                            addToHistory(html);
                            setShowPicker(null);
                          }}
                          style={{
                            ...dot,
                            background: c,
                            border:
                              c === "#ffffff"
                                ? "1px solid #ccc"
                                : dot.border,
                          }}
                          aria-label={`Sæt tekstfarve til ${c}`}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {onBoxColorChange && (
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() =>
                        setShowPicker(showPicker === "bg" ? null : "bg")
                      }
                      style={btn}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "#046271")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "#03424f")
                      }
                      aria-label="Baggrundsfarve"
                    >
                      <Palette
                        size={18}
                        color="#ffffff"
                        strokeWidth={2.25}
                        style={{ display: "block", flexShrink: 0 }}
                      />
                    </button>
                    {showPicker === "bg" && (
                      <div style={picker}>
                        {colorGrid.map((c) => (
                          <button
                            key={c}
                            onClick={() => {
                              onBoxColorChange?.(c);
                              setShowPicker(null);
                              const q = quillRef.current;
                              const html = q?.root.innerHTML || "";
                              lastValueRef.current = html;
                              addToHistory(html);
                            }}
                            style={{
                              ...dot,
                              background: c,
                              border:
                                c === boxColor
                                  ? "2px solid #000"
                                  : dot.border,
                            }}
                            aria-label={`Sæt baggrundsfarve til ${c}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })(),
          document.body
        )}

      <div
        ref={editorRef}
        style={{
          border: "none",
          padding: variant === "bare" ? 0 : 8,
          minHeight: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}
