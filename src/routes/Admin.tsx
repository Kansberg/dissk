import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import Topbar from "../components/Topbar";
import AdminExportPanel from "../components/AdminExportPanel";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import { isSuperadminUid, SUPERADMIN_EMAIL } from "../constants/superadmin";
import {
  ARCHIVE_DELAY_DAYS,
  archiveTimestampForEndDate,
  dateInputToTimestamp,
  defaultUserEndDate,
  isArchiveDue,
  timestampToDateInput,
} from "../utils/userLifecycle";
import {
  DEFAULT_MINI_DISSK_ACCESS,
  type MiniDisskAccessSettings,
} from "../utils/miniDisskAccess";
import "./Admin.css";

type Role = "superadmin" | "admin" | "user";
type Tab =
  | "access"
  | "users"
  | "groups"
  | "miniAccess"
  | "activity"
  | "archive"
  | "exports";
type AccessMode = "domain" | "single";

type UserDoc = {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  disabled?: boolean;
  lastLogin?: any;
  endDate?: any;
  archiveAt?: any;
  archivedAt?: any;
  groupId?: string;
  groupName?: string;
};

type GroupDoc = {
  id: string;
  name: string;
  endDate: any;
  archiveAt: any;
  createdAt?: any;
};

type AccessDoc = {
  allowedDomains: string[];
  allowedEmails: string[];
};

const EMPTY_ACCESS: AccessDoc = { allowedDomains: [], allowedEmails: [] };

const parseEmails = (value: string): string[] =>
  Array.from(
    new Set(
      value
        .split(/[\s,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    )
  );

const formatTimestamp = (value: any): string => {
  if (!value) return "—";
  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleString("da-DK");
  }
  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000).toLocaleString("da-DK");
  }
  return "—";
};

const roleLabel = (role: Role): string => {
  if (role === "superadmin") return "Superadmin";
  if (role === "admin") return "Admin";
  return "Standard";
};

