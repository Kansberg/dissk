import { useEffect, useRef, useState } from "react";

type ViewSettingsPanelProps = {
  anchorRef: React.RefObject<HTMLButtonElement>;
  initialTid: boolean;
  initialAntagelser: boolean;
  onSave: (v: { tid: boolean; antagelser: boolean }) => void;
  onCancel: () => void;
};

export default function ViewSettingsPanel({
  anchorRef,
  initialTid,
  initialAntagelser,
  onSave,
  onCancel,
}: ViewSettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const [tid, setTid] = useState<boolean>(initialTid);
  const [antagelser, setAntagelser] = useState<boolean>(initialAntagelser);

  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  // Positionér panelet under øjet
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      left: rect.left,
    });
  }, [anchorRef]);

  // Klik udenfor lukker
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const panel = panelRef.current;
      const anchor = anchorRef.current;

      if (!panel || !anchor) return;

      const target = e.target as Node;
      if (!panel.contains(target) && !anchor.contains(target)) {
        onCancel();
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onCancel, anchorRef]);

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        background: "white",
        border: "1px solid #ccc",
        borderRadius: 8,
        padding: 12,
        width: 220,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        zIndex: 9999,
      }}
    >
      <label style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={tid}
          onChange={(e) => setTid(e.target.checked)}
        />
        Vis tid & ansvar
      </label>

      <label style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={antagelser}
          onChange={(e) => setAntagelser(e.target.checked)}
        />
        Vis antagelser
      </label>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => onSave({ tid, antagelser })}
          style={{
            flex: 1,
            background: "#03424f",
            color: "white",
            padding: "6px 8px",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
          }}
        >
          Gem
        </button>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            background: "#ccc",
            color: "black",
            padding: "6px 8px",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
          }}
        >
          Annuller
        </button>
      </div>
    </div>
  );
}
