import { initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

initializeApp();

const db = getFirestore();
const REGION = "europe-west1";
const TIME_ZONE = "Europe/Copenhagen";
const STUDENT_EMAIL_PATTERN = /^10\d{6}@ucn\.dk$/i;
const ARCHIVE_DELAY_DAYS = 120;

const pad = (value: number) => String(value).padStart(2, "0");

function copenhagenDateParts(date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);

  return { year: part("year"), month: part("month"), day: part("day") };
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function todayIso(date = new Date()): string {
  const { year, month, day } = copenhagenDateParts(date);
  return isoDate(year, month, day);
}

function defaultEndDateIso(date = new Date()): string {
  const { year, month } = copenhagenDateParts(date);
  if (month >= 11) return isoDate(year + 1, 6, 30);
  if (month <= 5) return isoDate(year, 6, 30);
  return isoDate(year, 12, 31);
}

function timestampForIsoDate(value: string): Timestamp {
  return Timestamp.fromDate(new Date(`${value}T00:00:00.000Z`));
}

function archiveAtForEndDate(value: string): Timestamp {
  const archiveDate = new Date(`${value}T00:00:00.000Z`);
  archiveDate.setUTCDate(archiveDate.getUTCDate() + ARCHIVE_DELAY_DAYS);
  return Timestamp.fromDate(archiveDate);
}

export const setUserLifecycle = onDocumentCreated(
  { document: "users/{userId}", region: REGION },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    if (data.role === "superadmin") return;
    if (
      data.lifecycleManagedByAdmin === true &&
      data.endDate instanceof Timestamp &&
      data.archiveAt instanceof Timestamp
    ) {
      return;
    }

    const endDateValue = defaultEndDateIso(snapshot.createTime.toDate());
    await snapshot.ref.update({
      endDate: timestampForIsoDate(endDateValue),
      archiveAt: archiveAtForEndDate(endDateValue),
      archiveDelayDays: ARCHIVE_DELAY_DAYS,
      lifecycleManagedByAdmin: false,
    });
  }
);

async function scheduleExistingStudentUsers(): Promise<number> {
  const migrationRef = db.doc("system/userLifecycleMigrationV1");
  if ((await migrationRef.get()).exists) return 0;

  const usersSnapshot = await db.collection("users").get();
  const writer = db.bulkWriter();
  const endDateValue = todayIso();
  let scheduled = 0;

  for (const userSnapshot of usersSnapshot.docs) {
    const data = userSnapshot.data();
    const email = String(data.emailLower || data.email || "").toLowerCase();
    if (!STUDENT_EMAIL_PATTERN.test(email) || data.archiveAt) continue;

    writer.update(userSnapshot.ref, {
      endDate: timestampForIsoDate(endDateValue),
      archiveAt: archiveAtForEndDate(endDateValue),
      archiveDelayDays: ARCHIVE_DELAY_DAYS,
      lifecycleManagedByAdmin: true,
      legacyStudentScheduledAt: FieldValue.serverTimestamp(),
    });
    scheduled += 1;
  }

  await writer.close();
  await migrationRef.set({
    completedAt: FieldValue.serverTimestamp(),
    scheduledUsers: scheduled,
  });
  return scheduled;
}

async function migrateArchiveWindow(): Promise<number> {
  const migrationRef = db.doc("system/userLifecycleMigrationV2");
  if ((await migrationRef.get()).exists) return 0;

  const usersSnapshot = await db.collection("users").get();
  const writer = db.bulkWriter();
  let updated = 0;

  for (const userSnapshot of usersSnapshot.docs) {
    const data = userSnapshot.data();
    if (data.role === "superadmin" || !(data.endDate instanceof Timestamp)) continue;

    const endDateValue = data.endDate.toDate().toISOString().slice(0, 10);
    writer.update(userSnapshot.ref, {
      archiveAt: archiveAtForEndDate(endDateValue),
      archiveDelayDays: ARCHIVE_DELAY_DAYS,
      archiveWindowUpdatedAt: FieldValue.serverTimestamp(),
    });
    updated += 1;
  }

  await writer.close();
  await migrationRef.set({
    completedAt: FieldValue.serverTimestamp(),
    updatedUsers: updated,
    archiveDelayDays: ARCHIVE_DELAY_DAYS,
  });
  return updated;
}

async function archiveUser(userId: string, now: Timestamp): Promise<string | null> {
  const userRef = db.doc(`users/${userId}`);
  let archivedEmail: string | null = null;

  await db.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(userRef);
    if (!currentSnapshot.exists) return;

    const data = currentSnapshot.data() || {};
    const archiveAt = data.archiveAt;
    if (!(archiveAt instanceof Timestamp) || archiveAt.toMillis() > now.toMillis()) return;
    if (data.role === "superadmin") return;

    const email = String(data.emailLower || data.email || "").toLowerCase();
    archivedEmail = email || null;
    transaction.set(
      db.doc(`archivedUsers/${userId}`),
      {
        ...data,
        uid: data.uid || userId,
        sourceUserId: userId,
        archivedAt: FieldValue.serverTimestamp(),
        archiveReason: "end-date",
      },
      { merge: true }
    );
    transaction.set(db.doc(`deniedAccess/${userId}`), {
      reason: "archived",
      archivedAt: FieldValue.serverTimestamp(),
    });
    if (email && email !== userId) {
      transaction.set(db.doc(`deniedAccess/${email}`), {
        reason: "archived",
        archivedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.delete(userRef);
  });

  return archivedEmail;
}

export const archiveExpiredUsers = onSchedule(
  {
    schedule: "15 2 * * *",
    timeZone: TIME_ZONE,
    region: REGION,
    retryCount: 3,
  },
  async () => {
    const scheduledUsers = await scheduleExistingStudentUsers();
    const migratedArchiveWindows = await migrateArchiveWindow();
    const now = Timestamp.now();
    const dueSnapshot = await db
      .collection("users")
      .where("archiveAt", "<=", now)
      .get();

    const archivedEmails: string[] = [];
    for (let offset = 0; offset < dueSnapshot.docs.length; offset += 20) {
      const chunk = dueSnapshot.docs.slice(offset, offset + 20);
      const results = await Promise.all(
        chunk.map((snapshot) => archiveUser(snapshot.id, now))
      );
      archivedEmails.push(...results.filter((email): email is string => !!email));
    }

    if (archivedEmails.length > 0) {
      await db.doc("settings/access").set(
        {
          allowedEmails: FieldValue.arrayRemove(...new Set(archivedEmails)),
        },
        { merge: true }
      );
    }

    logger.info("User lifecycle run completed", {
      scheduledExistingStudents: scheduledUsers,
      migratedArchiveWindows,
      archivedUsers: archivedEmails.length,
    });
  }
);
