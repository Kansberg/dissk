// src/context/AuthContext.tsx
import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signOut,
} from "firebase/auth";

import { auth, db } from "../firebase";
import {
  doc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  getDoc,
  deleteDoc,
} from "firebase/firestore";

type Role = "admin" | "user";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (rawUser) => {
      setAuthError(null); // nulstil fejl ved hvert auth-skift

      if (!rawUser) {
        setUser(null);
        return;
      }

      try {
        const emailLower = rawUser.email?.toLowerCase() ?? "";
        const domain = emailLower.split("@")[1] ?? "";

        // ---------- 1) Slå både uid-doc OG email-doc op ----------
        const refUid = doc(db, "users", rawUser.uid);
        const snapUid = await getDoc(refUid);

        let refEmailDoc = null as ReturnType<typeof doc> | null;
        let snapEmail: any = null;

        if (emailLower) {
          refEmailDoc = doc(db, "users", emailLower);
          snapEmail = await getDoc(refEmailDoc);
        }

        let role: Role = "user";
        let disabled = false;

        if (snapUid.exists()) {
          // Bruger har allerede et uid-dokument
          const data = snapUid.data() as any;
          role = data.role === "admin" ? "admin" : "user";
          disabled = !!data.disabled;
        } else if (refEmailDoc && snapEmail && snapEmail.exists()) {
          // Pre-user findes på users/{emailLower} → migrér til users/{uid}
          const data = snapEmail.data() as any;
          role = data.role === "admin" ? "admin" : "user";
          disabled = !!data.disabled;

          await setDoc(
            refUid,
            {
              ...data,
              uid: rawUser.uid,
              email: rawUser.email,
              emailLower,
            },
            { merge: true }
          );

          await deleteDoc(refEmailDoc);
        } else {
          // Helt ny bruger uden pre-user → default
          role = "user";
          disabled = false;
        }

        // ---------- 2) Læs adgangsregler ----------
        const accessRef = doc(db, "settings", "access");
        const accessSnap = await getDoc(accessRef);

        let allowedDomains: string[] = [];
        let allowedEmails: string[] = [];

        if (accessSnap.exists()) {
          const a = accessSnap.data() as any;
          if (Array.isArray(a.allowedDomains)) {
            allowedDomains = a.allowedDomains.map((d: string) =>
              d.toLowerCase()
            );
          }
          if (Array.isArray(a.allowedEmails)) {
            allowedEmails = a.allowedEmails.map((m: string) =>
              m.toLowerCase()
            );
          }
        }

        const hasRules =
          allowedDomains.length > 0 || allowedEmails.length > 0;

        const inDomains =
          domain !== "" && allowedDomains.includes(domain.toLowerCase());
        const inEmails =
          emailLower !== "" &&
          allowedEmails.includes(emailLower.toLowerCase());

        let allowed: boolean = true;
        let errorMsg: string | null = null;

        if (disabled) {
          allowed = false;
          errorMsg =
            "Din konto er deaktiveret af en administrator og kan ikke logge ind.";
        } else if (hasRules && role !== "admin") {
          if (!(inDomains || inEmails)) {
            allowed = false;
            errorMsg =
              "Din e-mailadresse har ikke adgang til dette værktøj. Kontakt en administrator, hvis du mener, det er en fejl.";
          }
        }

        if (!allowed) {
          setAuthError(
            errorMsg ?? "Du har ikke adgang til dette værktøj."
          );
          // VIGTIGT: vi logger ikke ud her – vi sætter bare ikke user
          return;
        }

        // ---------- 3) Opdater / opret uid-dokument ----------
        const baseData = {
          uid: rawUser.uid,
          email: rawUser.email,
          emailLower,
          displayName: rawUser.displayName,
          photoURL: rawUser.photoURL || null,
          role,
          disabled,
          lastLogin: serverTimestamp(),
        };

        await setDoc(refUid, baseData, { merge: true });

        // ---------- 4) Projekt-deling (din eksisterende logik) ----------
        if (rawUser.email) {
          const qShared = query(
            collection(db, "projects"),
            where(`sharedWith.${rawUser.email}`, "!=", null)
          );
          const snap2 = await getDocs(qShared);

          for (const docSnap of snap2.docs) {
            const proj = docSnap.data();
            const shared = proj.sharedWith?.[rawUser.email];
            if (shared?.pending) {
              const projRole = shared.role;

              await updateDoc(doc(db, "projects", docSnap.id), {
                [`sharedWith.${rawUser.email}`]: projRole,
              });

              await setDoc(
                doc(db, "projectAccess", rawUser.email),
                {
                  [docSnap.id]: projRole,
                },
                { merge: true }
              );
            }
          }
        }

        // ---------- 5) Alt OK → sæt user ----------
        setUser(rawUser);
      } catch (err: any) {
        console.error(err);
        setAuthError(
          err?.message ||
            "Der opstod en fejl under login. Prøv igen senere."
        );
        // Vi logger ikke ud her – men vi sætter heller ikke user igen
        return;
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
