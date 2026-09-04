// src/utils/save.ts
import { db } from "../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

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

export async function saveSharedProject(projectId: string, data: any): Promise<void> {
  if (!projectId) return;
  await setDoc(
    doc(db, "projects", projectId),
    {
      ...data,
      title: (data?.title ?? "").trim() || "Unavngivet DISSK",
      updatedAt: serverTimestamp(),
      styles: data?.styles ?? {},
    },
    { merge: true }
  );
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
