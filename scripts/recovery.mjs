import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const PROJECT = "dissk-d07b5";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const [, , command, ...args] = process.argv;

if (!["search", "export", "attach"].includes(command)) {
  console.error("Usage: node scripts/recovery.mjs search [--deep] <text> | export <backup-id> [file.json] | attach <backup-id> <uid> <email>");
  process.exit(2);
}

const token = execFileSync(
  process.platform === "win32" ? "gcloud.cmd" : "gcloud",
  ["auth", "print-access-token"],
  { encoding: "utf8", shell: process.platform === "win32" }
).trim();

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": PROJECT,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${payload.error?.message || response.statusText}`);
  return payload;
}

function value(raw) {
  if (!raw) return null;
  if ("stringValue" in raw) return raw.stringValue;
  if ("integerValue" in raw) return Number(raw.integerValue);
  if ("doubleValue" in raw) return raw.doubleValue;
  if ("booleanValue" in raw) return raw.booleanValue;
  if ("timestampValue" in raw) return raw.timestampValue;
  if ("arrayValue" in raw) return (raw.arrayValue.values || []).map(value);
  if ("mapValue" in raw) return Object.fromEntries(Object.entries(raw.mapValue.fields || {}).map(([key, field]) => [key, value(field)]));
  return null;
}

function fields(raw) {
  return Object.fromEntries(Object.entries(raw || {}).map(([key, field]) => [key, value(field)]));
}

function encode(item) {
  if (item == null) return { nullValue: null };
  if (typeof item === "string") return { stringValue: item };
  if (typeof item === "boolean") return { booleanValue: item };
  if (typeof item === "number") return Number.isInteger(item)
    ? { integerValue: String(item) } : { doubleValue: item };
  if (Array.isArray(item)) return { arrayValue: { values: item.map(encode) } };
  if (typeof item === "object") return {
    mapValue: { fields: Object.fromEntries(Object.entries(item).filter(([, val]) => val !== undefined).map(([key, val]) => [key, encode(val)])) },
  };
  throw new Error(`Unsupported field type: ${typeof item}`);
}

function firestoreDocument(data) {
  return { fields: Object.fromEntries(Object.entries(data).filter(([, val]) => val !== undefined).map(([key, val]) => [key, encode(val)])) };
}

function validateId(id) {
  if (!/^[a-f0-9]{64}$/.test(id || "")) throw new Error("Invalid backup ID.");
  return id;
}

async function getBackup(id) {
  const raw = await request(`${BASE}/recoveryBackups/${validateId(id)}`);
  return fields(raw.fields);
}

async function readSnapshot(id, metadata) {
  const snapshotId = metadata.latestSnapshotId;
  if (!/^[a-f0-9-]{36}$/i.test(snapshotId || "")) throw new Error("Backup has no complete snapshot.");
  const snapshot = fields((await request(`${BASE}/recoveryBackups/${id}/snapshots/${snapshotId}`)).fields);
  if (snapshot.complete !== true) throw new Error("The snapshot is incomplete.");
  const chunks = [];
  for (let offset = 0; offset < snapshot.partCount; offset += 10) {
    const group = await Promise.all(
      Array.from({ length: Math.min(10, snapshot.partCount - offset) }, (_, index) =>
        request(`${BASE}/recoveryBackups/${id}/snapshots/${snapshotId}/parts/${String(offset + index).padStart(4, "0")}`)
      )
    );
    chunks.push(...group.map((part) => value(part.fields?.text)));
  }
  const content = chunks.join("");
  if (createHash("sha256").update(content).digest("hex") !== snapshot.sha256) {
    throw new Error("Backup integrity check failed.");
  }
  return JSON.parse(content);
}

async function listBackups() {
  const all = [];
  let nextPage = "";
  do {
    const url = new URL(`${BASE}/recoveryBackups`);
    url.searchParams.set("pageSize", "100");
    if (nextPage) url.searchParams.set("pageToken", nextPage);
    const result = await request(url);
    all.push(...(result.documents || []).map((raw) => ({ id: raw.name.split("/").pop(), ...fields(raw.fields) })));
    nextPage = result.nextPageToken || "";
  } while (nextPage);
  return all;
}

if (command === "search") {
  const deep = args[0] === "--deep";
  const term = (deep ? args.slice(1) : args).join(" ").trim().toLowerCase();
  if (!term) throw new Error("Provide a title, date, email, or content fragment.");
  const backups = await listBackups();
  let count = 0;
  for (const backup of backups) {
    const searchable = [
      backup.title, backup.projectId, backup.source, backup.authEmail,
      backup.searchText, backup.firstSeenAt, backup.lastSeenAt,
      backup.createdAtClient ? new Date(backup.createdAtClient).toISOString() : "",
    ].join(" ").toLowerCase();
    if (!searchable.includes(term)) {
      if (!deep || !JSON.stringify(await readSnapshot(backup.id, backup)).toLowerCase().includes(term)) continue;
    }
    count += 1;
    console.log(JSON.stringify({
      id: backup.id,
      title: backup.title,
      source: backup.source,
      email: backup.authEmail,
      created: backup.createdAtClient ? new Date(backup.createdAtClient).toISOString() : backup.firstSeenAt,
      lastSeen: backup.lastSeenAt,
      projectId: backup.projectId,
    }));
  }
  console.log(`${count} of ${backups.length} backups matched.`);
}

if (command === "export") {
  const id = validateId(args[0]);
  const metadata = await getBackup(id);
  const document = await readSnapshot(id, metadata);
  const output = args[1] || `recovery-${id}.json`;
  writeFileSync(output, JSON.stringify({ metadata, document }, null, 2), { encoding: "utf8", flag: "wx" });
  console.log(`Exported ${id} to ${output}`);
}

if (command === "attach") {
  const id = validateId(args[0]);
  const uid = args[1];
  const email = args[2]?.toLowerCase();
  if (!uid || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "")) {
    throw new Error("Provide the target Firebase UID and email.");
  }
  const lookup = await request(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,
    { method: "POST", body: JSON.stringify({ email: [email] }) }
  );
  if (!lookup.users?.some((user) => user.localId === uid)) {
    throw new Error("The UID and email do not belong to the same Firebase account.");
  }
  const targetProfile = fields((await request(`${BASE}/users/${encodeURIComponent(uid)}`)).fields);
  if (targetProfile.disabled === true) throw new Error("The target DISSK account is disabled.");
  if (targetProfile.archiveAt && Date.parse(targetProfile.archiveAt) <= Date.now()) {
    throw new Error("The target DISSK account is archived.");
  }
  const metadata = await getBackup(id);
  const saved = await readSnapshot(id, metadata);
  const document = saved.data && typeof saved.data === "object" && !saved.steps ? saved.data : saved;
  const newId = randomUUID();
  const now = new Date().toISOString();
  const project = {
    ...document,
    id: newId,
    title: String(document.title || metadata.title || "Gendannet DISSK"),
    owner: email,
    ownerUid: uid,
    sharedWith: {},
    recoveredFrom: id,
  };
  const payload = firestoreDocument(project);
  payload.fields.createdAt = { timestampValue: now };
  payload.fields.updatedAt = { timestampValue: now };
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 950_000) {
    throw new Error("This document is too large for a normal DISSK project. Export it instead.");
  }
  await request(`${BASE}/projects/${newId}`, { method: "PATCH", body: JSON.stringify(payload) });
  console.log(`Attached recovery ${id} as project ${newId} for ${email}.`);
}
