// npm --prefix functions run build, then node --test tests/recovery-retention.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
const { recoverySnapshotsToKeep } = createRequire(import.meta.url)('../functions/lib/recoveryRetention.js');
const start = Date.UTC(2026, 10, 11, 9);

test('a burst of edits retains the last eight and the first version from before the burst', () => {
  const versions = Array.from({ length: 200 }, (_, i) => ({ id: String(i), completedAtMillis: start + i * 1000 }));
  const keep = recoverySnapshotsToKeep(versions);
  assert(keep.has('0'));
  assert.deepEqual([...keep].filter(id => id !== '0').sort(), versions.slice(-8).map(v => v.id).sort());
});

test('hourly and daily checkpoints survive repeated pruning with bounded storage', () => {
  let retained = [];
  const all = [];
  for (let day = 0; day < 40; day++) for (let hour = 0; hour < 3; hour++) for (let edit = 0; edit < 15; edit++) {
    const version = { id: `${day}-${hour}-${edit}`, completedAtMillis: start + day * 86_400_000 + hour * 3_600_000 + edit * 1000 };
    all.push(version);
    retained.push(version);
    const keep = recoverySnapshotsToKeep(retained);
    retained = retained.filter(v => keep.has(v.id));
    assert(retained.length <= 62);
    assert(keep.has(version.id));
  }
  const ids = new Set(retained.map(v => v.id));
  for (let day = 10; day < 40; day++) assert(ids.has(`${day}-0-0`), `first version of day ${day}`);
  for (let day = 32; day < 40; day++) for (let hour = 0; hour < 3; hour++) assert(ids.has(`${day}-${hour}-0`));
  for (const version of all.slice(-8)) assert(ids.has(version.id));
  assert(!ids.has('0-0-0'), 'old checkpoints eventually rotate out');
});

test('out-of-order uploads cannot prune the snapshot referenced as the latest backup', () => {
  const versions = Array.from({ length: 200 }, (_, i) => ({ id: String(i), completedAtMillis: start + i * 1000 }));
  assert(!recoverySnapshotsToKeep(versions).has('100'));
  assert(recoverySnapshotsToKeep(versions, '100').has('100'));
  assert(recoverySnapshotsToKeep([], 'pending').has('pending'));
});
