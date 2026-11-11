import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Doc } from "../types/editor";

type UndoContextType = {
  addToHistory: (document: Doc) => void;
  undo: (projectId: string) => Doc | null;
  canUndo: boolean;
  resetHistory: () => void;
};

const UndoContext = createContext<UndoContextType>({
  addToHistory: () => {}, undo: () => null, canUndo: false, resetHistory: () => {},
});

export function UndoProvider({ children }: { children: ReactNode }) {
  // Every entry is the complete document BEFORE an edit.
  const history = useRef<Doc[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const addToHistory = useCallback((document: Doc) => {
    if (history.current[0]?.id !== document.id) history.current = [];
    const snapshot = structuredClone(document);
    if (JSON.stringify(history.current[0]) !== JSON.stringify(snapshot)) {
      history.current.unshift(snapshot);
      history.current = history.current.slice(0, 100);
    }
    setCanUndo(history.current.length > 0);
  }, []);

  const undo = useCallback((projectId: string) => {
    const previous = history.current.shift();
    if (previous?.id !== projectId) {
      history.current = [];
      setCanUndo(false);
      return null;
    }
    setCanUndo(history.current.length > 0);
    return structuredClone(previous);
  }, []);

  const resetHistory = useCallback(() => {
    history.current = [];
    setCanUndo(false);
  }, []);

  return <UndoContext.Provider value={{ addToHistory, undo, canUndo, resetHistory }}>
    {children}
  </UndoContext.Provider>;
}

export const useUndo = () => useContext(UndoContext);
