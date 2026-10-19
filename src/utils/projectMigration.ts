import { doc, getDocFromServer, runTransaction } from "firebase/firestore";
import { db } from "../firebase";

/** The global document is authoritative. Keep a second legacy copy for recovery. */
export async function migrateLegacyProject(uid: string, email: string, projectId: string) {
  const legacyRef = doc(db, "users", uid, "projects", projectId);
  const legacy = await getDocFromServer(legacyRef);
  if (!legacy.exists() || (legacy.data().access && !legacy.data().owner)) return;

  const globalRef = doc(db, "projects", projectId);
  await runTransaction(db, async (transaction) => {
    const current = await transaction.get(globalRef);
    const source = await transaction.get(legacyRef);
    if (!source.exists()) return;
    if (current.exists()) {
      // Never promote an old private copy over a saved global document.
      // Repair only the ownership index; preserve content, date and sharing.
      const data = current.data();
      if (!data.ownerUid && data.owner === email.toLowerCase()) {
        transaction.update(globalRef, { ownerUid: uid });
      }
      return;
    }
    transaction.set(globalRef, {
      ...source.data(),
      owner: email.toLowerCase(),
      ownerUid: uid,
      sharedWith: source.data().sharedWith ?? {},
    });
    transaction.delete(legacyRef);
  });
}
