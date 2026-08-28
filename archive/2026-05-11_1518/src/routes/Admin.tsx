// src/routes/Admin.tsx
import { useEffect, useState, useMemo } from "react";
import Topbar from "../components/Topbar";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";

type Role = "admin" | "user";

type UserDoc = {
  uid: string;
  email: string;
  displayName?: string;
  role?: Role;
  lastLogin?: any;
};

type AccessDoc = {
  allowedDomains: string[];
  allowedEmails: string[];
};

type Tab = "access" | "users" | "activity";

const BRAND = "#03424f";

export default function Admin() {
  const { user } = useAuth() as { user: any | null | undefined };

  const [currentRole, setCurrentRole] = useState<Role | "none" | "loading">(
    "loading"
  );
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [access, setAccess] = useState<AccessDoc>({
    allowedDomains: [],
    allowedEmails: [],
  });

  // DEFAULT = adgangsstyring
  const [activeTab, setActiveTab] = useState<Tab>("access");

  const [loading, setLoading] = useState(true);
  const [savingAccess, setSavingAccess] = useState(false);
  const [error, setError] = useState<string>("");

  const [newDomain, setNewDomain] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const [searchUsers, setSearchUsers] = useState("");
  const [searchActivity, setSearchActivity] = useState("");

  const [activitySort, setActivitySort] = useState<"az" | "za" | "newest" | "oldest">("newest");


  // ---------- Helper: load everything ----------
  useEffect(() => {
    const load = async () => {
      setError("");

      if (!user) {
        setCurrentRole("none");
        setLoading(false);
        return;
      }

      try {
        // 1) Sørg for at der er et user-doc
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        let role: Role = "user";

        if (userSnap.exists()) {
          const data = userSnap.data() as any;
          role = (data.role as Role) || "user";
        } else {
          await setDoc(userRef, {
            uid: user.uid,
            email: user.email ?? "",
            emailLower: (user.email || "").toLowerCase(),
            displayName: user.displayName || "",
            role: "user",
          });
        }

        setCurrentRole(role);

        if (role !== "admin") {
          setLoading(false);
          return;
        }

        // 2) Hent alle brugere
        const usersSnap = await getDocs(collection(db, "users"));
        const userList: UserDoc[] = usersSnap.docs.map((d) => {
          const data = d.data() as any;
          return {
            uid: data.uid || d.id,
            email: data.email || "",
            displayName: data.displayName || "",
            role: (data.role as Role) || "user",
            lastLogin: data.lastLogin,
          };
        });

        // sortér admins øverst
        userList.sort((a, b) => {
          if ((a.role || "user") === (b.role || "user")) {
            return (a.email || "").localeCompare(b.email || "");
          }
          return (a.role === "admin" ? -1 : 1);
        });

        setUsers(userList);

        // 3) Hent adgangsregler
        const accessRef = doc(db, "settings", "access");
        const accessSnap = await getDoc(accessRef);
        if (accessSnap.exists()) {
          const data = accessSnap.data() as any;
          setAccess({
            allowedDomains: Array.isArray(data.allowedDomains)
              ? data.allowedDomains
              : [],
            allowedEmails: Array.isArray(data.allowedEmails)
              ? data.allowedEmails
              : [],
          });
        } else {
          setAccess({ allowedDomains: [], allowedEmails: [] });
        }
      } catch (e: any) {
        console.error(e);
        setError(e.message || "Der opstod en fejl ved indlæsning.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  const isAdmin = currentRole === "admin";

  // ---------- Brugere: rolle-skift ----------
  const updateUserRole = async (uid: string, role: Role) => {
    try {
      const ref = doc(db, "users", uid);
      await updateDoc(ref, { role });
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, role } : u))
      );
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Kunne ikke opdatere rolle.");
    }
  };

  // ---------- Brugere: fjern ----------
  const removeUser = async (uid: string) => {
    if (!window.confirm("Fjerne brugerens dokument fra Firestore?")) return;
    try {
      const ref = doc(db, "users", uid);
      await updateDoc(ref, { disabled: true });
      setUsers((prev) => prev.filter((u) => u.uid !== uid));
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Kunne ikke fjerne bruger.");
    }
  };

  // ---------- Adgang: gem ----------
  const saveAccess = async (next: AccessDoc) => {
    try {
      setSavingAccess(true);
      const ref = doc(db, "settings", "access");
      await setDoc(
        ref,
        {
          allowedDomains: next.allowedDomains,
          allowedEmails: next.allowedEmails,
        },
        { merge: true }
      );
      setAccess(next);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Kunne ikke gemme adgangsregler.");
    } finally {
      setSavingAccess(false);
    }
  };

  const addDomain = async () => {
    const dom = newDomain.trim().toLowerCase().replace(/^@/, "");
    if (!dom) return;
    if (access.allowedDomains.includes(dom)) {
      setNewDomain("");
      return;
    }
    const next = {
      ...access,
      allowedDomains: [...access.allowedDomains, dom],
    };
    setNewDomain("");
    await saveAccess(next);
  };

  const removeDomain = async (dom: string) => {
    const next = {
      ...access,
      allowedDomains: access.allowedDomains.filter((d) => d !== dom),
    };
    await saveAccess(next);
  };

  const addEmail = async () => {
    const mail = newEmail.trim().toLowerCase();
    if (!mail) return;
    if (access.allowedEmails.includes(mail)) {
      setNewEmail("");
      return;
    }
    const next = {
      ...access,
      allowedEmails: [...access.allowedEmails, mail],
    };
    setNewEmail("");
    await saveAccess(next);
  };

  const removeEmail = async (mail: string) => {
    const next = {
      ...access,
      allowedEmails: access.allowedEmails.filter((m) => m !== mail),
    };
    await saveAccess(next);
  };

  // ---------- CSV upload ----------
  const handleCsvUpload: React.ChangeEventHandler<HTMLInputElement> = async (
    e
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/);
      const emails: string[] = [];

      for (const raw of lines) {
        const trimmed = raw.trim().toLowerCase();
        if (!trimmed) continue;
        const firstCol = trimmed.split(/[;,]/)[0].trim();
        if (firstCol && !emails.includes(firstCol)) {
          emails.push(firstCol);
        }
      }

      const merged = Array.from(
        new Set([...access.allowedEmails, ...emails])
      );

      await saveAccess({
        ...access,
        allowedEmails: merged,
      });

      e.target.value = "";
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Kunne ikke læse CSV-filen.");
    }
  };

  // ---------- FILTERED LISTS ----------
  const filteredUsers = useMemo(() => {
    const q = searchUsers.toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.displayName || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
    );
  }, [searchUsers, users]);

