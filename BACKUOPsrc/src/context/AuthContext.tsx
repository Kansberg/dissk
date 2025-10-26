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
import { auth } from "../firebase";

type AuthCtx = {
  user: User | null;
  loginGoogle: () => Promise<void>;
  loginMicrosoft: () => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  loginGoogle: async () => {},
  loginMicrosoft: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  const loginGoogle = async () => {
    await signInWithPopup(auth, new GoogleAuthProvider());
  };
  const loginMicrosoft = async () => {
    const provider = new OAuthProvider("microsoft.com"); // Entra ID
    await signInWithPopup(auth, provider);
  };
  const logout = async () => {
    await signOut(auth);
  };

  return (
    <Ctx.Provider value={{ user, loginGoogle, loginMicrosoft, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
