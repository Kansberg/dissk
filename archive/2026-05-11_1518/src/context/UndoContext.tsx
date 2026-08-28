// src/context/UndoContext.tsx
import React, { createContext, useContext, useRef, useState } from "react";

type UndoContextType = {
  /** Gem en snapshot af hele dokumentet (før ændringen). */
  addToHistory: (state: any) => void;
  /** Rul én handling tilbage og returnér den forrige tilstand (eller null). */
  undo: () => any | null;
  /** Om der findes noget at fortryde (true = der er mindst 1 tidligere snapshot). */
  canUndo: boolean;
  /** Nulstil historikken (valgfrit initialt snapshot). */
  resetHistory: (initial?: any) => void;
};

const UndoContext = createContext<UndoContextType>({
  addToHistory: () => {},
  undo: () => null,
  canUndo: false,
  resetHistory: () => {},
});

export const UndoProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // Historik som en stack med "nu"-tilstand på index 0
  const historyRef = useRef<any[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const clone = (v: any) => JSON.parse(JSON.stringify(v));

  const addToHistory = (state: any) => {
    const snap = clone(state);
    const head = historyRef.current[0];

    // Undgå dobbeltlagring af identiske snapshots i træk
if (!head || JSON.stringify(head) !== JSON.stringify(snap)) {
  historyRef.current.unshift(snap);
  // Hold maks 10 snapshots
  historyRef.current = historyRef.current.slice(0, 10);
}

    // Man kan kun fortryde hvis der er mindst 2 snapshots (nu + tidligere)
    setCanUndo(historyRef.current.length > 1);
  };

  const undo = (): any | null => {
    // Kræver mindst to snapshots: [NU, TIDLIGERE, ...]
    if (historyRef.current.length < 1) return null;

    // Fjern "NU"
    historyRef.current.shift();

    // Giv den forrige tilstand tilbage (som ny "NU")
    const previous = historyRef.current[0] ?? null;

    // Opdater canUndo (er der stadig noget før den nye "NU"?)
    setCanUndo(historyRef.current.length > 1);

    return previous ? clone(previous) : null;
  };

  const resetHistory = (initial?: any) => {
    historyRef.current = initial ? [clone(initial)] : [];
    setCanUndo(false);
  };

  return (
    <UndoContext.Provider
      value={{ addToHistory, undo, canUndo, resetHistory }}
    >
      {children}
    </UndoContext.Provider>
  );
};

export const useUndo = () => useContext(UndoContext);
