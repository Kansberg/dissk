import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { connectFirestoreEmulator, doc, getDoc, getFirestore } from 'firebase/firestore';

const require = createRequire(import.meta.url);
const { initializeApp: initializeAdmin } = require('../functions/node_modules/firebase-admin/lib/app/index.js');
const { getFirestore: getAdminFirestore } = require('../functions/node_modules/firebase-admin/lib/firestore/index.js');

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
process.exit(0);
