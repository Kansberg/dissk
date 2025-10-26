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
} from "firebase/firestore";

type RemoteDoc = {
  id: string;
  title: string;
  updatedAt?: Timestamp;
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
  const [remotes, setRemotes] = useState<RemoteDoc[]>([]);
  const [loading, setLoading] = useState(false);

  // fetch local (gæst)
  useEffect(() => {
    if (!user) setLocals(readLocalProjects());
  }, [user]);

  // fetch remote (logget ind)
  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const q = query(
          collection(db, "users", user.uid, "projects"),
          orderBy("updatedAt", "desc")
        );
        const snap = await getDocs(q);
        setRemotes(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }))
        );
      } finally {
        setLoading(false);
      }
    };
    load();
    // refetch når man kommer tilbage i fokus
    const onFocus = () => user && load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [user]);

  const items =
    user ? remotes : locals; // når man er logget ind, skal lokale ikke vises

  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      <Topbar mode="home" />
      <div style={{ marginTop: 64, padding: "24px 32px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))",
            gap: 20,
            maxWidth: 1400,
            margin: "0 auto",
          }}
        >
          {/* Opret ny */}
          <button
            onClick={() => nav("/editor/new")}
            style={{
              height: 160,
              borderRadius: 14,
              border: `2px dashed ${BRAND}`,
              background: "#fff",
              color: BRAND,
              fontWeight: 800,
              fontSize: 18,
              cursor: "pointer",
            }}
          >
            + Opret ny DISSK
          </button>

          {/* Tiles */}
          {items.map((p) => (
            <button
              key={p.id}
              onClick={() => nav(`/editor/${p.id}`)}
              style={{
                height: 160,
                borderRadius: 14,
                border: "1px solid rgba(3,66,79,.25)",
                background: "#fff",
                color: BRAND,
                textAlign: "left",
                padding: 16,
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(0,0,0,.06)",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 6 }}>
                {(p as any).title || "Unavngivet DISSK"}
              </div>
              <div style={{ opacity: 0.8, fontSize: 13 }}>
                {(p as any).updatedAt?.toDate
                  ? (p as any).updatedAt.toDate().toLocaleString()
                  : new Date((p as any).updatedAt || Date.now()).toLocaleString()}
              </div>
            </button>
          ))}
        </div>

        {user && loading && (
          <div style={{ textAlign: "center", marginTop: 12, color: "#334155" }}>
            Henter projekter…
          </div>
        )}
      </div>
    </div>
  );
}
