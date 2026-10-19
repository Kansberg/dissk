// src/utils/save.ts
import { db } from "../firebase";
import { doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import type { Doc } from "../types/editor";

const pendingSharedSaves = new Map<string, {
  data: Doc;
  waiters: { resolve: () => void; reject: (error: unknown) => void }[];
}>();

export async function saveProject(
  uid: string,
  projectId: string,
  data: any
): Promise<void> {
  // SIKKERHED: Gem ALDRIG noget hvis bruger ikke findes
  if (!uid) {
    console.warn("❌ saveProject() afbrudt – ingen UID (anonym bruger)");
    return;
  }

  if (!projectId) {
    console.warn("❌ saveProject() afbrudt – intet projectId");
    return;
  }

  const ref = doc(db, "users", uid, "projects", projectId);

  // Sikrer at styles ikke overskrives utilsigtet
  const payload = {
    ...data,
    title: (data?.title ?? "").trim() || "Unavngivet DISSK",
    updatedAt: serverTimestamp(),
    styles: (data as any).styles ?? {},
  };

  await setDoc(ref, payload, { merge: true });
  console.log("💾 Projekt gemt:", projectId);
}

export function saveSharedProject(projectId: string, data: Doc): Promise<void> {
  if (!projectId) return Promise.reject(new Error("Projektet mangler et ID"));
  return new Promise<void>((resolve, reject) => {
    const pending = pendingSharedSaves.get(projectId);
    if (pending) {
      pending.data = data;
      pending.waiters.push({ resolve, reject });
      return;
    }
    const entry = { data, waiters: [{ resolve, reject }] };
    pendingSharedSaves.set(projectId, entry);
    // Coalesce typing for 400 ms. This queue survives editor navigation.
    setTimeout(() => {
      pendingSharedSaves.delete(projectId);
      const latest = entry.data;
      // Never recreate a deleted project, or replay stale access metadata.
      const content: Record<string, unknown> = { ...latest };
      delete content.owner;
      delete content.ownerUid;
      delete content.sharedWith;
      delete content.createdAt;
      void updateDoc(doc(db, "projects", projectId), {
        ...content,
        title: latest.title.trim() || "Unavngivet DISSK",
        updatedAt: serverTimestamp(),
        styles: latest.styles ?? {},
      }).then(() => entry.waiters.forEach((waiter) => waiter.resolve()))
        .catch((error: unknown) => entry.waiters.forEach((waiter) => waiter.reject(error)));
    }, 400);
  });
}

export async function createOwnedProject(
  uid: string,
  email: string,
  projectId: string,
  data: any
): Promise<void> {
  await setDoc(doc(db, "projects", projectId), {
    ...data,
    owner: email.toLowerCase(),
    ownerUid: uid,
    sharedWith: data?.sharedWith ?? {},
    updatedAt: serverTimestamp(),
  });
}
