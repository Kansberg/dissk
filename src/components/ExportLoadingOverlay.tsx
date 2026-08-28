import { LoaderCircle } from "lucide-react";

const BRAND = "#03424f";

export default function ExportLoadingOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(255,255,255,0.78)",
        display: "grid",
        placeItems: "center",
        zIndex: 10000,
        backdropFilter: "blur(2px)",
      }}
    >
      <style>
        {`
          @keyframes dissk-export-spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          padding: "20px 24px",
          borderRadius: 12,
          background: "#ffffff",
          color: BRAND,
          boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
          fontWeight: 700,
        }}
      >
        <LoaderCircle
          size={34}
          aria-hidden="true"
          style={{ animation: "dissk-export-spin 0.8s linear infinite" }}
        />
        <span>Forbereder eksport...</span>
      </div>
    </div>
  );
}
