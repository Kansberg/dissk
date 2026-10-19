// firebase emulators:exec --only auth,firestore --project demo-dissk 'node --test tests/persistence.e2e.mjs'
// PLAYWRIGHT_MODULE may point to an existing Playwright installation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { initializeApp } = require('../functions/node_modules/firebase-admin/lib/app/index.js');
const { getFirestore, Timestamp } = require('../functions/node_modules/firebase-admin/lib/firestore/index.js');
const { getAuth } = require('../functions/node_modules/firebase-admin/lib/auth/index.js');
assert(process.env.FIRESTORE_EMULATOR_HOST, 'Run through emulators:exec');
assert(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Auth emulator required');
const app = initializeApp({ projectId: 'demo-dissk' });
const db = getFirestore(app);
const adminAuth = getAuth(app);
const base = 'http://127.0.0.1:5188';
let browser, vite, uid, email;
const password = 'persistence-test-password';

before(async () => {
  email = `persistence-${crypto.randomUUID()}@example.com`;
  ({ uid } = await adminAuth.createUser({ email, password, emailVerified: true }));
  await db.doc(`users/${uid}`).set({ uid, email, emailLower: email, role: 'user', disabled: false });
  vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5188', '--strictPort'], {
    env: { ...process.env, VITE_FIREBASE_EMULATORS: 'true' }, stdio: 'ignore', windowsHide: true,
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (await fetch(base).then(r => r.ok).catch(() => false)) { ready = true; break; }
    await delay(200);
  }
  assert(ready, 'Vite started');
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); vite?.kill(); });

