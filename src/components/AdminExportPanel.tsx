import { useRef, useState } from "react";
import { collection, getDocs, type DocumentData } from "firebase/firestore";
import { ArrowLeft, Download, Eye, X } from "lucide-react";
import { db } from "../firebase";
import type { Doc, Step } from "../types/editor";
import { exportDissk } from "../utils/exportDissk";
import DownloadModal, { type DownloadOptions } from "./DownloadModal";
import ExportLoadingOverlay from "./ExportLoadingOverlay";
import CanvasPanel from "../routes/Editor/CanvasPanel";
import { EDITOR_THEME } from "../routes/Editor/editorTheme";

type ExportUser = {
  uid: string;
  email: string;
  displayName?: string;
};

type ExportProject = {
  id: string;
  title: string;
  updatedAt: unknown;
  doc: Doc;
};

type Props = {
  users: ExportUser[];
};

const BRAND = "#03424f";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeSteps(value: unknown): Step[] {
  const rawSteps = Array.isArray(value)
    ? value
    : Object.entries(asRecord(value))
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, step]) => step);

  return rawSteps.map((value, index) => {
    const step = asRecord(value);
    return {
      id: String(step.id ?? index + 1),
      title: String(step.title ?? `Trin ${index + 1}`),
      time: String(step.time ?? ""),
      assumption: String(step.assumption ?? ""),
      sign: String(step.sign ?? ""),
      hidden: asRecord(step.hidden),
    };
  });
}

function normalizeProject(id: string, data: DocumentData): ExportProject | null {
  const steps = normalizeSteps(data.steps);
  if (steps.length === 0) return null;

  const effects = asRecord(data.effects);
  const project: Doc = {
    id,
    title: String(data.title || "Unavngivet DISSK"),
    input: String(data.input ?? ""),
    steps,
    output: String(data.output ?? ""),
    outputTime: String(data.outputTime ?? ""),
    outputAssumption: String(data.outputAssumption ?? ""),
    outputSign: String(data.outputSign ?? ""),
    effects: {
      short: String(effects.short ?? ""),
      long: String(effects.long ?? ""),
    },
    context: String(data.context ?? ""),
    stepSymbols: asRecord(data.stepSymbols) as Doc["stepSymbols"],
    updatedAt: Date.now(),
    outputHidden: asRecord(data.outputHidden),
    showTidAnsvar: data.showTidAnsvar ?? true,
    showAntagelser: data.showAntagelser ?? true,
    showContext: data.showContext ?? false,
    stepLabel: data.stepLabel === "tema" ? "tema" : "trin",
    styles: asRecord(data.styles) as Doc["styles"],
  };

  return {
    id,
    title: project.title,
    updatedAt: data.updatedAt,
    doc: project,
  };
}

function formatDate(value: unknown): string {
  if (!value) return "Ukendt tidspunkt";

  if (
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toLocaleString();
  }

  const record = asRecord(value);
  const milliseconds =
    typeof record.seconds === "number"
      ? record.seconds * 1000
      : typeof value === "number"
      ? value
      : Number.NaN;

  return Number.isNaN(milliseconds)
    ? "Ukendt tidspunkt"
    : new Date(milliseconds).toLocaleString();
}

