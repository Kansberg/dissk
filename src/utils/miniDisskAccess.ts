import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { SUPERADMIN_EMAIL } from "../constants/superadmin";

export type MiniDisskAccessSettings = {
  allowedEmails: string[];
  allowedGroupIds: string[];
};

export const DEFAULT_MINI_DISSK_ACCESS: MiniDisskAccessSettings = {
  allowedEmails: [SUPERADMIN_EMAIL.toLowerCase()],
  allowedGroupIds: [],
};

export async function canUseMiniDissk(
  uid: string,
  email: string | null | undefined
): Promise<boolean> {
  const emailLower = (email || "").toLowerCase();
  if (emailLower === SUPERADMIN_EMAIL.toLowerCase()) return true;

  const [settingsSnapshot, userSnapshot] = await Promise.all([
    getDoc(doc(db, "settings", "miniDisskAccess")),
    getDoc(doc(db, "users", uid)),
  ]);
  if (!settingsSnapshot.exists()) return false;

  const settings = settingsSnapshot.data();
  const allowedEmails = Array.isArray(settings.allowedEmails)
    ? settings.allowedEmails.map((item: string) => item.toLowerCase())
    : [];
  const allowedGroupIds = Array.isArray(settings.allowedGroupIds)
    ? settings.allowedGroupIds
    : [];
  const groupId = userSnapshot.exists() ? userSnapshot.data().groupId : null;

  return allowedEmails.includes(emailLower) || (!!groupId && allowedGroupIds.includes(groupId));
}
