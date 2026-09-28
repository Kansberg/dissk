import { initializeApp } from "firebase-admin/app";
import { createHash } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { HttpsError, onCall } from "firebase-functions/v2/https";

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

const RECOVERY_SOURCES = new Set(["anonymous", "editor", "legacyLocal", "mini"]);
const RECOVERY_MAX_BYTES = 12 * 1024 * 1024;
const RECOVERY_PART_CHARS = 120_000;

function recoveryText(value: unknown, limit = 40_000): string {
  const parts: string[] = [];
  let length = 0;
  const visit = (item: unknown, depth: number) => {
    if (length >= limit || depth > 12) return;
    if (typeof item === "string") {
      const text = item.replace(/<[^>]*>/g, " ").trim();
      if (text) {
        const clipped = text.slice(0, limit - length);
        parts.push(clipped);
        length += clipped.length + 1;
      }
    } else if (Array.isArray(item)) {
      item.forEach((child) => visit(child, depth + 1));
    } else if (item && typeof item === "object") {
      Object.entries(item).forEach(([key, child]) => {
        if (!key.toLowerCase().includes("style")) visit(child, depth + 1);
      });
    }
  };
  visit(value, 0);
  return parts.join(" ").slice(0, limit);
}

function recoveryParts(content: string): string[] {
  const parts: string[] = [];
  for (let offset = 0; offset < content.length;) {
    let end = Math.min(offset + RECOVERY_PART_CHARS, content.length);
    const code = content.charCodeAt(end - 1);
    if (end < content.length && code >= 0xD800 && code <= 0xDBFF) end -= 1;
    parts.push(content.slice(offset, end));
    offset = end;
  }
  return parts;
}

export const saveRecoveryBackup = onCall(
  { region: REGION, memory: "512MiB", timeoutSeconds: 120, maxInstances: 10 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login is required for recovery backup.");

    const data = request.data as Record<string, unknown> | null;
    const installationId = data?.installationId;
    const projectId = data?.projectId;
    const snapshotId = data?.snapshotId;
    const source = data?.source;
    const content = data?.content;
    const capturedAtClient = data?.capturedAtClient;
    const createdAtClient = data?.createdAtClient;

    if (
      typeof installationId !== "string" || !/^[a-f0-9-]{36}$/i.test(installationId)
      || typeof projectId !== "string" || !projectId || projectId.length > 160
      || typeof snapshotId !== "string" || !/^[a-f0-9-]{36}$/i.test(snapshotId)
      || typeof source !== "string" || !RECOVERY_SOURCES.has(source)
      || typeof content !== "string"
      || typeof capturedAtClient !== "number" || !Number.isFinite(capturedAtClient)
      || typeof createdAtClient !== "number" || !Number.isFinite(createdAtClient)
    ) {
      throw new HttpsError("invalid-argument", "Invalid recovery backup.");
    }

    const byteLength = Buffer.byteLength(content, "utf8");
    if (!byteLength || byteLength > RECOVERY_MAX_BYTES) {
      throw new HttpsError("invalid-argument", "Recovery backup exceeds the size limit.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new HttpsError("invalid-argument", "Recovery backup contains invalid JSON.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new HttpsError("invalid-argument", "Recovery backup must contain a document.");
    }

    const now = Date.now();
    if (capturedAtClient < Date.UTC(2020, 0, 1) || capturedAtClient > now + 86_400_000) {
      throw new HttpsError("invalid-argument", "Invalid capture time.");
    }

    const actorUid = request.auth.uid;
    const backupId = createHash("sha256")
      .update(`${actorUid}\n${installationId}\n${source}\n${projectId}`)
      .digest("hex");
    const backupRef = db.collection("recoveryBackups").doc(backupId);
    const snapshotRef = backupRef.collection("snapshots").doc(snapshotId);
    const hash = createHash("sha256").update(content).digest("hex");
    const existing = await snapshotRef.get();
    const alreadyComplete = existing.exists && existing.get("complete") === true;
    if (alreadyComplete) {
      if (existing.get("sha256") !== hash) {
        throw new HttpsError("already-exists", "Recovery snapshot ID is already in use.");
      }
    }

    if (!alreadyComplete) {
      const rateRef = db.collection("recoveryUploadLimits").doc(actorUid);
      await db.runTransaction(async (transaction) => {
        const rate = await transaction.get(rateRef);
        const day = new Date(now).toISOString().slice(0, 10);
        const count = rate.exists && rate.get("day") === day ? Number(rate.get("count") || 0) : 0;
        if (count >= 2_000) throw new HttpsError("resource-exhausted", "Recovery upload limit reached.");
        transaction.set(rateRef, { day, count: count + 1, updatedAt: FieldValue.serverTimestamp() });
      });

      const chunks = recoveryParts(content);
      await snapshotRef.set({
        complete: false,
        sha256: hash,
        partCount: chunks.length,
        byteLength,
        capturedAtClient,
        uploadedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      for (let offset = 0; offset < chunks.length; offset += 12) {
        const batch = db.batch();
        chunks.slice(offset, offset + 12).forEach((part, index) => {
          batch.set(snapshotRef.collection("parts").doc(String(offset + index).padStart(4, "0")), { text: part });
        });
        await batch.commit();
      }
      await snapshotRef.update({ complete: true, completedAt: FieldValue.serverTimestamp() });
    }

    const document = parsed as Record<string, unknown>;
    const title = String(document.title || document.name || "Unavngivet DISSK").slice(0, 300);
    const authEmail = typeof request.auth.token.email === "string"
      ? request.auth.token.email.toLowerCase() : null;
    const isAnonymous = request.auth.token.firebase?.sign_in_provider === "anonymous";
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(backupRef);
      if (current.exists && Number(current.get("latestClientCapturedAt") || 0) > capturedAtClient) return;
      transaction.set(backupRef, {
        title,
        searchText: recoveryText(document),
        source,
        projectId,
        installationId,
        authUid: actorUid,
        authEmail,
        anonymous: isAnonymous,
        createdAtClient,
        latestClientCapturedAt: capturedAtClient,
        latestSnapshotId: snapshotId,
        byteLength,
        firstSeenAt: current.exists ? current.get("firstSeenAt") : FieldValue.serverTimestamp(),
        lastSeenAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    const versions = await backupRef.collection("snapshots").orderBy("completedAt", "desc").get();
    for (const oldVersion of versions.docs.slice(8)) {
      await db.recursiveDelete(oldVersion.ref);
    }
    return { backupId, snapshotId };
  }
);
