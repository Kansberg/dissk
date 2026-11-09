import { useState } from "react";

export type DownloadSize = "original" | "high" | "A4" | "A3" | "A2" | "A1" | "A0";
export type DownloadBoxLayout = "dynamic" | "uniform";

export type DownloadOptions = {
  size: DownloadSize;
  format: "png" | "pdf";
  boxLayout?: DownloadBoxLayout;
};

type Props = {
  open: boolean;
  onConfirm: (options: DownloadOptions) => void;
  onCancel: () => void;
};

const PAPER_SIZES: Array<{ value: DownloadSize; label: string }> = [
  { value: "original", label: "Original (100%)" },
  { value: "high", label: "Høj opløsning (velegnet til storformatsprint)" },
  { value: "A4", label: "A4" },
  { value: "A3", label: "A3" },
  { value: "A2", label: "A2" },
  { value: "A1", label: "A1" },
  { value: "A0", label: "A0" },
];

export default function DownloadModal({ open, onConfirm, onCancel }: Props) {
  const [size, setSize] = useState<DownloadSize>("original");
  const [format, setFormat] = useState<"png" | "pdf">("png");
  const [boxLayout, setBoxLayout] = useState<DownloadBoxLayout>("dynamic");

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
          maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
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
          htmlFor="download-size"
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
          id="download-size"
          value={size}
          onChange={(e) => setSize(e.target.value as DownloadSize)}
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
              key={s.value}
              value={s.value}
              style={{ background: "#ffffff", color: "#000000" }}
            >
              {s.label}
            </option>
          ))}
        </select>

        {/* Format */}
        <label
          htmlFor="download-format"
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
          id="download-format"
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

        <label htmlFor="download-box-layout" style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 14 }}>
          Kassehøjde
        </label>
        <select
          id="download-box-layout"
          value={boxLayout}
          onChange={(event) => setBoxLayout(event.target.value as DownloadBoxLayout)}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", background: "#fff", color: "#000" }}
        >
          <option value="dynamic">Dynamiske – højde efter indhold</option>
          <option value="uniform">Ens højde pr. række</option>
        </select>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: "#475569", margin: "8px 0 20px" }}>
          Dynamiske kasser følger hver sin tekst. Ens højde giver alle kasser i samme række samme højde som den højeste kasse.
          Valget gælder kun eksporten.
        </p>

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
            onClick={() => onConfirm({ size, format, boxLayout })}
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
