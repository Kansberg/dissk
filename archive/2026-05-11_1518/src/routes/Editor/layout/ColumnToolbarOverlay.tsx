import { GripVertical, Plus, Trash2, Shapes } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUndo } from "../../../context/UndoContext";

type Props = {
  targetRef: React.RefObject<HTMLElement>;
  visible: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onAddSymbol?: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
};


export default function ColumnToolbarOverlay({
  targetRef,
  visible,
  onAdd,
  onRemove,
  onAddSymbol, // 👈 modtag ny prop
  dragHandleProps,
}: Props) {
  const { addToHistory } = useUndo();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const ro = useRef<ResizeObserver | null>(null);

  const btn: React.CSSProperties = useMemo(
    () => ({
      width: 24,
      height: 24,
      boxSizing: "border-box",
      border: "2px solid #03424f",
      background: "#03424f",
      color: "#ffffff",
      cursor: "pointer",
      borderRadius: 6,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      lineHeight: 0,
      padding: 0,
      appearance: "none",
      minWidth: 0,
      boxShadow: "0 3px 10px rgba(0,0,0,0.25)",
      transition: "background 120ms ease, transform 120ms ease",
      flexShrink: 0,
    }),
    []
  );

  const handleEnter = (e: React.MouseEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.background = "#046271";
  };
  const handleLeave = (e: React.MouseEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.background = "#03424f";
  };

// Placér toolbar relativt til selve målelementet (cellen/ankeret)
const findHeaderRect = (): DOMRect | null => {
  const el = targetRef.current as HTMLElement | null;
  if (!el) return null;

  // gå opad hvis elementet er display:none (0x0)
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    const visible = node.offsetWidth > 0 || node.offsetHeight > 0;
    if (visible) break;
    node = node.parentElement;
  }
  return (node ?? el).getBoundingClientRect();
};


const updatePosition = () => {
  if (!visible || !targetRef.current) return;

  const baseRect = findHeaderRect();
  if (!baseRect) return;

  const tb = toolbarRef.current;
  const tbHeight = tb ? tb.offsetHeight : 36;

  
  const H_OFFSET = 45; // ← flyt lidt til højre (justér tallet efter smag)

setPos({
  top: Math.round(baseRect.top - tbHeight - 8),
  left: Math.round(baseRect.left + baseRect.width / 2 + H_OFFSET),
});

};


  useLayoutEffect(() => {
    if (!visible) return;
    updatePosition();
  }, [visible, targetRef.current]);

  useEffect(() => {
    if (!visible) return;

    const el = targetRef.current;
    if (!el) return;

    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("force-toolbar-update", onResize as EventListener);

    ro.current = new ResizeObserver(updatePosition);
    ro.current.observe(el as HTMLElement);

    const mo = new MutationObserver(updatePosition);
    mo.observe(document.body, { attributes: true, childList: true, subtree: true });

    updatePosition();

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("force-toolbar-update", onResize as EventListener);
      ro.current?.disconnect();
      mo.disconnect();
    };
  }, [visible, targetRef]);

  if (!visible || !pos) return null;

  const handleAdd = () => {
    onAdd();
    addToHistory?.("Tilføj kolonne");
  };

  const handleRemove = () => {
    onRemove();
    addToHistory?.("Fjern kolonne");
  };

const handleAddSymbolClick = () => {
  // læg i historik (for undo)
  addToHistory?.("Tilføj symbol-kolonne");

  // MiddleGrid ved allerede hvilken kolonne det handler om
  onAddSymbol?.();

  // giv layoutet et “skub”, så man ser resultatet med det samme
  window.dispatchEvent(new Event("force-toolbar-update"));
};



  const toolbar = (
    <div
      ref={toolbarRef}
      className="column-toolbar-overlay"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        transform: "translateX(-50%)",
        zIndex: 2147483647,
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "#ffffff",
        border: "2px solid #03424f",
        borderRadius: 10,
        padding: "6px 8px",
        boxShadow: "0 12px 28px rgba(0,0,0,0.35)",
        pointerEvents: "auto",
      }}
    >
      {/* Flyt kolonne */}
      <div
        {...dragHandleProps}
        title="Flyt kolonne"
        style={{ ...btn, cursor: "grab", background: "#046271" }}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <GripVertical size={14} color="#ffffff" strokeWidth={2} />
      </div>

      {/* Tilføj kolonne */}
      <button
        onClick={handleAdd}
        title="Tilføj kolonne"
        style={btn}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <Plus size={14} color="#ffffff" strokeWidth={2.2} />
      </button>

      {/* Fjern kolonne */}
      <button
        onClick={handleRemove}
        title="Fjern kolonne"
        style={btn}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <Trash2 size={14} color="#ffffff" strokeWidth={2.2} />
      </button>

      {/* 🆕 Symbol-knap */}
      <button
        onClick={handleAddSymbolClick}
        title="Tilføj symbol-kolonne"
        style={btn}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <Shapes size={14} color="#ffffff" strokeWidth={2.2} />
      </button>
    </div>
  );

  return createPortal(toolbar, document.body);
}
