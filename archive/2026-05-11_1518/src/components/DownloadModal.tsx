import { useState } from "react";

export type DownloadOptions = {
  size: string;
  format: "png" | "pdf";
};

type Props = {
  open: boolean;
  onConfirm: (options: DownloadOptions) => void;
  onCancel: () => void;
};

const PAPER_SIZES = [
  "Original (100%)",
  "Høj opløsning (Velegnet til storformatsprint)",
  "A4",
  "A3",
  "A2",
  "A1",
  "A0",
];

export default function DownloadModal({ open, onConfirm, onCancel }: Props) {
  const [size, setSize] = useState<string>("Original (100%)");
  const [format, setFormat] = useState<"png" | "pdf">("png");

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 20,
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: 12,
          padding: 24,
          width: 360,
          boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
          fontFamily: "Inter, sans-serif",
          color: "#000000",
        }}
      >
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            marginBottom: 20,
            color: "#000000",
          }}
        >
          Download
        </h2>

        {/* Size */}
        <label
          style={{
            display: "block",
            marginBottom: 8,
            fontWeight: 600,
            fontSize: 14,
            color: "#000000",
          }}
        >
          Størrelse
        </label>
        <select
          value={size}
          onChange={(e) => setSize(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #ccc",
            marginBottom: 20,
            fontSize: 14,
            background: "#ffffff",
            color: "#000000",
          }}
        >
          {PAPER_SIZES.map((s) => (
            <option
              key={s}
              value={s}
              style={{ background: "#ffffff", color: "#000000" }}
            >
              {s}
            </option>
          ))}
        </select>

        {/* Format */}
        <label
          style={{
            display: "block",
            marginBottom: 8,
            fontWeight: 600,
            fontSize: 14,
            color: "#000000",
          }}
        >
          Format
        </label>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as "png" | "pdf")}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #ccc",
            marginBottom: 30,
            fontSize: 14,
            background: "#ffffff",
            color: "#000000",
          }}
        >
          <option
            value="png"
            style={{ background: "#ffffff", color: "#000000" }}
          >
            Billede (PNG)
          </option>
          <option
            value="pdf"
            style={{ background: "#ffffff", color: "#000000" }}
          >
            PDF
          </option>
        </select>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 12,
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #999",
              background: "#eeeeee",
              cursor: "pointer",
              fontSize: 14,
              color: "#000000",
            }}
          >
            Annuller
          </button>

          <button
            onClick={() => onConfirm({ size, format })}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              background: "#03424f",
              color: "#ffffff",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Eksporter
          </button>
        </div>
      </div>
    </div>
  );
}
