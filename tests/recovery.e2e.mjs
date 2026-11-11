import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { connectFirestoreEmulator, doc, getDoc, getFirestore } from 'firebase/firestore';

const require = createRequire(import.meta.url);
const { initializeApp: initializeAdmin } = require('../functions/node_modules/firebase-admin/lib/app/index.js');
const { getFirestore: getAdminFirestore, Timestamp } = require('../functions/node_modules/firebase-admin/lib/firestore/index.js');

const app = initializeApp({ apiKey: 'demo', authDomain: 'demo-dissk.firebaseapp.com', projectId: 'demo-dissk', appId: '1:1:web:test' });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const functions = getFunctions(app, 'europe-west1');
connectFunctionsEmulator(functions, '127.0.0.1', 5001);
const firestore = getFirestore(app);
connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
const adminDb = getAdminFirestore(initializeAdmin({ projectId: 'demo-dissk' }));

const signedIn = await signInAnonymously(auth);
assert(signedIn.user.isAnonymous);
const projectId = crypto.randomUUID();
const installationId = crypto.randomUUID();
const content = JSON.stringify({ id: projectId, title: 'Genopret mig', input: 'A'.repeat(120_000) + '😀 gemt tekst', steps: [] });
const upload = httpsCallable(functions, 'saveRecoveryBackup');
const data = {
  installationId,
  projectId,
  snapshotId: crypto.randomUUID(),
  source: 'anonymous',
  content,
  capturedAtClient: Date.now(),
  createdAtClient: Date.now() - 5000,
};
const result = (await upload(data)).data;
assert.match(result.backupId, /^[a-f0-9]{64}$/);
const backup = await adminDb.collection('recoveryBackups').doc(result.backupId).get();
assert.equal(backup.get('title'), 'Genopret mig');
assert.equal(backup.get('anonymous'), true);
const snapshot = await backup.ref.collection('snapshots').doc(data.snapshotId).get();
assert.equal(snapshot.get('complete'), true);
assert(snapshot.get('partCount') >= 2);
const parts = await snapshot.ref.collection('parts').orderBy('__name__').get();
assert.equal(parts.docs.map((part) => part.get('text')).join(''), content);
await assert.rejects(getDoc(doc(firestore, 'recoveryBackups', result.backupId)), (error) => error.code === 'permission-denied');
console.log('Recovery backup: upload, private read and full-content reconstruction passed');

// More versions than either former retention policy allowed, including old days.
const historical = Array.from({ length: 70 }, (_, i) => {
  const capturedAtClient = Date.now() - (i + 1) * 86_400_000;
  const text = JSON.stringify({ id: projectId, title: `Version ${i}`, input: `Bevar hele denne tekst ${i}` });
  return { id: crypto.randomUUID(), capturedAtClient, text };
});
const seed = adminDb.batch();
for (const old of historical) {
  const ref = backup.ref.collection('snapshots').doc(old.id);
  seed.set(ref, { complete: true, sha256: createHash('sha256').update(old.text).digest('hex'),
    partCount: 1, byteLength: Buffer.byteLength(old.text), capturedAtClient: old.capturedAtClient,
    uploadedAt: Timestamp.fromMillis(old.capturedAtClient), completedAt: Timestamp.fromMillis(old.capturedAtClient) });
  seed.set(ref.collection('parts').doc('0000'), { text: old.text });
}
await seed.commit();
const next = { ...data, snapshotId: crypto.randomUUID(), capturedAtClient: Date.now(),
  content: JSON.stringify({ id: projectId, title: 'Nyeste version', input: 'Ny tekst' }) };
await upload(next);
assert.equal((await backup.ref.collection('snapshots').get()).size, 72, 'all older snapshots survive another upload');
for (const old of historical) {
  const ref = backup.ref.collection('snapshots').doc(old.id);
  assert((await ref.get()).exists, `version ${old.id} retained`);
  assert.equal((await ref.collection('parts').doc('0000').get()).get('text'), old.text);
}
assert.equal((await backup.ref.get()).get('latestSnapshotId'), next.snapshotId);
await upload(data); // Retry an earlier completed upload without losing newer data.
assert.equal((await backup.ref.collection('snapshots').get()).size, 72);
assert.equal((await backup.ref.get()).get('latestSnapshotId'), next.snapshotId);
const conflicting = { ...data, content: JSON.stringify({ title: 'Må ikke overskrive historik' }) };
await assert.rejects(upload(conflicting), error => error.code === 'functions/already-exists');
const originalParts = await snapshot.ref.collection('parts').orderBy('__name__').get();
assert.equal(originalParts.docs.map(part => part.get('text')).join(''), content);
console.log('Recovery backup: all 72 versions and their content retained, retry safe and conflicting overwrite rejected');
process.exit(0);