const filteredActivity = useMemo(() => {
  const q = searchActivity.toLowerCase();

  let list = users.filter(
    (u) =>
      (u.displayName || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q)
  );

  // SORTERING
  list.sort((a, b) => {
    const nameA = (a.displayName || a.email || "").toLowerCase();
    const nameB = (b.displayName || b.email || "").toLowerCase();

    const timeA = a.lastLogin ? (a.lastLogin.seconds || a.lastLogin) : 0;
    const timeB = b.lastLogin ? (b.lastLogin.seconds || b.lastLogin) : 0;

    switch (activitySort) {
      case "az":
        return nameA.localeCompare(nameB);

      case "za":
        return nameB.localeCompare(nameA);

      case "newest":
        return timeB - timeA;

      case "oldest":
        return timeA - timeB;

      default:
        return 0;
    }
  });

  return list;
}, [searchActivity, users, activitySort]);


  // ---------- TABS ----------
  const renderUsersTab = () => (
    <div>
      <h2 style={{ color: "#000", marginTop: 0, marginBottom: 16 }}>Brugeradministration</h2>

      <input
        value={searchUsers}
        onChange={(e) => setSearchUsers(e.target.value)}
        placeholder="Søg efter navn eller email…"
        style={{
          marginBottom: 16,
          padding: "8px 10px",
          width: "100%",
          border: "1px solid #d1d5db",
          borderRadius: 6,
          fontSize: 14,
          background: "#FFF",
          color: "#000",
        }}
      />

      <div
        style={{
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          overflow: "hidden",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead style={{ background: "#f3f4f6" }}>
            <tr>
              <th style={thStyle}>Navn</th>
              <th style={thStyle}>E-mail</th>
              <th style={thStyle}>Rolle</th>
              <th style={thStyle}>Sidst aktiv</th>
              <th style={thStyle}>Handlinger</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u.uid} style={{ borderTop: "1px solid #e5e7eb" }}>
                <td style={tdStyle}>{u.displayName || "—"}</td>
                <td style={tdStyle}>{u.email}</td>
                <td style={tdStyle}>{u.role || "user"}</td>
                <td style={tdStyle}>
                  {u.lastLogin
                    ? new Date(
                        (u.lastLogin.seconds || u.lastLogin) * 1000
                      ).toLocaleString()
                    : "—"}
                </td>
                <td style={{ ...tdStyle }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => updateUserRole(u.uid, "admin")}
                      style={{
                        ...smallBtn,
                        background:
                          u.role === "admin" ? BRAND : "transparent",
                        color: u.role === "admin" ? "#fff" : BRAND,
                        borderColor: BRAND,
                      }}
                    >
                      Gør admin
                    </button>
                    <button
                      onClick={() => updateUserRole(u.uid, "user")}
                      style={{
                        ...smallBtn,
                        background:
                          u.role === "user" ? "#e5e5e5" : "transparent",
                        color: "#111827",
                        borderColor: "#d1d5db",
                      }}
                    >
                      Gør standard
                    </button>
                    <button
                      onClick={() => removeUser(u.uid)}
                      style={{
                        ...smallBtn,
                        background: "#fee2e2",
                        color: "#b91c1c",
                        borderColor: "#fecaca",
                      }}
                    >
                      Fjern
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    ...tdStyle,
                    textAlign: "center",
                    padding: 24,
                    color: "#6b7280",
                  }}
                >
                  Ingen brugere matcher din søgning.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderAccessTab = () => (
  <div style={{ color: "#000" }}>
    <h2 style={{ color: "#000", marginTop: 0, marginBottom: 16 }}>Adgangsstyring</h2>

    {/* Domæner */}
    <section style={{ marginBottom: 32 }}>
      <h3 style={{ margin: "0 0 8px", color: "#000" }}>Tilladte domæner</h3>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder="@ucn.dk"
          style={whiteInput}
        />
        <button onClick={addDomain} style={primaryBtn}>
          Tilføj
        </button>
      </div>

      {/* SCROLL BOX */}
      <div
        style={{
          maxHeight: 200,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 8,
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          background: "#fff",
        }}
      >
        {access.allowedDomains.map((dom) => (
          <span
            key={dom}
            style={{
              ...pill,
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              color: "#000",
            }}
          >
            {dom}
            <button onClick={() => removeDomain(dom)} style={pillRemoveBtn}>
              ×
            </button>
          </span>
        ))}

        {access.allowedDomains.length === 0 && (
          <div style={{ fontSize: 13, color: "#000" }}>Ingen domæner endnu.</div>
        )}
      </div>
    </section>

    {/* E-mails */}
    <section style={{ marginBottom: 32 }}>
      <h3 style={{ margin: "0 0 8px", color: "#000" }}>Tilladte e-mails</h3>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="brugernavn@ucn.dk"
          style={whiteInput}
        />
        <button onClick={addEmail} style={primaryBtn}>
          Tilføj
        </button>
      </div>

      {/* SCROLL BOX */}
      <div
        style={{
          maxHeight: 200,
          width: 300,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 8,
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          background: "#fff",
        }}
      >
        {access.allowedEmails.map((mail) => (
          <span
            key={mail}
            style={{
              ...pill,
              width: "90%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              color: "#000",
            }}
          >
            {mail}
            <button onClick={() => removeEmail(mail)} style={pillRemoveBtn}>
              ×
            </button>
          </span>
        ))}

        {access.allowedEmails.length === 0 && (
          <div style={{ fontSize: 13, color: "#000" }}>Ingen e-mails endnu.</div>
        )}
      </div>
    </section>

    {/* CSV */}
    <section>
      <h3 style={{ margin: "0 0 8px", color: "#000" }}>CSV-upload</h3>
      <input type="file" accept=".csv" onChange={handleCsvUpload} />
    </section>

    {savingAccess && (
      <div style={{ marginTop: 16, fontSize: 13, color: "#000" }}>
        Gemmer…
      </div>
    )}
  </div>
);


  const renderActivityTab = () => (
<div>
  <h2 style={{ color: "#000", marginTop: 0, marginBottom: 4 }}>Aktivitet</h2>
  <p style={{ color: "#000", marginTop: 0, marginBottom: 16, fontSize: 14 }}>
    Se seneste aktivitet
  </p>


   <div
  style={{
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  }}
>
  {/* Søgefelt */}
  <input
    value={searchActivity}
    onChange={(e) => setSearchActivity(e.target.value)}
    placeholder="Søg efter navn eller email…"
    style={{
      padding: "8px 10px",
      flex: 1,
      border: "1px solid #d1d5db",
      borderRadius: 6,
      fontSize: 14,
      color: "#000",
      background: "#FFF",
    }}
  />

  {/* Sortering */}
  <select
    value={activitySort}
    onChange={(e) => setActivitySort(e.target.value as any)}
    style={{
      padding: "8px 10px",
      borderRadius: 6,
      border: "1px solid #d1d5db",
      fontSize: 14,
      background: "#fff",
      color: "#000",
      height: "100%", // samme højde som input
      whiteSpace: "nowrap",
    }}
  >
    <option value="newest">Seneste aktivitet</option>
    <option value="az">A–Z</option>
    <option value="za">Z–A</option>
    <option value="oldest">Ældste aktivitet</option>
  </select>
</div>



    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
  {filteredActivity.map((u) => (
    <li
      key={u.uid}
      style={{
        padding: "14px 0",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: 14,
        color: "#000",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <strong style={{ color: "#000" }}>
          {u.displayName || u.email}
        </strong>

        {/* EMAIL */}
        <span style={{ color: "#4b5563", fontSize: 13 }}>
          {u.email}
        </span>

        {/* ROLE */}
        <span style={{ color: "#6b7280", fontSize: 12 }}>
          ({u.role || "user"})
        </span>
      </div>

      {/* LAST LOGIN — SEPARAT LINJE OG TYDELIG LUFT */}
      <span style={{ color: "#4b5563", fontSize: 13, marginLeft: 20 }}>
        {u.lastLogin
          ? new Date(
              (u.lastLogin.seconds || u.lastLogin) * 1000
            ).toLocaleString()
          : "Ingen data"}
      </span>
    </li>
  ))}

  {filteredActivity.length === 0 && (
    <li style={{ padding: "12px 0", color: "#6b7280" }}>
      Ingen resultater.
    </li>
  )}
</ul>

    </div>
  );

  // ---------- Render ----------
  if (loading) {
    return (
      <div style={{ background: "#fff", minHeight: "100vh" }}>
        <Topbar mode="home" />
        <div
          style={{
            paddingTop: 80,
            textAlign: "center",
            color: "#4b5563",
          }}
        >
          Henter admin-data…
        </div>
      </div>
    );
  }

  if (!user || currentRole === "none") {
    return (
      <div style={{ background: "#fff", minHeight: "100vh" }}>
        <Topbar mode="home" />
        <div style={{ paddingTop: 80, textAlign: "center", color: "#4b5563" }}>
          Du skal være logget ind for at få adgang til admin.
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ background: "#fff", minHeight: "100vh" }}>
        <Topbar mode="home" />
        <div style={{ paddingTop: 80, textAlign: "center", color: "#4b5563" }}>
          Du har ikke rettigheder til admin. Kontakt administrator.
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      <Topbar mode="home" />
      <div
        style={{
          paddingTop: 72,
          paddingInline: 24,
          maxWidth: 1200,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "220px 1fr",
          gap: 24,
        }}
      >
        {/* Sidebar */}
        <aside
          style={{
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            padding: 16,
            background: "#f9fafb",
          }}
        >
          <h2
            style={{
              fontSize: 16,
              marginTop: 0,
              marginBottom: 12,
              color: "#111827",
            }}
          >
            Admin
          </h2>

          <nav
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              fontSize: 14,
            }}
          >
            <button
              onClick={() => setActiveTab("access")}
              style={{
                ...navBtn,
                background:
                  activeTab === "access" ? "#e0f2fe" : "transparent",
              }}
            >
              Adgangsstyring
            </button>

            <button
              onClick={() => setActiveTab("users")}
              style={{
                ...navBtn,
                background:
                  activeTab === "users" ? "#e0f2fe" : "transparent",
              }}
            >
              Brugeradministration
            </button>

            <button
              onClick={() => setActiveTab("activity")}
              style={{
                ...navBtn,
                background:
                  activeTab === "activity" ? "#e0f2fe" : "transparent",
              }}
            >
              Aktivitet
            </button>
          </nav>
        </aside>

        {/* Main content */}
        <main style={{ paddingBottom: 40 }}>
          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                borderRadius: 8,
                background: "#fee2e2",
                color: "#b91c1c",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {activeTab === "access" && renderAccessTab()}
          {activeTab === "users" && renderUsersTab()}
          {activeTab === "activity" && renderActivityTab()}
        </main>
      </div>
    </div>
  );
}

// ---------- Styles ----------
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontWeight: 600,
  fontSize: 13,
  color: "#374151",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 13,
  color: "#111827",
  verticalAlign: "top",
};

const smallBtn: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid transparent",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  background: "transparent",
};

const primaryBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 6,
  border: "none",
  background: BRAND,
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 14,
};

const whiteInput: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  fontSize: 14,
  background: "#fff",
  color: "#000",
  flex: 1,
};

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px",
  borderRadius: 999,
  background: "#e5e7eb",
  color: "#000",
  fontSize: 12,
};

const pillRemoveBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
  color: "#000",
};

const navBtn: React.CSSProperties = {
  border: "none",
  borderRadius: 8,
  padding: "8px 10px",
  textAlign: "left",
  cursor: "pointer",
  background: "transparent",
  fontSize: 14,
  color: "#111827",
};

