type SnapshotVersion = { id: string; completedAtMillis: number };

/** Recent edits plus the first saved version in older hours and days.
 * Keep at most 63 versions, including a protected latest-backup pointer.
 * Use server completion times, rather than the browser's clock.
 */
export function recoverySnapshotsToKeep(versions: SnapshotVersion[], latestSnapshotId?: string): Set<string> {
  const ordered = [...versions].sort((a, b) => b.completedAtMillis - a.completedAtMillis);
  const keep = new Set(ordered.slice(0, 8).map(version => version.id));
  if (latestSnapshotId) keep.add(latestSnapshotId);
  for (const [interval, count] of [[3_600_000, 24], [86_400_000, 30]]) {
    const firstInBucket = new Map<number, string>();
    for (const version of ordered) {
      const bucket = Math.floor(version.completedAtMillis / interval);
      if (firstInBucket.has(bucket) || firstInBucket.size < count) {
        firstInBucket.set(bucket, version.id);
      }
    }
    for (const id of firstInBucket.values()) keep.add(id);
  }
  return keep;
}
