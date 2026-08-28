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
} from "firebase/firestore";
import { Share2, Copy, Trash2 } from "lucide-react";
import ShareModal from "../components/ShareModal";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";
import ConfirmCopyModal from "../components/ConfirmCopyModal";
import CreateModal from "../components/CreateModal";

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

      const accessRef = doc(db, "projectAccess", user.email!);
      const accessSnap = await getDoc(accessRef);
      const accessData = accessSnap.data() || {};

      const shared: RemoteDoc[] = [];
      for (const id of Object.keys(accessData)) {
        const pSnap = await getDoc(doc(db, "projects", id));
        if (pSnap.exists()) shared.push({ id, ...(pSnap.data() as any) });
      }
      setSharedProjects(shared);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) setLocals(readLocalProjects());
  }, [user]);

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