async function session() {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.route('**/*', route => {
    const host = new URL(route.request().url()).hostname;
    return host === '127.0.0.1' || host === 'localhost' ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  await page.goto(base);
  await page.evaluate(async ({ email, password }) => {
    const { auth } = await import('/src/firebase.ts');
    const { signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js');
    await signInWithEmailAndPassword(auth, email, password);
  }, { email, password });
  await page.getByRole('button', { name: 'Log ud', exact: true }).waitFor();
  return { context, page };
}

function document(id, title = 'Nyeste version') {
  return {
    id, title, owner: email, ownerUid: uid, sharedWith: {},
    createdAt: Timestamp.fromMillis(1000), updatedAt: Timestamp.fromMillis(2000),
    input: '<p>Seneste input</p>', output: '<p>Seneste output</p>',
    outputTime: '', outputAssumption: '', outputSign: '', outputHidden: { time: true },
    steps: [{ id: '1', title: '<p>Nyeste trin</p>', time: '', assumption: '', sign: '' }],
    effects: { short: '', long: '' }, context: '', styles: {}, stepSymbols: {},
    showTidAnsvar: true, showAntagelser: true, showContext: false, stepLabel: 'trin',
  };
}

test('home and editor retain global content, date, sharing and legacy recovery copy', async () => {
  const id = crypto.randomUUID();
  const current = document(id);
  current.sharedWith = { 'reader@example.com': 'read' };
  const stale = { ...document(id, 'Gammel version'), updatedAt: Timestamp.fromMillis(1000), input: '<p>Gammel tekst</p>' };
  await db.doc(`projects/${id}`).set(current);
  await db.doc(`users/${uid}/projects/${id}`).set(stale);
  const { context, page } = await session();
  try {
    await page.getByText('Nyeste version', { exact: true }).waitFor();
    await page.goto(`${base}/editor/${id}`);
    await page.getByRole('textbox', { name: 'Redigér titel' }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Redigér titel' }).inputValue(), 'Nyeste version');
    assert.match(await page.locator('.ql-editor').first().innerText(), /Seneste input/);
    const saved = (await db.doc(`projects/${id}`).get()).data();
    assert.equal(saved.updatedAt.toMillis(), 2000, 'opening does not change saved date');
    assert.deepEqual(saved.sharedWith, current.sharedWith);
    assert((await db.doc(`users/${uid}/projects/${id}`).get()).exists, 'legacy kept for recovery');
    assert(await page.locator('[data-save-state="saved"]').isVisible());
  } finally { await context.close(); }
});

test('legacy-only migration creates global document atomically without changing its date', async () => {
  const id = crypto.randomUUID();
  await db.doc(`users/${uid}/projects/${id}`).set(document(id, 'Kun gammel placering'));
  const { context, page } = await session();
  try {
    await page.goto(`${base}/editor/${id}`);
    await page.getByRole('textbox', { name: 'Redigér titel' }).waitFor();
    assert.equal((await db.doc(`projects/${id}`).get()).get('updatedAt').toMillis(), 2000);
    assert.equal((await db.doc(`users/${uid}/projects/${id}`).get()).exists, false);
  } finally { await context.close(); }
});

test('rapid edits across fields survive server acknowledgement and reopening', async () => {
  const id = crypto.randomUUID();
  await db.doc(`projects/${id}`).set(document(id));
  const { context, page } = await session();
  try {
    await page.goto(`${base}/editor/${id}`);
    const input = page.locator('.ql-editor').first();
    await input.waitFor();
    await input.fill('Opdateret input');
    await page.getByRole('textbox', { name: 'Redigér titel' }).fill('Opdateret titel');
    const time = page.locator('.ql-editor[data-placeholder="Tid & ansvar"]').first();
    await time.fill('Ny tid');
    await page.locator('[data-save-state="saved"]').waitFor();
    const saved = (await db.doc(`projects/${id}`).get()).data();
    assert.match(saved.input, /Opdateret input/);
    assert.equal(saved.title, 'Opdateret titel');
    assert.match(saved.steps[0].time, /Ny tid/);
    assert.deepEqual(saved.outputHidden, { time: true });
    await page.reload();
    await input.waitFor();
    assert.match(await input.innerText(), /Opdateret input/);
    assert.equal(await page.getByRole('textbox', { name: 'Redigér titel' }).inputValue(), 'Opdateret titel');
    assert.match(await time.innerText(), /Ny tid/);
  } finally { await context.close(); }
});

test('offline edits remain pending until the server acknowledges them', async () => {
  const id = crypto.randomUUID();
  await db.doc(`projects/${id}`).set(document(id));
  const { context, page } = await session();
  try {
    await page.goto(`${base}/editor/${id}`);
    await page.locator('.ql-editor').first().waitFor();
    await page.evaluate(async () => {
      const { db } = await import('/src/firebase.ts');
      const source = await fetch('/src/firebase.ts').then(r => r.text());
      const url = source.match(/from "([^"]*firebase_firestore[^"]*)"/)[1];
      const { disableNetwork } = await import(url);
      await disableNetwork(db);
    });
    await page.getByRole('textbox', { name: 'Redigér titel' }).fill('Afventer net');
    await page.locator('[data-save-state="saving"]').waitFor();
    assert.equal((await db.doc(`projects/${id}`).get()).get('title'), 'Nyeste version');
    await page.evaluate(async () => {
      const { db } = await import('/src/firebase.ts');
      const source = await fetch('/src/firebase.ts').then(r => r.text());
      const url = source.match(/from "([^"]*firebase_firestore[^"]*)"/)[1];
      const { enableNetwork } = await import(url);
      await enableNetwork(db);
    });
    await page.locator('[data-save-state="saved"]').waitFor();
    assert.equal((await db.doc(`projects/${id}`).get()).get('title'), 'Afventer net');
  } finally { await context.close(); }
});

test('typing is saved while the final field stays focused, and pending writes survive navigation', async () => {
  const id = crypto.randomUUID();
  const current = document(id);
  current.showContext = true;
  current.outputHidden = {};
  await db.doc(`projects/${id}`).set(current);
  const { context, page } = await session();
  try {
    await page.goto(`${base}/editor/${id}`);
    await page.locator('.ql-editor').first().waitFor();
    const fields = [
      ['.ql-editor', 0, p => p.input],
      ['.ql-editor[data-placeholder="Tid & ansvar"]', 0, p => p.steps[0].time],
      ['.ql-editor[data-placeholder="Antagelser"]', 0, p => p.steps[0].assumption],
      ['.ql-editor[data-placeholder="Trin"]', 0, p => p.steps[0].title],
      ['.ql-editor[data-placeholder="Tegn"]', 0, p => p.steps[0].sign],
      ['[data-fieldtype^="outputTime"] .ql-editor', 0, p => p.outputTime],
      ['[data-fieldtype^="outputAssump"] .ql-editor', 0, p => p.outputAssumption],
      ['[data-fieldtype^="outputMid"] .ql-editor', 0, p => p.output],
      ['[data-fieldtype^="outputSign"] .ql-editor', 0, p => p.outputSign],
      ['.ql-editor[data-placeholder="Kontekst"]', 0, p => p.context],
      ['.ql-editor[data-placeholder="Kortsigtet effekt"]', 0, p => p.effects.short],
      ['.ql-editor[data-placeholder="Langsigtet effekt"]', 0, p => p.effects.long],
    ];
    for (let i = 0; i < fields.length; i++) {
      const [selector, index, read] = fields[i];
      const field = page.locator(selector).nth(index);
      await field.fill(`Fokuseret felt ${i}`);
      await page.locator('[data-save-state="saved"]').waitFor();
      assert(await field.evaluate(el => el === document.activeElement), `field ${i} stayed focused`);
      assert.match(read((await db.doc(`projects/${id}`).get()).data()), new RegExp(`Fokuseret felt ${i}`));
    }
    await page.getByRole('textbox', { name: 'Redigér titel' }).fill('Gem ved navigation');
    await page.locator('img[alt="UCN Logo"]').click();
    await page.waitForURL(base + '/');
    await delay(600);
    assert.equal((await db.doc(`projects/${id}`).get()).get('title'), 'Gem ved navigation');
  } finally { await context.close(); }
});

test('read failure never opens or writes a replacement blank document', async () => {
  const id = crypto.randomUUID();
  const current = document(id);
  await db.doc(`projects/${id}`).set({ ...current, owner: 'other@example.com', ownerUid: 'other-user' });
  const { context, page } = await session();
  try {
    await page.goto(`${base}/editor/${id}`);
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('.ql-editor').count(), 0);
    assert.equal((await db.doc(`projects/${id}`).get()).get('input'), current.input);
  } finally { await context.close(); }
});

test('rejected save is visible and retry succeeds without recreating a deleted project', async () => {
  const id = crypto.randomUUID();
  const current = document(id);
  await db.doc(`projects/${id}`).set(current);
  const { context, page } = await session();
  try {
    await page.goto(`${base}/editor/${id}`);
    await page.locator('.ql-editor').first().waitFor();
    await db.doc(`projects/${id}`).delete();
    await page.getByRole('textbox', { name: 'Redigér titel' }).fill('Bevar denne ændring');
    await page.locator('[data-save-state="error"]').waitFor();
    assert.equal((await db.doc(`projects/${id}`).get()).exists, false);
    await db.doc(`projects/${id}`).set(current);
    await page.getByRole('button', { name: 'Prøv at gemme igen' }).click();
    await page.locator('[data-save-state="saved"]').waitFor();
    assert.equal((await db.doc(`projects/${id}`).get()).get('title'), 'Bevar denne ændring');
  } finally { await context.close(); }
});
