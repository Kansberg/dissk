// src/utils/save.ts
import { db } from "../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export async function saveProject(
  uid: string,
  projectId: string,
  data: any
): Promise<void> {
  const ref = doc(db, "users", uid, "projects", projectId);
  await setDoc(
    ref,
    {
      ...data,
      title: (data?.title ?? "").trim() || "Unavngivet DISSK",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
