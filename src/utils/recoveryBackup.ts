import { getApps, initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, auth } from "../firebase";

export type RecoverySource = "anonymous" | "editor" | "legacyLocal" | "mini";

type PendingBackup = {
  key: string;
  installationId: string;
  projectId: string;
  snapshotId: string;
  source: RecoverySource;
  content: string;
  capturedAtClient: number;
  createdAtClient: number;
};

const DB_NAME = "dissk-recovery-v1";
const STORE_NAME = "pending";
const INSTALLATION_KEY = "dissk_recovery_installation_id";
const RETRY_MS = 30_000;
let dbPromise: Promise<IDBDatabase> | null = null;
let initialized = false;
let flushing = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let installationIdMemory: string | null = null;
const memoryQueue = new Map<string, PendingBackup>();
const queueWrites = new Map<string, Promise<void>>();

function installationId(): string {
  if (installationIdMemory) return installationIdMemory;
  try {
    const stored = localStorage.getItem(INSTALLATION_KEY);
    if (stored && /^[a-f0-9-]{36}$/i.test(stored)) return (installationIdMemory = stored);
  } catch { /* Storage can be unavailable in private browsing. */ }
  installationIdMemory = crypto.randomUUID();
  try { localStorage.setItem(INSTALLATION_KEY, installationIdMemory); } catch { /* Keep it for this page. */ }
  return installationIdMemory;
}

function recoveryDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function storePending(item: PendingBackup): Promise<void> {
  const database = await recoveryDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(item);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function allPending(): Promise<PendingBackup[]> {
  const database = await recoveryDb();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as PendingBackup[]);
    request.onerror = () => reject(request.error);
  });
}

async function pendingByKey(key: string): Promise<PendingBackup | undefined> {
  const database = await recoveryDb();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as PendingBackup | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function removePending(key: string, snapshotId: string): Promise<void> {
  const database = await recoveryDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => {
      if ((request.result as PendingBackup | undefined)?.snapshotId === snapshotId) store.delete(key);
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function scheduleFlush(delay = 2_000): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushRecoveryBackups();
  }, delay);
}

function createdAt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object") {
    const timestamp = value as { seconds?: unknown; toMillis?: () => number };
    if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
    if (typeof timestamp.seconds === "number") return timestamp.seconds * 1_000;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function queueRecoveryBackup(document: Record<string, unknown>, source: RecoverySource): void {
  const projectId = document.id;
  if (typeof projectId !== "string" || !projectId || projectId.length > 160) return;
  let content: string;
  try { content = JSON.stringify(document); } catch { return; }

  const now = Date.now();
  const browserId = installationId();
  const key = `${browserId}:${source}:${projectId}`;
  const write = async () => {
    let previous: PendingBackup | undefined;
    try { previous = await pendingByKey(key); } catch { previous = memoryQueue.get(key); }
    if (previous?.content === content) return;
    const item: PendingBackup = {
      key,
      installationId: browserId,
      projectId,
      snapshotId: crypto.randomUUID(),
      source,
      content,
      capturedAtClient: now,
      createdAtClient: previous?.createdAtClient ?? createdAt(document.createdAt, now),
    };
    try {
      await storePending(item);
      memoryQueue.delete(key);
    }
    catch { memoryQueue.set(key, item); }
    scheduleFlush();
  };
  const next = (queueWrites.get(key) ?? Promise.resolve()).then(write);
  queueWrites.set(key, next);
  void next.finally(() => {
    if (queueWrites.get(key) === next) queueWrites.delete(key);
  });
}

async function backupFunctions() {
  await auth.authStateReady();
  if (auth.currentUser) return getFunctions(app, "europe-west1");

  // A separate Firebase app keeps anonymous backup auth out of DISSK's login state.
  const backupApp = getApps().find((candidate) => candidate.name === "dissk-recovery")
    ?? initializeApp(app.options, "dissk-recovery");
  const backupAuth = getAuth(backupApp);
  await backupAuth.authStateReady();
  if (!backupAuth.currentUser) await signInAnonymously(backupAuth);
  return getFunctions(backupApp, "europe-west1");
}

export async function flushRecoveryBackups(): Promise<void> {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const pending = await allPending().catch(() => [] as PendingBackup[]);
    const combined = new Map(pending.map((item) => [item.key, item]));
    memoryQueue.forEach((item, key) => combined.set(key, item));
    if (!combined.size) return;
    const functions = await backupFunctions();
    const save = httpsCallable(functions, "saveRecoveryBackup", { timeout: 120_000 });
    for (const item of [...combined.values()].sort((a, b) => a.capturedAtClient - b.capturedAtClient)) {
      try {
        await save({
          installationId: item.installationId,
          projectId: item.projectId,
          snapshotId: item.snapshotId,
          source: item.source,
          content: item.content,
          capturedAtClient: item.capturedAtClient,
          createdAtClient: item.createdAtClient,
        });
        await removePending(item.key, item.snapshotId).catch(() => undefined);
        if (memoryQueue.get(item.key)?.snapshotId === item.snapshotId) memoryQueue.delete(item.key);
      } catch (error) {
        console.warn("[Recovery] Backup afventer forbindelse til Firebase:", error);
        scheduleFlush(RETRY_MS);
      }
    }
  } catch (error) {
    console.warn("[Recovery] Backup afventer forbindelse til Firebase:", error);
    scheduleFlush(RETRY_MS);
  } finally {
    flushing = false;
  }
}

function enqueueStoredProjects(): void {
  try {
    const session = sessionStorage.getItem("dissk_anon_session");
    if (session) queueRecoveryBackup(JSON.parse(session), "anonymous");
  } catch { /* A malformed old session cannot be recovered. */ }
  try {
    const raw = localStorage.getItem("dissk_local_projects");
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    const entries = Array.isArray(parsed)
      ? parsed : parsed && typeof parsed === "object" ? Object.values(parsed) : [];
    entries.forEach((entry) => {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        queueRecoveryBackup(entry as Record<string, unknown>, "legacyLocal");
      }
    });
  } catch { /* Keep the app usable even if an old storage entry is corrupt. */ }
}

export function initializeRecoveryBackups(): void {
  if (initialized) return;
  initialized = true;
  enqueueStoredProjects();
  scheduleFlush(0);
  window.addEventListener("online", () => scheduleFlush(0));
  window.addEventListener("focus", () => scheduleFlush(0));
  window.addEventListener("pagehide", () => void flushRecoveryBackups());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushRecoveryBackups();
  });
  onAuthStateChanged(auth, () => scheduleFlush(0));
  window.setInterval(() => scheduleFlush(0), RETRY_MS);
}
