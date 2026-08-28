// src/routes/Home.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Topbar from "../components/Topbar";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  doc,
  getDoc,
  deleteDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { Share2, Copy, Trash2, Sparkles } from "lucide-react";
import ShareModal from "../components/ShareModal";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";
import ConfirmCopyModal from "../components/ConfirmCopyModal";
import CreateModal from "../components/CreateModal";
import { canUseMiniDissk } from "../utils/miniDisskAccess";
import { createEmptyMiniDissk } from "../types/miniDissk";

type RemoteDoc = {
  id: string;
  title: string;
  updatedAt?: Timestamp;
  owner?: string;
};

type LocalDoc = {
  id: string;
  title: string;
  updatedAt: number;
};

type MiniRemoteDoc = RemoteDoc;

const LOCAL_KEY = "dissk_local_projects";
const BRAND = "#03424f";

function readLocalProjects(): LocalDoc[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
    const list: LocalDoc[] = Object.values(raw || {});
    return list
      .map((x: any) => ({
        id: x.id,
        title: x.title || "Unavngivet DISSK",
        updatedAt: Number(x.updatedAt || Date.now()),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export default function Home() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [locals, setLocals] = useState<LocalDoc[]>([]);
  const [ownProjects, setOwnProjects] = useState<RemoteDoc[]>([]);
  const [sharedProjects, setSharedProjects] = useState<RemoteDoc[]>([]);
  const [miniProjects, setMiniProjects] = useState<MiniRemoteDoc[]>([]);
  const [hasMiniAccess, setHasMiniAccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const [shareId, setShareId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copyId, setCopyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const qOwn = query(
        collection(db, "users", user.uid, "projects"),
        orderBy("updatedAt", "desc")
      );
      const ownSnap = await getDocs(qOwn);
      setOwnProjects(ownSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));

      const emailKey = user.email?.toLowerCase();
      const shared: RemoteDoc[] = [];

      if (emailKey) {
        try {
          const accessRef = doc(db, "projectAccess", emailKey);
          const accessSnap = await getDoc(accessRef);
          const accessData = accessSnap.data() || {};

          for (const id of Object.keys(accessData)) {
            const pSnap = await getDoc(doc(db, "projects", id));
            if (pSnap.exists()) shared.push({ id, ...(pSnap.data() as any) });
          }
        } catch (err) {
          console.warn("[Home] Kunne ikke hente delte projekter:", err);
        }
      }

      setSharedProjects(shared);

      const miniAllowed = await canUseMiniDissk(user.uid, user.email);
      setHasMiniAccess(miniAllowed);
      if (miniAllowed) {
        const miniQuery = query(
          collection(db, "users", user.uid, "miniProjects"),
          orderBy("updatedAt", "desc")
        );
        const miniSnapshot = await getDocs(miniQuery);
        setMiniProjects(
          miniSnapshot.docs.map((snapshot) => ({
            id: snapshot.id,
            ...(snapshot.data() as any),
          }))
        );
      } else {
        setMiniProjects([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setLocals(readLocalProjects());
      setHasMiniAccess(false);
      setMiniProjects([]);
    }
  }, [user]);

  const createMiniDissk = async () => {
    if (!user || !hasMiniAccess) return;
    const miniRef = doc(collection(db, "users", user.uid, "miniProjects"));
    await setDoc(miniRef, {
      ...createEmptyMiniDissk(miniRef.id, user.email || ""),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    nav(`/mini/${miniRef.id}`);
  };

  const deleteMiniDissk = async (project: MiniRemoteDoc) => {
    if (!user || !window.confirm(`Slet “${project.title || "MiniDISSK"}”?`)) return;
    await deleteDoc(doc(db, "users", user.uid, "miniProjects", project.id));
    setMiniProjects((previous) => previous.filter((item) => item.id !== project.id));
  };

  useEffect(() => {
    if (user) load();
    const onFocus = () => user && load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [user]);

  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      <Topbar mode="home" />

      <div
        style={{
          padding: "24px 32px",
          maxWidth: 1400,
          margin: "64px auto 0",
        }}
      >
        {/* LOGGET IND */}
        {user && (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
              Mine projekter
            </h2>
            <div style={gridStyle}>
              <div style={cardStyle}>
                <button
                  onClick={() => setShowCreate(true)}
                  style={createBtnStyle}
                >
                  + Opret ny DISSK
                </button>
              </div>

              {ownProjects.map((p) => (
                <div key={p.id} style={cardStyle}>
                  <div
                    style={{ flex: 1, cursor: "pointer" }}
                    onClick={() => nav(`/editor/${p.id}`)}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>
                      {p.title || "Unavngivet DISSK"}
                    </div>
                    <div style={{ opacity: 0.8, fontSize: 13 }}>
                      {p.updatedAt instanceof Timestamp
                        ? p.updatedAt.toDate().toLocaleString()
                        : new Date((p.updatedAt as any) || Date.now()).toLocaleString()}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 12, paddingTop: 8 }}>
                    <Share2 size={18} style={{ cursor: "pointer" }} onClick={() => setShareId(p.id)} />
                    <Copy size={18} style={{ cursor: "pointer" }} onClick={() => setCopyId(p.id)} />
                    <Trash2 size={18} style={{ cursor: "pointer" }} onClick={() => setDeleteId(p.id)} />
                  </div>
                </div>
              ))}
            </div>

            {hasMiniAccess && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: "32px 0 12px" }}>
                  MiniDISSK
                </h2>
                <div style={gridStyle}>
                  <div style={{ ...cardStyle, ...miniCreateCardStyle }}>
                    <button onClick={createMiniDissk} style={miniCreateBtnStyle}>
                      <Sparkles size={20} />
                      <span>Opret MiniDISSK</span>
                    </button>
                  </div>
                  {miniProjects.map((project) => (
                    <div key={project.id} style={{ ...cardStyle, ...miniProjectCardStyle }}>
                      <div
                        style={{ flex: 1, cursor: "pointer" }}
                        onClick={() => nav(`/mini/${project.id}`)}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                          <Sparkles size={15} />
                          <span style={miniBadgeStyle}>MiniDISSK</span>
                        </div>
                        <div style={{ fontWeight: 800, marginBottom: 5 }}>
                          {project.title || "Unavngivet MiniDISSK"}
                        </div>
                        <div style={{ opacity: 0.72, fontSize: 12 }}>
                          {project.updatedAt instanceof Timestamp
                            ? project.updatedAt.toDate().toLocaleString("da-DK")
                            : "Netop oprettet"}
                        </div>
                      </div>
                      <Trash2
                        size={17}
                        style={{ alignSelf: "flex-end", cursor: "pointer" }}
                        onClick={() => deleteMiniDissk(project)}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* DELE MED MIG */}
        {user && sharedProjects.length > 0 && (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "32px 0 12px" }}>
              Delte med mig
            </h2>
            <div style={gridStyle}>
              {sharedProjects.map((p) => (
                <div key={p.id} style={cardStyle}>
                  <div
                    style={{ flex: 1, cursor: "pointer" }}
                    onClick={() => nav(`/editor/${p.id}`)}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>
                      {p.title || "Unavngivet DISSK"}
                    </div>
                    <div style={{ opacity: 0.8, fontSize: 13 }}>
                      {p.updatedAt instanceof Timestamp
                        ? p.updatedAt.toDate().toLocaleString()
                        : new Date().toLocaleString()}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>Delt med dig</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* IKKE LOGGET IND — VIS LOKALE */}
        {!user && (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
              Lokale projekter
            </h2>

            <div style={gridStyle}>
              {locals.map((l) => (
                <div key={l.id} style={cardStyle}>
                  <div
                    style={{ flex: 1, cursor: "pointer" }}
                    onClick={() => nav(`/editor/${l.id}`)}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>
                      {l.title}
                    </div>
                    <div style={{ opacity: 0.8, fontSize: 13 }}>
                      {new Date(l.updatedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}

              {/* ANON NEW PROJECT (THE FIX) */}
<div style={cardStyle}>
  <button
    onClick={() => nav("/editor/new")}
    style={createBtnStyle}
  >
    + Opret ny DISSK
  </button>
</div>

            </div>
          </>
        )}

        {user && loading && (
          <div style={{ textAlign: "center", marginTop: 12, color: "#334155" }}>
            Henter projekter…
          </div>
        )}
      </div>

      {shareId && <ShareModal projectId={shareId} onClose={() => setShareId(null)} />}
      {copyId && user?.email && (
        <ConfirmCopyModal
          projectId={copyId}
          userEmail={user.email}
          userUid={user.uid}
          onClose={() => setCopyId(null)}
          onCopied={load}
        />
      )}

      {deleteId && (
        <ConfirmDeleteModal
          projectId={deleteId}
          userUid={user!.uid}
          onClose={() => setDeleteId(null)}
          onDeleted={() => {
            setOwnProjects((prev) => prev.filter((p) => p.id !== deleteId));
            setDeleteId(null);
          }}
        />
      )}

      {showCreate && user && (
        <CreateModal
          userUid={user.uid}
          userEmail={user.email ?? ""}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))",
  gap: 20,
  maxWidth: 1400,
  margin: "0 auto",
};

const cardStyle: React.CSSProperties = {
  height: 110,
  borderRadius: 14,
  border: "1px solid rgba(3,66,79,.25)",
  background: "#fff",
  color: BRAND,
  textAlign: "left",
  padding: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,.06)",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
};

const createBtnStyle: React.CSSProperties = {
  height: "100%",
  width: "100%",
  borderRadius: 14,
  background: "#fff",
  color: BRAND,
  fontWeight: 800,
  fontSize: 18,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const miniCreateCardStyle: React.CSSProperties = {
  border: "1px solid rgba(3,66,79,.55)",
  background: "linear-gradient(135deg, #e4f3f2 0%, #f8fbfb 100%)",
};

const miniCreateBtnStyle: React.CSSProperties = {
  ...createBtnStyle,
  border: "none",
  background: "transparent",
  gap: 9,
};

const miniProjectCardStyle: React.CSSProperties = {
  minHeight: 132,
  height: "auto",
  borderTop: "4px solid #477f88",
  background: "#f9fcfc",
};

const miniBadgeStyle: React.CSSProperties = {
  padding: "2px 7px",
  borderRadius: 999,
  background: "#dceeed",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: ".04em",
  textTransform: "uppercase",
};
