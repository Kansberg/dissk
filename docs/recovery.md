# Genoprettelse af lokale DISSK-projekter

Redigeringer bliver lagt i en lokal IndexedDB-kø og sendt til Firebase-funktionen
`saveRecoveryBackup`. Eksisterende `sessionStorage`- og `localStorage`-projekter
bliver også forsøgt sendt, når appen åbnes. Køen prøver igen ved netforbindelse,
fokus og næste besøg. Enheden skal på nettet mindst én gang efter redigeringen,
før kopien findes i Firebase.

Kopierne ligger under `recoveryBackups/{id}` med titel, oprettelsesdato,
seneste tidspunkt, eventuel login-e-mail, projektnummer og søgetekst. Indholdet
ligger i nummererede dele under `snapshots/{snapshotId}/parts`; SHA-256
kontrolleres ved eksport. De seneste otte snapshots per projekt beholdes.
Firestore-reglerne afviser alle browserklienter, også administratorer i appen.
Firebase-adgang via IAM/Admin SDK kræves for at læse kopierne.

Med `gcloud` logget ind på Firebase-projektet:

```powershell
node scripts/recovery.mjs search "ord fra titel eller indhold"
node scripts/recovery.mjs search --deep "ord langt inde i indholdet"
node scripts/recovery.mjs search "2026-09-28"
node scripts/recovery.mjs export BACKUP_ID gendannet.json
node scripts/recovery.mjs attach BACKUP_ID FIREBASE_UID bruger@example.com
```

`attach` kontrollerer, at UID og e-mail tilhører samme Firebase-konto, og
opretter et nyt almindeligt DISSK-projekt. Eksportér og gennemgå indholdet,
før du knytter det til en bruger. Filen fra `export` indeholder både metadata
og det fulde dokument.

Lokal integrationstest (kræver Firebase CLI og installerede dependencies i
både rodmappen og `functions`):

```powershell
firebase emulators:exec --only 'auth,firestore,functions' --project demo-dissk 'node tests/recovery.e2e.mjs'
```
