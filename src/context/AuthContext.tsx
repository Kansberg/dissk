import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signOut,
} from "firebase/auth";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { auth, db } from "../firebase";
import { isSuperadminUid } from "../constants/superadmin";
import {
  archiveTimestampForEndDate,
  ARCHIVE_DELAY_DAYS,
  currentDateInputValue,
  dateInputToTimestamp,
  defaultUserEndDate,
  isArchiveDue,
  STUDENT_EMAIL_PATTERN,
} from "../utils/userLifecycle";

type Role = "superadmin" | "admin" | "user";

type AuthCtx = {
  user: User | null;
  loginGoogle: () => Promise<void>;
  loginMicrosoft: () => Promise<void>;
  logout: () => Promise<void>;
  authError: string | null;
  clearAuthError: () => void;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  loginGoogle: async () => {},
  loginMicrosoft: async () => {},
  logout: async () => {},
  authError: null,
  clearAuthError: () => {},
});

const normalizeRole = (role: unknown, uid: string): Role => {
  if (isSuperadminUid(uid)) return "superadmin";
  if (role === "superadmin") return "superadmin";
  return role === "admin" ? "admin" : "user";
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (rawUser) => {
      setAuthError(null);

      if (!rawUser) {
        setUser(null);
        return;
      }

      // Firebase Auth is the login source of truth. Firestore metadata must not
      // turn a valid auth session into a failed login.
      setUser(rawUser);

      const emailLower = rawUser.email?.toLowerCase() ?? "";
      const domain = emailLower.split("@")[1] ?? "";

      try {
        const refUid = doc(db, "users", rawUser.uid);
        const snapUid = await getDoc(refUid);

        const deniedRefs = [doc(db, "deniedAccess", rawUser.uid)];
        if (emailLower && emailLower !== rawUser.uid) {
          deniedRefs.push(doc(db, "deniedAccess", emailLower));
        }
        const deniedSnapshots = await Promise.all(deniedRefs.map((ref) => getDoc(ref)));

        if (deniedSnapshots.some((snapshot) => snapshot.exists())) {
          setUser(null);
          setAuthError("Din konto er udløbet og er blevet arkiveret.");
          return;
        }

        let role: Role = "user";
        let disabled = false;
        let preUserData: Record<string, unknown> | null = null;
        let preUserRef: ReturnType<typeof doc> | null = null;
        let endDate: unknown = null;
        let archiveAt: unknown = null;
        let lifecycleManagedByAdmin = false;
        let existingUserDocument = false;

        if (snapUid.exists()) {
          const data = snapUid.data() as any;
          existingUserDocument = true;
          role = normalizeRole(data.role, rawUser.uid);
          disabled = !!data.disabled;
          endDate = data.endDate;
          archiveAt = data.archiveAt;
          lifecycleManagedByAdmin = data.lifecycleManagedByAdmin === true;
        } else if (emailLower) {
          const refEmail = doc(db, "users", emailLower);
          const snapEmail = await getDoc(refEmail);

          if (snapEmail.exists()) {
            const data = snapEmail.data() as any;
            existingUserDocument = true;
            role = normalizeRole(data.role, rawUser.uid);
            disabled = !!data.disabled;
            endDate = data.endDate;
            archiveAt = data.archiveAt;
            lifecycleManagedByAdmin = data.lifecycleManagedByAdmin === true;
            preUserData = data;
            preUserRef = refEmail;
          }
        }

        if (!archiveAt) {
          const shouldScheduleLegacyStudent =
            existingUserDocument && STUDENT_EMAIL_PATTERN.test(emailLower);

          if (!existingUserDocument || shouldScheduleLegacyStudent) {
            const endDateValue = shouldScheduleLegacyStudent
              ? currentDateInputValue()
              : defaultUserEndDate();
            endDate = dateInputToTimestamp(endDateValue);
            archiveAt = archiveTimestampForEndDate(endDateValue);
            lifecycleManagedByAdmin = shouldScheduleLegacyStudent;
          }
        }

        if (isArchiveDue(archiveAt)) {
          setUser(null);
          setAuthError("Din konto er udløbet og afventer arkivering.");
          return;
        }

        const accessSnap = await getDoc(doc(db, "settings", "access"));
        const access = accessSnap.exists() ? (accessSnap.data() as any) : {};

        const allowedDomains = Array.isArray(access.allowedDomains)
          ? access.allowedDomains.map((d: string) => d.toLowerCase())
          : [];
        const allowedEmails = Array.isArray(access.allowedEmails)
          ? access.allowedEmails.map((m: string) => m.toLowerCase())
          : [];

        const hasRules = allowedDomains.length > 0 || allowedEmails.length > 0;
        const isAllowedEmail = emailLower !== "" && allowedEmails.includes(emailLower);
        const isAllowedDomain = domain !== "" && allowedDomains.includes(domain);

        if (disabled) {
          setUser(null);
          setAuthError("Din konto er deaktiveret af en administrator og kan ikke logge ind.");
          return;
        }

        if (
          hasRules &&
          role !== "admin" &&
          role !== "superadmin" &&
          !isAllowedEmail &&
          !isAllowedDomain
        ) {
          setUser(null);
          setAuthError(
            "Din e-mailadresse har ikke adgang til dette vaerktoej. Kontakt en administrator, hvis du mener, det er en fejl."
          );
          return;
        }

        try {
          await setDoc(
            refUid,
            {
              ...(preUserData || {}),
              uid: rawUser.uid,
              email: rawUser.email,
              emailLower,
              displayName: rawUser.displayName,
              photoURL: rawUser.photoURL || null,
              role,
              disabled,
              ...(endDate ? { endDate } : {}),
              ...(archiveAt ? { archiveAt } : {}),
              ...(archiveAt ? { archiveDelayDays: ARCHIVE_DELAY_DAYS } : {}),
              lifecycleManagedByAdmin,
              lastLogin: serverTimestamp(),
            },
            { merge: true }
          );

          if (preUserRef) {
            await deleteDoc(preUserRef);
          }
        } catch (err) {
          console.warn("[AuthContext] Could not update user metadata:", err);
        }
      } catch (err) {
        console.warn("[AuthContext] Firestore access check failed:", err);
      }
    });

    return () => unsub();
  }, []);

  const loginGoogle = async () => {
    setAuthError(null);
    await signInWithPopup(auth, new GoogleAuthProvider());
  };

  const loginMicrosoft = async () => {
    setAuthError(null);
    await signInWithPopup(auth, new OAuthProvider("microsoft.com"));
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
  };

  const clearAuthError = () => setAuthError(null);

  return (
    <Ctx.Provider
      value={{
        user,
        loginGoogle,
        loginMicrosoft,
        logout,
        authError,
        clearAuthError,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