function getDateValue(value: unknown): number {
  if (!value) return 0;

  if (
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().getTime();
  }

  const record = asRecord(value);
  if (typeof record.seconds === "number") return record.seconds * 1000;
  return typeof value === "number" ? value : 0;
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

const ignorePatch: (partial: Partial<Doc>) => void = () => {};
const ignoreStepPatch: (
  stepId: string,
  field: keyof Doc["steps"][0],
  value: string
) => void = () => {};

export default function AdminExportPanel({ users }: Props) {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<ExportUser | null>(null);
  const [projects, setProjects] = useState<ExportProject[]>([]);
  const [previewProject, setPreviewProject] = useState<ExportProject | null>(
    null
  );
  const [exportProject, setExportProject] = useState<ExportProject | null>(
    null
  );
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [error, setError] = useState("");
  const [showDownload, setShowDownload] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const exportPanelRef = useRef<HTMLDivElement>(null!);
  const exportMidMarkerRef = useRef<HTMLTextAreaElement>(null!);
  const previewPanelRef = useRef<HTMLDivElement>(null!);
  const previewMidMarkerRef = useRef<HTMLTextAreaElement>(null!);

  const filteredUsers = users.filter((user) => {
    const query = search.trim().toLowerCase();
    return (
      !query ||
      user.email.toLowerCase().includes(query) ||
      (user.displayName || "").toLowerCase().includes(query)
    );
  });

  const openUser = async (user: ExportUser) => {
    setSelectedUser(user);
    setPreviewProject(null);
    setExportProject(null);
    setProjects([]);
    setLoadingProjects(true);
    setError("");

    try {
      const snapshot = await getDocs(collection(db, "users", user.uid, "projects"));
      const userProjects = snapshot.docs
        .map((document) => normalizeProject(document.id, document.data()))
        .filter((project): project is ExportProject => project !== null)
        .sort((a, b) => getDateValue(b.updatedAt) - getDateValue(a.updatedAt));

      setProjects(userProjects);
    } catch (err) {
      console.error("[AdminExportPanel] Kunne ikke hente projekter:", err);
      setError("Kunne ikke hente brugerens DISSK. Kontrollér SUPERADMIN-adgangen.");
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleExport = async (options: DownloadOptions) => {
    if (!exportPanelRef.current || isExporting) return;

    setShowDownload(false);
    setIsExporting(true);

    try {
      await waitForPaint();
      await exportDissk(exportPanelRef.current, options);
    } finally {
      setIsExporting(false);
      setExportProject(null);
    }
  };

  if (!selectedUser) {
    return (
      <section>
        <h2 style={{ color: "#000", marginTop: 0, marginBottom: 4 }}>
          Eksport
        </h2>
        <p style={{ color: "#4b5563", marginTop: 0, marginBottom: 16 }}>
          Vælg en bruger for at se og eksportere brugerens DISSK.
        </p>

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Søg efter navn eller e-mail..."
          style={searchInput}
        />

        <div style={listFrame}>
          {filteredUsers.map((user) => (
            <button
              key={user.uid}
              type="button"
              onClick={() => openUser(user)}
              style={listButton}
            >
              <span>
                <strong>{user.displayName || "Intet navn"}</strong>
                <span style={secondaryText}>{user.email}</span>
              </span>
              <Eye size={18} />
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section>
      {isExporting && <ExportLoadingOverlay />}
      <DownloadModal
        open={showDownload}
        onCancel={() => {
          setShowDownload(false);
          setExportProject(null);
        }}
        onConfirm={handleExport}
      />

      {previewProject && (
        <div style={previewOverlay}>
          <div style={previewModal}>
            <div style={previewHeader}>
              <div>
                <h3 style={{ color: "#000", margin: 0 }}>
                  Preview: {previewProject.title}
                </h3>
                <p style={{ color: "#4b5563", margin: "4px 0 0", fontSize: 13 }}>
                  Read-only preview
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewProject(null)}
                aria-label="Luk preview"
                style={closeButton}
              >
                <X size={20} />
              </button>
            </div>

            <div style={previewFrame}>
              <div style={{ width: "fit-content", pointerEvents: "none" }}>
                <CanvasPanel
                  key={previewProject.id}
                  doc={previewProject.doc}
                  patch={ignorePatch}
                  patchStepField={ignoreStepPatch}
                  theme={EDITOR_THEME}
                  panelRef={previewPanelRef}
                  midMarkerRef={previewMidMarkerRef}
                  isExport
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {exportProject && (
        <div style={exportStaging}>
          <CanvasPanel
            key={exportProject.id}
            doc={exportProject.doc}
            patch={ignorePatch}
            patchStepField={ignoreStepPatch}
            theme={EDITOR_THEME}
            panelRef={exportPanelRef}
            midMarkerRef={exportMidMarkerRef}
            isExport
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setSelectedUser(null);
          setPreviewProject(null);
          setExportProject(null);
          setProjects([]);
        }}
        style={backButton}
      >
        <ArrowLeft size={16} />
        Tilbage til brugere
      </button>

      <h2 style={{ color: "#000", marginBottom: 4 }}>
        {selectedUser.displayName || selectedUser.email}
      </h2>
      <p style={{ color: "#4b5563", marginTop: 0, marginBottom: 16 }}>
        {selectedUser.email}
      </p>

      {error && <div style={errorBox}>{error}</div>}
      {loadingProjects && <p style={{ color: "#4b5563" }}>Henter DISSK...</p>}

      {!loadingProjects && projects.length === 0 && !error && (
        <p style={{ color: "#4b5563" }}>Brugeren har ingen DISSK endnu.</p>
      )}

      {!loadingProjects && projects.length > 0 && (
        <div style={projectGrid}>
          {projects.map((project) => (
            <div
              key={project.id}
              style={projectCard}
            >
              <div>
                <strong>{project.title}</strong>
                <span style={secondaryText}>{formatDate(project.updatedAt)}</span>
              </div>
              <div style={projectActions}>
                <button
                  type="button"
                  onClick={() => setPreviewProject(project)}
                  style={secondaryAction}
                >
                  <Eye size={16} />
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExportProject(project);
                    setShowDownload(true);
                  }}
                  style={exportButton}
                >
                  <Download size={16} />
                  Eksporter
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const searchInput: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 11px",
  marginBottom: 14,
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#fff",
  color: "#000",
};

const listFrame: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  overflow: "hidden",
};

const listButton: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 14px",
  border: "none",
  borderBottom: "1px solid #e5e7eb",
  background: "#fff",
  color: "#111827",
  cursor: "pointer",
  textAlign: "left",
};

const secondaryText: React.CSSProperties = {
  display: "block",
  marginTop: 3,
  color: "#6b7280",
  fontSize: 12,
};

const backButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#fff",
  color: BRAND,
  cursor: "pointer",
  fontWeight: 600,
};

const projectGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: 10,
};

const projectCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  gap: 14,
  padding: 12,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  background: "#fff",
  color: "#111827",
  textAlign: "left",
};

const projectActions: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const previewHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
};

const exportButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "9px 13px",
  border: "none",
  borderRadius: 7,
  background: BRAND,
  color: "#fff",
  cursor: "pointer",
  fontWeight: 700,
};

const secondaryAction: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "9px 13px",
  border: `1px solid ${BRAND}`,
  borderRadius: 7,
  background: "#fff",
  color: BRAND,
  cursor: "pointer",
  fontWeight: 700,
};

const previewOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "grid",
  placeItems: "center",
  padding: 20,
  background: "rgba(0,0,0,0.45)",
  zIndex: 9999,
};

const previewModal: React.CSSProperties = {
  width: "min(1400px, 96vw)",
  maxHeight: "92vh",
  padding: 16,
  borderRadius: 12,
  background: "#fff",
  boxShadow: "0 12px 36px rgba(0,0,0,0.3)",
};

const closeButton: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 36,
  height: 36,
  border: "none",
  borderRadius: 8,
  background: "#f3f4f6",
  color: BRAND,
  cursor: "pointer",
};

const previewFrame: React.CSSProperties = {
  maxHeight: "calc(92vh - 92px)",
  overflow: "auto",
  padding: 12,
  border: "1px solid #d1d5db",
  borderRadius: 10,
  background: "#fff",
};

const exportStaging: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: -100000,
  width: "fit-content",
  pointerEvents: "none",
  background: "#fff",
};

const errorBox: React.CSSProperties = {
  padding: 12,
  marginBottom: 14,
  borderRadius: 8,
  background: "#fee2e2",
  color: "#b91c1c",
};
