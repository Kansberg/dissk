# Analyse af gemning i DISSK, 19. oktober 2026

Der er fundet og rettet flere fejl, som kan forklare, at en PDF indeholder nyere
tekst end det projekt, der senere åbnes. Den præcise hændelsesrækkefølge for den
indmeldte sag kan ikke fastslås ud fra de tilgængelige historiske data.

## Fund og rettelser

1. **Tekst ventede på fokusændring eller ti minutters inaktivitet.** Input,
   kontekst, effekter, trin og output havde separate lokale værdier eller
   tidsstyrede gemninger. En PDF blev lavet fra det synlige indhold og var
   derfor ikke dokumentation for, at indholdet var gemt på serveren. Trinfelter
   ændrede desuden eksisterende React-state direkte. Alle tekstfelter opdaterer
   nu dokumentets state ved hver brugerændring uden at ændre tidligere state.
   Gemmekøen samler højst 400 ms af ændringer og fortsætter ved sideskift.
   De gamle timere, globale feltværdier og fokusbaserede gemninger er fjernet.
2. **Gamle private projektkopier kunne overskrive det aktuelle projekt.**
   Forsiden kopierede indhold fra `users/{uid}/projects/{id}` over i
   `projects/{id}`, også når sidstnævnte allerede fandtes. Editorens indlæsning
   prioriterede ligeledes den gamle kopi og kunne skrive den tilbage med en ny
   gemmedato. Den globale fil er nu autoritativ. En eventuel ekstra privat kopi
   beholdes som grundlag for genoprettelse. Migration til en manglende global
   fil sker i en transaktion, som bevarer dokumentets gemmedato.
3. **En indlæsningsfejl kunne føre til et tomt dokument under samme ID.**
   Fejlen vises nu, og editoren åbner ikke en tom erstatning. Gemning opdaterer
   kun et eksisterende projekt og kan ikke genskabe et slettet projekt.
4. **Gemmestatus var ikke synlig i den almindelige editor.** Editorens nye status
   viser ventende gemning, netværksafbrydelse og fejl med mulighed for at prøve
   igen. "Gemt på serveren" vises efter serverens bekræftelse. En bekræftelse på
   en tidligere ændring kan ikke markere en nyere ventende ændring som gemt.
   Browseren advarer ved lukning med ubekræftede ændringer.
5. **Feltlyttere fastholdt gamle callbacks.** Quill anvender nu den aktuelle
   callback, så ændringer følger den aktuelle dokumenttilstand og adgang.

Indlæsning henter projektet fra serveren og ændrer ikke gemmedatoen. Gemning
bevarer ejerskab, deling og oprettelsesdato. Eksisterende lokale zoomrettelser
er bevaret.

## Den konkrete sag

Begge projekter findes på serveren. To relevante backuphistorikker indeholder
tilsammen 16 komplette snapshots, alle fra den 19. oktober. Der er taget separate
lokale kopier af de aktuelle projekter og backuphistorikkerne; indholdets SHA-256
er kontrolleret. Materialet ligger uden for dette repository i
`C:\Sandbox\private\DISSK-incident-2026-10-19`.

Der er ikke fundet en verificerbar serverkopi fra den 14. oktober i den
undersøgte recoveryhistorik. Databasens point-in-time recovery er deaktiveret.
Brugerens downloadede PDF er derfor et vigtigt grundlag for sammenligning og
eventuel genindtastning. Der er ikke skrevet til brugerens produktionsprojekter.

## Validering og levering

`npm run build` består. Syv browserbaserede integrationstests består med lokal
Firebase Auth, Firestore og de faktiske adgangsregler. De dækker gamle kopier,
migration, hurtige ændringer på tværs af felter, alle 12 tekstfelter med fokus
bevaret, sideskift, afbrudt netværk, afvist indlæsning og afvist gemning med retry.
Testene blokerer eksterne browserkald og bruger kun projektet `demo-dissk`.
De seks eksisterende zoomtests består også ved 100, 125 og 150 procent skalering.
Den målrettede lintkontrol viser fortsat eksisterende `any`-, tomme catch- og
hookadvarsler i de berørte ældre komponenter; projektet er ikke generelt lintfrit.

```powershell
# PLAYWRIGHT_MODULE kan pege på en eksisterende Playwright-installation.
firebase emulators:exec --only 'auth,firestore' --project demo-dissk 'node --test tests/persistence.e2e.mjs'
```

Udgivelsen omfatter både hosting og Firestore-reglerne. Regelændringen tillader ejeren at kontrollere
en manglende migrationsdestination, når ejerens private kildeprojekt findes.
Ændringen giver ikke adgang til andres eksisterende projekter.

Samtidige redigeringer af samme projekt i flere faner eller hos flere brugere
har fortsat den eksisterende adfærd, hvor den sidste komplette gemning vinder.
Denne rettelse indfører ikke konfliktløsning mellem samtidige redaktører.
Gamle åbne klienter skal genindlæses efter en udgivelse.

Transaktionernes genforsøg og atomiske skrivning følger
[Firebases dokumentation](https://firebase.google.com/docs/firestore/manage-data/transactions).