export default function Admin() {
  const { user } = useAuth() as { user: any | null | undefined };
  const [currentRole, setCurrentRole] = useState<Role | "none" | "loading">("loading");
  const [activeTab, setActiveTab] = useState<Tab>("access");
  const [accessMode, setAccessMode] = useState<AccessMode>("domain");
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [groups, setGroups] = useState<GroupDoc[]>([]);
  const [archivedUsers, setArchivedUsers] = useState<UserDoc[]>([]);
  const [access, setAccess] = useState<AccessDoc>(EMPTY_ACCESS);
  const [miniAccess, setMiniAccess] = useState<MiniDisskAccessSettings>(
    DEFAULT_MINI_DISSK_ACCESS
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [newDomain, setNewDomain] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newUserEndDate, setNewUserEndDate] = useState(defaultUserEndDate());
  const [searchUsers, setSearchUsers] = useState("");
  const [searchActivity, setSearchActivity] = useState("");
  const [searchMiniAccess, setSearchMiniAccess] = useState("");
  const [activitySort, setActivitySort] = useState<"newest" | "oldest" | "az" | "za">(
    "newest"
  );

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardName, setWizardName] = useState("");
  const [wizardEndDate, setWizardEndDate] = useState(defaultUserEndDate());
  const [wizardEmails, setWizardEmails] = useState("");

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupEndDate, setEditingGroupEndDate] = useState("");
  const [editingGroupEmails, setEditingGroupEmails] = useState("");

  const isSuperadmin = currentRole === "superadmin";
  const isAdmin = currentRole === "admin" || currentRole === "superadmin";

  const loadCollections = async (role: Role) => {
    const requests: Promise<any>[] = [
      getDocs(collection(db, "users")),
      getDoc(doc(db, "settings", "access")),
      getDocs(collection(db, "groups")),
      getDoc(doc(db, "settings", "miniDisskAccess")),
    ];
    if (role === "superadmin") requests.push(getDocs(collection(db, "archivedUsers")));

    const [
      usersSnapshot,
      accessSnapshot,
      groupsSnapshot,
      miniAccessSnapshot,
      archiveSnapshot,
    ] =
      await Promise.all(requests);

    const nextUsers: UserDoc[] = usersSnapshot.docs
      .map((snapshot: any) => {
        const data = snapshot.data();
        return {
          uid: data.uid || snapshot.id,
          email: data.email || data.emailLower || "",
          displayName: data.displayName || "",
          role: data.role || "user",
          disabled: !!data.disabled,
          lastLogin: data.lastLogin,
          endDate: data.endDate,
          archiveAt: data.archiveAt,
          groupId: data.groupId,
          groupName: data.groupName,
        } as UserDoc;
      })
      .filter((listedUser: UserDoc) => !listedUser.disabled && !isArchiveDue(listedUser.archiveAt));

    nextUsers.sort((a, b) => {
      const roleOrder = { superadmin: 0, admin: 1, user: 2 };
      const roleDifference = roleOrder[a.role] - roleOrder[b.role];
      if (roleDifference !== 0) return roleDifference;
      return (a.displayName || a.email).localeCompare(b.displayName || b.email, "da");
    });

    const accessData = accessSnapshot.exists() ? accessSnapshot.data() : {};
    setAccess({
      allowedDomains: Array.isArray(accessData.allowedDomains)
        ? accessData.allowedDomains
        : [],
      allowedEmails: Array.isArray(accessData.allowedEmails)
        ? accessData.allowedEmails
        : [],
    });
    setUsers(nextUsers);

    const nextGroups: GroupDoc[] = groupsSnapshot.docs.map((snapshot: any) => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        name: data.name || "Unavngiven gruppe",
        endDate: data.endDate,
        archiveAt: data.archiveAt,
        createdAt: data.createdAt,
      };
    });
    nextGroups.sort((a, b) => a.name.localeCompare(b.name, "da"));
    setGroups(nextGroups);

    const miniAccessData = miniAccessSnapshot.exists()
      ? miniAccessSnapshot.data()
      : DEFAULT_MINI_DISSK_ACCESS;
    setMiniAccess({
      allowedEmails: Array.from(
        new Set([
          SUPERADMIN_EMAIL.toLowerCase(),
          ...(Array.isArray(miniAccessData.allowedEmails)
            ? miniAccessData.allowedEmails.map((email: string) => email.toLowerCase())
            : []),
        ])
      ),
      allowedGroupIds: Array.isArray(miniAccessData.allowedGroupIds)
        ? miniAccessData.allowedGroupIds
        : [],
    });

    if (role === "superadmin" && archiveSnapshot) {
      const nextArchive = archiveSnapshot.docs.map((snapshot: any) => {
        const data = snapshot.data();
        return {
          uid: data.uid || data.sourceUserId || snapshot.id,
          email: data.email || data.emailLower || "",
          displayName: data.displayName || "",
          role: data.role || "user",
          lastLogin: data.lastLogin,
          endDate: data.endDate,
          archiveAt: data.archiveAt,
          archivedAt: data.archivedAt,
          groupId: data.groupId,
          groupName: data.groupName,
        } as UserDoc;
      });
      nextArchive.sort((a: UserDoc, b: UserDoc) => a.email.localeCompare(b.email, "da"));
      setArchivedUsers(nextArchive);
    } else {
      setArchivedUsers([]);
    }
  };

  useEffect(() => {
    const load = async () => {
      setError("");
      if (!user) {
        setCurrentRole("none");
        setLoading(false);
        return;
      }

      try {
        const userRef = doc(db, "users", user.uid);
        const userSnapshot = await getDoc(userRef);
        let role: Role = isSuperadminUid(user.uid) ? "superadmin" : "user";

        if (userSnapshot.exists()) {
          const storedRole = userSnapshot.data().role;
          if (storedRole === "admin" || storedRole === "superadmin") role = storedRole;
          if (isSuperadminUid(user.uid)) role = "superadmin";
        } else {
          await setDoc(
            userRef,
            {
              uid: user.uid,
              email: user.email || "",
              emailLower: (user.email || "").toLowerCase(),
              displayName: user.displayName || "",
              role,
            },
            { merge: true }
          );
        }

        setCurrentRole(role);
        if (role === "admin" || role === "superadmin") await loadCollections(role);
      } catch (loadError: any) {
        console.error(loadError);
        setError(loadError.message || "Kunne ikke hente administrationsdata.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  const runAction = async (
    label: string,
    action: () => Promise<void>,
    successMessage?: string
  ): Promise<boolean> => {
    if (!isAdmin) return false;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await action();
      await loadCollections(currentRole as Role);
      if (successMessage) setNotice(successMessage);
      return true;
    } catch (actionError: any) {
      console.error(actionError);
      setError(actionError.message || "Handlingen kunne ikke gennemføres.");
      return false;
    } finally {
      setBusy("");
    }
  };

  const saveAccess = async (next: AccessDoc) => {
    await setDoc(doc(db, "settings", "access"), next, { merge: true });
  };

  const saveMiniAccess = async (next: MiniDisskAccessSettings) => {
    await runAction(
      "Gemmer MiniDISSK-adgang",
      () =>
        setDoc(
          doc(db, "settings", "miniDisskAccess"),
          {
            allowedEmails: Array.from(
              new Set([SUPERADMIN_EMAIL.toLowerCase(), ...next.allowedEmails])
            ),
            allowedGroupIds: Array.from(new Set(next.allowedGroupIds)),
            updatedAt: serverTimestamp(),
            updatedBy: user?.uid || "",
          },
          { merge: true }
        ),
      "MiniDISSK-adgangen er opdateret."
    );
  };

  const toggleMiniUser = async (email: string) => {
    const emailLower = email.toLowerCase();
    if (!emailLower || emailLower === SUPERADMIN_EMAIL.toLowerCase()) return;
    const hasAccess = miniAccess.allowedEmails.includes(emailLower);
    await saveMiniAccess({
      ...miniAccess,
      allowedEmails: hasAccess
        ? miniAccess.allowedEmails.filter((item) => item !== emailLower)
        : [...miniAccess.allowedEmails, emailLower],
    });
  };

  const toggleMiniGroup = async (groupId: string) => {
    const hasAccess = miniAccess.allowedGroupIds.includes(groupId);
    await saveMiniAccess({
      ...miniAccess,
      allowedGroupIds: hasAccess
        ? miniAccess.allowedGroupIds.filter((item) => item !== groupId)
        : [...miniAccess.allowedGroupIds, groupId],
    });
  };

  const addDomain = async () => {
    const domain = newDomain.trim().toLowerCase().replace(/^@/, "");
    if (!domain) return;
    const next = {
      ...access,
      allowedDomains: Array.from(new Set([...access.allowedDomains, domain])),
    };
    const saved = await runAction(
      "Gemmer domæne",
      () => saveAccess(next),
      `@${domain} er godkendt.`
    );
    if (saved) setNewDomain("");
  };

  const removeDomain = async (domain: string) => {
    const next = {
      ...access,
      allowedDomains: access.allowedDomains.filter((item) => item !== domain),
    };
    await runAction("Fjerner domæne", () => saveAccess(next));
  };

  const upsertUsers = async (
    emails: string[],
    endDateValue: string,
    group?: GroupDoc
  ) => {
    if (emails.length === 0) return;
    const endDate = dateInputToTimestamp(endDateValue);
    const archiveAt = archiveTimestampForEndDate(endDateValue);
    const usersByEmail = new Map(users.map((item) => [item.email.toLowerCase(), item]));
    const nextAllowedEmails = Array.from(new Set([...access.allowedEmails, ...emails]));

    for (let offset = 0; offset < emails.length; offset += 350) {
      const batch = writeBatch(db);
      if (offset === 0) {
        batch.set(
          doc(db, "settings", "access"),
          { allowedEmails: nextAllowedEmails },
          { merge: true }
        );
      }

      for (const email of emails.slice(offset, offset + 350)) {
        const existingUser = usersByEmail.get(email);
        const userId = existingUser?.uid || email;
        batch.set(
          doc(db, "users", userId),
          {
            ...(!existingUser
              ? {
                  uid: userId,
                  email,
                  emailLower: email,
                  displayName: "",
                  role: "user",
                  disabled: false,
                  createdAt: serverTimestamp(),
                }
              : {}),
            endDate,
            archiveAt,
            archiveDelayDays: ARCHIVE_DELAY_DAYS,
            lifecycleManagedByAdmin: true,
            ...(group ? { groupId: group.id, groupName: group.name } : {}),
          },
          { merge: true }
        );
      }
      await batch.commit();
    }
  };

  const createSingleUser = async () => {
    const emails = parseEmails(newEmail);
    if (emails.length !== 1 || !newUserEndDate) {
      setError("Indtast én gyldig e-mailadresse og en slutdato.");
      return;
    }
    const created = await runAction(
      "Opretter bruger",
      () => upsertUsers(emails, newUserEndDate),
      `${emails[0]} er oprettet.`
    );
    if (created) {
      setNewEmail("");
      setNewUserEndDate(defaultUserEndDate());
    }
  };

  const removeAllowedEmail = async (email: string) => {
    await runAction("Fjerner e-mail", () =>
      saveAccess({
        ...access,
        allowedEmails: access.allowedEmails.filter((item) => item !== email),
      })
    );
  };

  const importCsv: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const emails = parseEmails(await file.text());
    if (emails.length === 0) {
      setError("CSV-filen indeholdt ingen gyldige e-mailadresser.");
      return;
    }
    const imported = await runAction(
      "Importerer brugere",
      () => upsertUsers(emails, newUserEndDate),
      `${emails.length} brugere er importeret.`
    );
    if (imported) event.target.value = "";
  };

  const updateUserEndDate = async (listedUser: UserDoc, endDateValue: string) => {
    if (!endDateValue || listedUser.role === "superadmin") return;
    await runAction("Opdaterer slutdato", () =>
      updateDoc(doc(db, "users", listedUser.uid), {
        endDate: dateInputToTimestamp(endDateValue),
        archiveAt: archiveTimestampForEndDate(endDateValue),
        archiveDelayDays: ARCHIVE_DELAY_DAYS,
        lifecycleManagedByAdmin: true,
      })
    );
  };

  const updateUserRole = async (listedUser: UserDoc, role: Role) => {
    if (listedUser.role === "superadmin" || role === "superadmin") return;
    await runAction("Opdaterer rolle", () =>
      updateDoc(doc(db, "users", listedUser.uid), { role })
    );
  };

  const disableUser = async (listedUser: UserDoc) => {
    if (listedUser.role === "superadmin") return;
    if (!window.confirm(`Deaktivér ${listedUser.email}?`)) return;
    await runAction("Deaktiverer bruger", () =>
      updateDoc(doc(db, "users", listedUser.uid), { disabled: true })
    );
  };

  const moveUserToGroup = async (listedUser: UserDoc, groupId: string) => {
    const group = groups.find((item) => item.id === groupId);
    await runAction("Flytter bruger", async () => {
      if (!group) {
        await updateDoc(doc(db, "users", listedUser.uid), {
          groupId: deleteField(),
          groupName: deleteField(),
        });
        return;
      }
      await updateDoc(doc(db, "users", listedUser.uid), {
        groupId: group.id,
        groupName: group.name,
        endDate: group.endDate,
        archiveAt: group.archiveAt,
        archiveDelayDays: ARCHIVE_DELAY_DAYS,
        lifecycleManagedByAdmin: true,
      });
    });
  };

  const openGroupWizard = () => {
    setWizardStep(1);
    setWizardName("");
    setWizardEndDate(defaultUserEndDate());
    setWizardEmails("");
    setWizardOpen(true);
  };

  const openGroupWizardForUser = (listedUser: UserDoc) => {
    setWizardStep(1);
    setWizardName("");
    setWizardEndDate(timestampToDateInput(listedUser.endDate) || defaultUserEndDate());
    setWizardEmails(listedUser.email);
    setWizardOpen(true);
  };

  const createGroup = async () => {
    const name = wizardName.trim();
    if (!name || !wizardEndDate) return;
    if (groups.some((group) => group.name.toLowerCase() === name.toLowerCase())) {
      setError("Der findes allerede en gruppe med dette navn.");
      return;
    }

    const groupRef = doc(collection(db, "groups"));
    const endDate = dateInputToTimestamp(wizardEndDate);
    const archiveAt = archiveTimestampForEndDate(wizardEndDate);
    const newGroup: GroupDoc = { id: groupRef.id, name, endDate, archiveAt };
    const emails = parseEmails(wizardEmails);

    const created = await runAction(
      "Opretter gruppe",
      async () => {
        await setDoc(groupRef, {
          name,
          endDate,
          archiveAt,
          archiveDelayDays: ARCHIVE_DELAY_DAYS,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: user?.uid || "",
        });
        await upsertUsers(emails, wizardEndDate, newGroup);
      },
      `${name} er oprettet med ${emails.length} brugere.`
    );
    if (created) {
      setWizardOpen(false);
      setActiveTab("groups");
    }
  };

  const openGroupEditor = (group: GroupDoc) => {
    setEditingGroupId(group.id);
    setEditingGroupEndDate(timestampToDateInput(group.endDate));
    setEditingGroupEmails("");
  };

  const saveGroupDate = async (group: GroupDoc) => {
    if (!editingGroupEndDate) return;
    const members = users.filter((listedUser) => listedUser.groupId === group.id);
    const endDate = dateInputToTimestamp(editingGroupEndDate);
    const archiveAt = archiveTimestampForEndDate(editingGroupEndDate);

    await runAction(
      "Opdaterer gruppe",
      async () => {
        if (members.length === 0) {
          await updateDoc(doc(db, "groups", group.id), {
            endDate,
            archiveAt,
            archiveDelayDays: ARCHIVE_DELAY_DAYS,
            updatedAt: serverTimestamp(),
          });
          return;
        }

        for (let offset = 0; offset < members.length; offset += 350) {
          const batch = writeBatch(db);
          if (offset === 0) {
            batch.update(doc(db, "groups", group.id), {
              endDate,
              archiveAt,
              archiveDelayDays: ARCHIVE_DELAY_DAYS,
              updatedAt: serverTimestamp(),
            });
          }
          for (const member of members.slice(offset, offset + 350)) {
            batch.update(doc(db, "users", member.uid), {
              endDate,
              archiveAt,
              archiveDelayDays: ARCHIVE_DELAY_DAYS,
              lifecycleManagedByAdmin: true,
            });
          }
          await batch.commit();
        }
      },
      `Slutdatoen for ${group.name} er opdateret.`
    );
  };

  const addUsersToGroup = async (group: GroupDoc) => {
    const emails = parseEmails(editingGroupEmails);
    if (emails.length === 0) {
      setError("Indtast mindst én gyldig e-mailadresse.");
      return;
    }
    const added = await runAction(
      "Tilføjer gruppemedlemmer",
      () => upsertUsers(emails, timestampToDateInput(group.endDate), group),
      `${emails.length} brugere er tilføjet til ${group.name}.`
    );
    if (added) setEditingGroupEmails("");
  };

  const removeUserFromGroup = async (listedUser: UserDoc) => {
    await runAction("Fjerner gruppemedlem", () =>
      updateDoc(doc(db, "users", listedUser.uid), {
        groupId: deleteField(),
        groupName: deleteField(),
      })
    );
  };

  const deleteGroup = async (group: GroupDoc) => {
    const members = users.filter((listedUser) => listedUser.groupId === group.id);
    if (
      !window.confirm(
        `Slet gruppen “${group.name}”? De ${members.length} brugere beholdes som enkeltbrugere.`
      )
    ) {
      return;
    }

    const deleted = await runAction(
      "Sletter gruppe",
      async () => {
        if (members.length === 0) {
          const batch = writeBatch(db);
          batch.delete(doc(db, "groups", group.id));
          await batch.commit();
          return;
        }
        for (let offset = 0; offset < members.length; offset += 350) {
          const batch = writeBatch(db);
          if (offset === 0) batch.delete(doc(db, "groups", group.id));
          for (const member of members.slice(offset, offset + 350)) {
            batch.update(doc(db, "users", member.uid), {
              groupId: deleteField(),
              groupName: deleteField(),
            });
          }
          await batch.commit();
        }
      },
      `${group.name} er slettet. Brugerne er bevaret.`
    );
    if (deleted) setEditingGroupId(null);
  };

  const filteredUsers = useMemo(() => {
    const query = searchUsers.trim().toLowerCase();
    if (!query) return users;
    return users.filter(
      (listedUser) =>
        listedUser.displayName.toLowerCase().includes(query) ||
        listedUser.email.toLowerCase().includes(query) ||
        (listedUser.groupName || "").toLowerCase().includes(query)
    );
  }, [searchUsers, users]);

  const filteredActivity = useMemo(() => {
    const query = searchActivity.trim().toLowerCase();
    const result = users.filter(
      (listedUser) =>
        listedUser.displayName.toLowerCase().includes(query) ||
        listedUser.email.toLowerCase().includes(query)
    );
    result.sort((a, b) => {
      const nameA = (a.displayName || a.email).toLowerCase();
      const nameB = (b.displayName || b.email).toLowerCase();
      const timeA = a.lastLogin?.seconds || 0;
      const timeB = b.lastLogin?.seconds || 0;
      if (activitySort === "az") return nameA.localeCompare(nameB, "da");
      if (activitySort === "za") return nameB.localeCompare(nameA, "da");
      if (activitySort === "oldest") return timeA - timeB;
      return timeB - timeA;
    });
    return result;
  }, [activitySort, searchActivity, users]);

  const filteredMiniUsers = useMemo(() => {
    const query = searchMiniAccess.trim().toLowerCase();
    return users.filter(
      (listedUser) =>
        !!listedUser.email &&
        (!query ||
          listedUser.email.toLowerCase().includes(query) ||
          listedUser.displayName.toLowerCase().includes(query) ||
          (listedUser.groupName || "").toLowerCase().includes(query))
    );
  }, [searchMiniAccess, users]);

  const editingGroup = groups.find((group) => group.id === editingGroupId) || null;
  const editingGroupMembers = editingGroup
    ? users.filter((listedUser) => listedUser.groupId === editingGroup.id)
    : [];
  const wizardMemberCount = parseEmails(wizardEmails).length;

  if (loading) {
    return (
      <div className="admin-page">
        <Topbar mode="home" />
        <div className="admin-state">Henter administrationsdata…</div>
      </div>
    );
  }

  if (!user || currentRole === "none") {
    return (
      <div className="admin-page">
        <Topbar mode="home" />
        <div className="admin-state">Du skal være logget ind for at få adgang.</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <Topbar mode="home" />
        <div className="admin-state">Du har ikke administratorrettigheder.</div>
      </div>
    );
  }

  const navItems: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "access", label: "Adgangsstyring" },
    { id: "users", label: "Brugeroversigt", count: users.length },
    { id: "groups", label: "Grupper", count: groups.length },
    {
      id: "miniAccess",
      label: "MiniDISSK-adgang",
      count: miniAccess.allowedEmails.length + miniAccess.allowedGroupIds.length,
    },
    { id: "activity", label: "Aktivitet" },
    ...(isSuperadmin
      ? [
          { id: "archive" as Tab, label: "Arkiv", count: archivedUsers.length },
          { id: "exports" as Tab, label: "Eksport" },
        ]
      : []),
  ];

  return (
    <div className="admin-page">
      <Topbar mode="home" />
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-brand-block">
            <span className="admin-eyebrow">Administration</span>
            <strong>DISSK</strong>
          </div>
          <nav className="admin-nav" aria-label="Administration">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={activeTab === item.id ? "active" : ""}
                onClick={() => setActiveTab(item.id)}
              >
                <span>{item.label}</span>
                {typeof item.count === "number" && <small>{item.count}</small>}
              </button>
            ))}
          </nav>
          <div className="admin-sidebar-note">
            Arkivering sker {ARCHIVE_DELAY_DAYS} dage efter slutdato.
          </div>
        </aside>

        <main className="admin-content">
          {busy && <div className="admin-progress">{busy}…</div>}
          {error && <div className="admin-alert error">{error}</div>}
          {notice && <div className="admin-alert success">{notice}</div>}

          {activeTab === "access" && (
            <section>
              <header className="admin-section-header">
                <div>
                  <span className="admin-eyebrow">Adgang</span>
                  <h1>Adgangsstyring</h1>
                  <p>Godkend et domæne, opret en enkelt bruger eller administrér et hold samlet.</p>
                </div>
              </header>

              <div className="admin-action-grid">
                <button
                  type="button"
                  className={`admin-action-card ${accessMode === "domain" ? "selected" : ""}`}
                  onClick={() => setAccessMode("domain")}
                >
                  <span className="admin-action-number">01</span>
                  <strong>Godkend domæne</strong>
                  <small>Giv alle på et e-maildomæne adgang.</small>
                </button>
                <button
                  type="button"
                  className={`admin-action-card ${accessMode === "single" ? "selected" : ""}`}
                  onClick={() => setAccessMode("single")}
                >
                  <span className="admin-action-number">02</span>
                  <strong>Opret enkeltbruger</strong>
                  <small>Opret én bruger med en individuel slutdato.</small>
                </button>
                <button type="button" className="admin-action-card" onClick={openGroupWizard}>
                  <span className="admin-action-number">03</span>
                  <strong>Opret i en gruppe</strong>
                  <small>Opret et hold og styr datoer og medlemmer samlet.</small>
                </button>
              </div>

              {accessMode === "domain" && (
                <div className="admin-card admin-access-panel">
                  <div className="admin-card-heading">
                    <div>
                      <h2>Godkendte domæner</h2>
                      <p>Nye brugere på domænet får automatisk den foreslåede slutdato.</p>
                    </div>
                    <span className="admin-count">{access.allowedDomains.length}</span>
                  </div>
                  <div className="admin-inline-form">
                    <label>
                      Domæne
                      <input
                        value={newDomain}
                        onChange={(event) => setNewDomain(event.target.value)}
                        placeholder="ucn.dk"
                        onKeyDown={(event) => event.key === "Enter" && addDomain()}
                      />
                    </label>
                    <button className="admin-primary-button" type="button" onClick={addDomain}>
                      Godkend domæne
                    </button>
                  </div>
                  <div className="admin-chip-list">
                    {access.allowedDomains.map((domain) => (
                      <span className="admin-chip" key={domain}>
                        @{domain}
                        <button type="button" onClick={() => removeDomain(domain)} aria-label={`Fjern ${domain}`}>
                          ×
                        </button>
                      </span>
                    ))}
                    {access.allowedDomains.length === 0 && (
                      <span className="admin-empty-inline">Ingen domæner er godkendt.</span>
                    )}
                  </div>
                </div>
              )}

              {accessMode === "single" && (
                <div className="admin-card admin-access-panel">
                  <div className="admin-card-heading">
                    <div>
                      <h2>Opret enkeltbruger</h2>
                      <p>Slutdatoen foreslås automatisk, men kan ændres før oprettelse.</p>
                    </div>
                  </div>
                  <div className="admin-form-grid three">
                    <label>
                      E-mail
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(event) => setNewEmail(event.target.value)}
                        placeholder="bruger@ucn.dk"
                      />
                    </label>
                    <label>
                      Slutdato
                      <input
                        type="date"
                        value={newUserEndDate}
                        onChange={(event) => setNewUserEndDate(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="admin-primary-button align-end"
                      onClick={createSingleUser}
                    >
                      Opret bruger
                    </button>
                  </div>
                  <div className="admin-import-row">
                    <div>
                      <strong>Opret flere enkeltbrugere fra CSV</strong>
                      <small>Alle importerede brugere får datoen ovenfor.</small>
                    </div>
                    <label className="admin-secondary-button file-button">
                      Vælg CSV
                      <input type="file" accept=".csv,text/csv" onChange={importCsv} />
                    </label>
                  </div>
                  <details className="admin-email-details">
                    <summary>{access.allowedEmails.length} individuelt godkendte e-mails</summary>
                    <div className="admin-email-list">
                      {access.allowedEmails.map((email) => (
                        <div key={email}>
                          <span>{email}</span>
                          <button type="button" onClick={() => removeAllowedEmail(email)}>
                            Fjern adgang
                          </button>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              )}
            </section>
          )}

          {activeTab === "users" && (
            <section>
              <header className="admin-section-header split">
                <div>
                  <span className="admin-eyebrow">Brugere</span>
                  <h1>Brugeroversigt</h1>
                  <p>Navn synkroniseres automatisk, når brugeren har været logget ind.</p>
                </div>
                <div className="admin-stat"><strong>{users.length}</strong><span>aktive brugere</span></div>
              </header>
              <div className="admin-toolbar">
                <input
                  className="admin-search"
                  value={searchUsers}
                  onChange={(event) => setSearchUsers(event.target.value)}
                  placeholder="Søg efter navn, e-mail eller gruppe"
                />
                <button className="admin-primary-button" type="button" onClick={openGroupWizard}>
                  Ny gruppe
                </button>
              </div>
              <div className="admin-table-card">
                <table className="admin-table users-table">
                  <thead>
                    <tr>
                      <th>Bruger</th>
                      <th>Gruppe</th>
                      <th>Rolle</th>
                      <th>Slutdato</th>
                      <th>Arkiveres</th>
                      <th>Sidst aktiv</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((listedUser) => (
                      <tr key={listedUser.uid}>
                        <td>
                          <div className="admin-user-cell">
                            <span className="admin-avatar">
                              {(listedUser.displayName || listedUser.email || "?")[0].toUpperCase()}
                            </span>
                            <div>
                              <strong>{listedUser.displayName || "Navn ikke registreret"}</strong>
                              <small>{listedUser.email}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <select
                            value={listedUser.groupId || ""}
                            onChange={(event) =>
                              event.target.value === "__new__"
                                ? openGroupWizardForUser(listedUser)
                                : moveUserToGroup(listedUser, event.target.value)
                            }
                            disabled={listedUser.role === "superadmin"}
                          >
                            <option value="">Ingen gruppe</option>
                            {groups.map((group) => (
                              <option key={group.id} value={group.id}>{group.name}</option>
                            ))}
                            <option value="__new__">+ Opret ny gruppe…</option>
                          </select>
                        </td>
                        <td>
                          <select
                            value={listedUser.role}
                            onChange={(event) => updateUserRole(listedUser, event.target.value as Role)}
                            disabled={listedUser.role === "superadmin"}
                          >
                            {listedUser.role === "superadmin" && <option value="superadmin">Superadmin</option>}
                            <option value="user">Standard</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td>
                          {listedUser.role === "superadmin" ? (
                            <span className="admin-muted">Ingen</span>
                          ) : (
                            <input
                              type="date"
                              value={timestampToDateInput(listedUser.endDate)}
                              onChange={(event) => updateUserEndDate(listedUser, event.target.value)}
                            />
                          )}
                        </td>
                        <td>{timestampToDateInput(listedUser.archiveAt) || "—"}</td>
                        <td>{formatTimestamp(listedUser.lastLogin)}</td>
                        <td>
                          <button
                            type="button"
                            className="admin-danger-link"
                            disabled={listedUser.role === "superadmin"}
                            onClick={() => disableUser(listedUser)}
                          >
                            Deaktivér
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={7} className="admin-empty-cell">Ingen brugere matcher søgningen.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "groups" && (
            <section>
              <header className="admin-section-header split">
                <div>
                  <span className="admin-eyebrow">Holdstyring</span>
                  <h1>Grupper</h1>
                  <p>Datoændringer på en gruppe slår igennem på alle gruppens brugere.</p>
                </div>
                <button className="admin-primary-button" type="button" onClick={openGroupWizard}>
                  Opret gruppe
                </button>
              </header>
              <div className="admin-group-grid">
                {groups.map((group) => {
                  const members = users.filter((listedUser) => listedUser.groupId === group.id);
                  return (
                    <article className="admin-group-card" key={group.id}>
                      <div className="admin-group-card-top">
                        <span className="admin-group-icon">{group.name.slice(0, 2).toUpperCase()}</span>
                        <span className="admin-count">{members.length} brugere</span>
                      </div>
                      <h2>{group.name}</h2>
                      <dl>
                        <div><dt>Slutdato</dt><dd>{timestampToDateInput(group.endDate)}</dd></div>
                        <div><dt>Arkiveres</dt><dd>{timestampToDateInput(group.archiveAt)}</dd></div>
                      </dl>
                      <button className="admin-secondary-button" type="button" onClick={() => openGroupEditor(group)}>
                        Administrér gruppe
                      </button>
                    </article>
                  );
                })}
                {groups.length === 0 && (
                  <button type="button" className="admin-empty-group" onClick={openGroupWizard}>
                    <strong>Opret den første gruppe</strong>
                    <span>Saml brugere med fælles slutdato og arkivering.</span>
                  </button>
                )}
              </div>
            </section>
          )}

          {activeTab === "miniAccess" && (
            <section>
              <header className="admin-section-header split">
                <div>
                  <span className="admin-eyebrow">Særskilt værktøj</span>
                  <h1>MiniDISSK-adgang</h1>
                  <p>
                    Giv adgang til enkelte brugere eller hele grupper. Adgangen påvirker
                    ikke deres almindelige DISSK-projekter.
                  </p>
                </div>
                <div className="admin-stat">
                  <strong>
                    {miniAccess.allowedEmails.length + miniAccess.allowedGroupIds.length}
                  </strong>
                  <span>aktive tildelinger</span>
                </div>
              </header>

              <div className="admin-mini-access-grid">
                <div className="admin-card admin-mini-access-card">
                  <div className="admin-card-heading">
                    <div>
                      <h2>Brugere</h2>
                      <p>Direkte adgang følger brugerens e-mailadresse.</p>
                    </div>
                    <span className="admin-count">{miniAccess.allowedEmails.length}</span>
                  </div>
                  <input
                    className="admin-search"
                    value={searchMiniAccess}
                    onChange={(event) => setSearchMiniAccess(event.target.value)}
                    placeholder="Søg efter navn, e-mail eller gruppe"
                  />
                  <div className="admin-access-toggle-list">
                    {filteredMiniUsers.map((listedUser) => {
                      const email = listedUser.email.toLowerCase();
                      const directAccess = miniAccess.allowedEmails.includes(email);
                      const groupAccess = !!listedUser.groupId &&
                        miniAccess.allowedGroupIds.includes(listedUser.groupId);
                      const locked = email === SUPERADMIN_EMAIL.toLowerCase();
                      return (
                        <label key={listedUser.uid} className="admin-access-toggle-row">
                          <span className="admin-user-cell">
                            <span className="admin-avatar">
                              {(listedUser.displayName || listedUser.email)[0].toUpperCase()}
                            </span>
                            <span>
                              <strong>{listedUser.displayName || "Navn ikke registreret"}</strong>
                              <small>{listedUser.email}</small>
                            </span>
                          </span>
                          {groupAccess && !directAccess && (
                            <span className="admin-indirect-badge">Via gruppe</span>
                          )}
                          <input
                            type="checkbox"
                            checked={directAccess}
                            disabled={locked}
                            onChange={() => toggleMiniUser(email)}
                          />
                          <span className="admin-switch" />
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="admin-card admin-mini-access-card">
                  <div className="admin-card-heading">
                    <div>
                      <h2>Grupper</h2>
                      <p>Alle nuværende og kommende medlemmer får adgang.</p>
                    </div>
                    <span className="admin-count">{miniAccess.allowedGroupIds.length}</span>
                  </div>
                  <div className="admin-access-toggle-list groups">
                    {groups.map((group) => {
                      const checked = miniAccess.allowedGroupIds.includes(group.id);
                      const memberCount = users.filter(
                        (listedUser) => listedUser.groupId === group.id
                      ).length;
                      return (
                        <label key={group.id} className="admin-access-toggle-row">
                          <span className="admin-group-access-name">
                            <strong>{group.name}</strong>
                            <small>{memberCount} brugere</small>
                          </span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMiniGroup(group.id)}
                          />
                          <span className="admin-switch" />
                        </label>
                      );
                    })}
                    {groups.length === 0 && (
                      <span className="admin-empty-inline">Der er endnu ingen grupper.</span>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "activity" && (
            <section>
              <header className="admin-section-header">
                <div><span className="admin-eyebrow">Login</span><h1>Aktivitet</h1><p>Seneste registrerede login for aktive brugere.</p></div>
              </header>
              <div className="admin-toolbar">
                <input className="admin-search" value={searchActivity} onChange={(event) => setSearchActivity(event.target.value)} placeholder="Søg efter navn eller e-mail" />
                <select value={activitySort} onChange={(event) => setActivitySort(event.target.value as typeof activitySort)}>
                  <option value="newest">Seneste først</option>
                  <option value="oldest">Ældste først</option>
                  <option value="az">Navn A–Å</option>
                  <option value="za">Navn Å–A</option>
                </select>
              </div>
              <div className="admin-card admin-activity-list">
                {filteredActivity.map((listedUser) => (
                  <div key={listedUser.uid} className="admin-activity-row">
                    <div className="admin-user-cell">
                      <span className="admin-avatar">{(listedUser.displayName || listedUser.email)[0].toUpperCase()}</span>
                      <div><strong>{listedUser.displayName || "Navn ikke registreret"}</strong><small>{listedUser.email}</small></div>
                    </div>
                    <span className="admin-role-badge">{roleLabel(listedUser.role)}</span>
                    <time>{formatTimestamp(listedUser.lastLogin)}</time>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === "archive" && isSuperadmin && (
            <section>
              <header className="admin-section-header split">
                <div><span className="admin-eyebrow">Kun superadmin</span><h1>Brugerarkiv</h1><p>Arkiverede brugere og deres historiske gruppetilknytning.</p></div>
                <div className="admin-stat"><strong>{archivedUsers.length}</strong><span>arkiverede</span></div>
              </header>
              <div className="admin-table-card">
                <table className="admin-table">
                  <thead><tr><th>Navn</th><th>E-mail</th><th>Gruppe</th><th>Slutdato</th><th>Arkiveret</th></tr></thead>
                  <tbody>
                    {archivedUsers.map((archivedUser) => (
                      <tr key={archivedUser.uid}>
                        <td>{archivedUser.displayName || "Navn ikke registreret"}</td>
                        <td>{archivedUser.email}</td>
                        <td>{archivedUser.groupName || "—"}</td>
                        <td>{timestampToDateInput(archivedUser.endDate) || "—"}</td>
                        <td>{formatTimestamp(archivedUser.archivedAt)}</td>
                      </tr>
                    ))}
                    {archivedUsers.length === 0 && <tr><td colSpan={5} className="admin-empty-cell">Arkivet er tomt.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "exports" && isSuperadmin && <AdminExportPanel users={users} />}
        </main>
      </div>

      {wizardOpen && (
        <div className="admin-modal-backdrop" role="presentation">
          <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="group-wizard-title">
            <div className="admin-modal-header">
              <div><span className="admin-eyebrow">Trin {wizardStep} af 3</span><h2 id="group-wizard-title">Opret gruppe</h2></div>
              <button type="button" className="admin-modal-close" onClick={() => setWizardOpen(false)}>×</button>
            </div>
            <div className="admin-stepper"><span className={wizardStep >= 1 ? "active" : ""} /><span className={wizardStep >= 2 ? "active" : ""} /><span className={wizardStep >= 3 ? "active" : ""} /></div>
            <div className="admin-modal-body">
              {wizardStep === 1 && (
                <label className="admin-field-large">Gruppens navn<input autoFocus value={wizardName} onChange={(event) => setWizardName(event.target.value)} placeholder="Fx Sygepleje F26" /></label>
              )}
              {wizardStep === 2 && (
                <div className="admin-wizard-fields">
                  <label>Fælles slutdato<input type="date" value={wizardEndDate} onChange={(event) => setWizardEndDate(event.target.value)} /></label>
                  <label>Brugere <small>Indsæt e-mails adskilt af linjeskift, komma eller semikolon.</small><textarea rows={8} value={wizardEmails} onChange={(event) => setWizardEmails(event.target.value)} placeholder={"10000001@ucn.dk\n10000002@ucn.dk"} /></label>
                </div>
              )}
              {wizardStep === 3 && (
                <div className="admin-summary">
                  <div><span>Gruppenavn</span><strong>{wizardName.trim()}</strong></div>
                  <div><span>Slutdato</span><strong>{wizardEndDate}</strong></div>
                  <div><span>Arkiveringsdato</span><strong>{timestampToDateInput(archiveTimestampForEndDate(wizardEndDate))}</strong></div>
                  <div><span>Brugere</span><strong>{wizardMemberCount}</strong></div>
                </div>
              )}
            </div>
            <div className="admin-modal-footer">
              <button type="button" className="admin-secondary-button" onClick={() => wizardStep === 1 ? setWizardOpen(false) : setWizardStep((wizardStep - 1) as 1 | 2)}>Tilbage</button>
              {wizardStep < 3 ? (
                <button type="button" className="admin-primary-button" disabled={(wizardStep === 1 && !wizardName.trim()) || (wizardStep === 2 && !wizardEndDate)} onClick={() => setWizardStep((wizardStep + 1) as 2 | 3)}>Fortsæt</button>
              ) : (
                <button type="button" className="admin-primary-button" onClick={createGroup}>Opret gruppe</button>
              )}
            </div>
          </div>
        </div>
      )}

      {editingGroup && (
        <div className="admin-modal-backdrop" role="presentation">
          <div className="admin-modal wide" role="dialog" aria-modal="true" aria-labelledby="group-editor-title">
            <div className="admin-modal-header">
              <div><span className="admin-eyebrow">Gruppe</span><h2 id="group-editor-title">{editingGroup.name}</h2></div>
              <button type="button" className="admin-modal-close" onClick={() => setEditingGroupId(null)}>×</button>
            </div>
            <div className="admin-modal-body group-editor-body">
              <section>
                <h3>Fælles dato</h3>
                <div className="admin-inline-form compact">
                  <label>Slutdato<input type="date" value={editingGroupEndDate} onChange={(event) => setEditingGroupEndDate(event.target.value)} /></label>
                  <button type="button" className="admin-primary-button" onClick={() => saveGroupDate(editingGroup)}>Gem for hele gruppen</button>
                </div>
                <p className="admin-help">Alle {editingGroupMembers.length} medlemmer får samme slut- og arkiveringsdato.</p>
              </section>
              <section>
                <h3>Tilføj eller flyt brugere hertil</h3>
                <textarea rows={4} value={editingGroupEmails} onChange={(event) => setEditingGroupEmails(event.target.value)} placeholder="Indsæt en eller flere e-mailadresser" />
                <button type="button" className="admin-secondary-button" onClick={() => addUsersToGroup(editingGroup)}>Tilføj til gruppen</button>
              </section>
              <section>
                <div className="admin-card-heading"><h3>Medlemmer</h3><span className="admin-count">{editingGroupMembers.length}</span></div>
                <div className="admin-member-list">
                  {editingGroupMembers.map((member) => (
                    <div key={member.uid}>
                      <span><strong>{member.displayName || "Navn ikke registreret"}</strong><small>{member.email}</small></span>
                      <button type="button" onClick={() => removeUserFromGroup(member)}>Fjern fra gruppe</button>
                    </div>
                  ))}
                  {editingGroupMembers.length === 0 && <span className="admin-empty-inline">Gruppen har ingen medlemmer.</span>}
                </div>
              </section>
            </div>
            <div className="admin-modal-footer between">
              <button type="button" className="admin-danger-button" onClick={() => deleteGroup(editingGroup)}>Slet gruppe</button>
              <button type="button" className="admin-primary-button" onClick={() => setEditingGroupId(null)}>Færdig</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
