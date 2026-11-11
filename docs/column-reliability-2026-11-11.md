# Column preservation and undo

Adding a column after the first of ten steps could silently remove the original
first step. Both editor update paths normalised arrays with `slice(-10)`, so an
eleventh step dropped the first element. Ordinary field edits also truncated
documents that already had more than ten steps.

All steps are now retained. Above ten steps, the editor shows a non-blocking
suggestion to organise the work into several del-DISSK. This suggestion does not
split, delete or modify the document and is excluded from exports.

The existing undo control was hidden. Its history mixed complete documents,
HTML strings and action labels; it also removed the latest previous state before
returning the next one. Document changes now capture one complete previous state
at the editor boundary. The visible, labelled Fortryd button pops that state and
replaces the complete content, including fields removed by the last action.
Undo saves the restored document normally. History holds up to 100 edits and is
cleared when leaving the editor, changing projects or changing accounts. It does
not restore changes made before the project was opened or before this release.

Numeric step IDs remain keys in style and symbol maps. Only legacy `steps`
objects are converted to arrays. Column colours read the current document rather
than stale local caches, so undo restores both saved and displayed colours.

Recovery backups previously retained only the last eight completed uploads. A
short editing session could therefore remove every version from before an
incident. After an initial change to keep hourly/daily checkpoints, the explicit
retention requirement is now to keep ALL snapshots. There is no automatic expiry,
count limit or pruning. Uploads only advance the latest-version pointer and never
remove older snapshot documents or their parts. Previously deleted versions
cannot be brought back by changing this policy.

## Validation

- Firebase Auth/Firestore emulator browser tests: 11 passed. Includes inserting
  an eleventh column, exact undo, save/reload, editing larger boards, deleted
  columns, project boundaries, text, colours, sharing and save failure handling.
- Export and zoom browser tests: 15 passed, including both export box layouts.
- Recovery integration test uploads through the emulated Firebase Function and
  verifies that all 72 versions and their content survive, including 70 historical
  versions, retries and a rejected attempt to overwrite a snapshot ID.
- Frontend and Functions TypeScript builds pass.

Incident records and original production copies are stored outside the repository.
No production project content was changed as part of the investigation.
