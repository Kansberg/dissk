# Eksport af store DISSK-skemaer

Åbn projektet og vent på "Gemt på serveren", hvis der er foretaget ændringer.
Vælg **Menu → Download**. Vælg PDF eller PNG og den ønskede størrelse.

Under **Kassehøjde** kan der vælges:

- **Dynamiske – højde efter indhold:** Hver kasse følger sin egen tekst.
- **Ens højde pr. række:** Alle kasser i den samme række får højde efter den
  højeste kasse i rækken. Tid & ansvar, Antagelser, Input/Trin/Output og Tegn behandles
  hver for sig. De to effektkasser udgør deres egen række.

Valget ændrer kun eksporten. Indhold, farver og det gemte projekt bevares.
Kontekst medtages, når kontekstvisning er slået til i projektet.
Input, Trin og Output står på samme vandrette linje. Kontekst står øverst i
højre kolonne med effekterne nedenunder, både i editoren og i eksporten.

Klik **Eksporter** og vent på download. Hele skemaet placeres på én PDF-side.
Et stort skema kan derfor se småt ud ved "Tilpas til side" i PDF-læseren;
zoom ind for at læse teksten. A2 er et praktisk udgangspunkt til et stort
skema, men hele indholdet medtages også i de øvrige størrelser.

I editoren kan **Auto** vise hele skemaet, også når det kræver mindre end
30 procent zoom. Klik på procentknappen for manuel 100-procent-visning og
rul i begge retninger. En synlig fejlbesked vises, hvis eksporten fejler.

## Rettelsen fra november 2026

html2canvas bruges med `scale: 1` på en eksport-ramme, hvor DOM-indholdet
skaleres til den ønskede størrelse. Det undgår beskæring i foreignObject-
rendereren ved skalering under 1. Rammens pixelmål begrænses før rendering,
så meget store dokumenter ikke kræver et ubegrænset stort lærred.
Kassehøjder beregnes i en separat klon, før eksporten skaleres.

Editorens zoom har en afgrænset visningsflade svarende til de skalerede mål.
Auto tager højde for topbjælke og afstand omkring skemaet. Rulning forbliver
tilgængelig, hvis indholdet overstiger visningsområdet.

Regressionstestene i `tests/export.e2e.mjs` kontrollerer faktiske pixels i
downloadede billeder: output, kontekst og begge effekter til højre samt en
markør nederst i en lang tekst. Begge kasselayouts testes med Original, A4 og
A2; desuden testes PDF, teksthøjder, bevaret editorindhold og et højt skema
med ni trin. Zoomtests og Firebase-integrationstests dækker henholdsvis manuel
zoom og det samlede gemme-/downloadforløb, inklusive synlige eksportfejl.
