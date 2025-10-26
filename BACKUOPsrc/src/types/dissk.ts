// src/types/dissk.ts

export type Role = 'owner' | 'editor' | 'reader';

export interface Participant {
  uid?: string;          // sættes hvis brugeren findes i Firebase Auth/users-index
  email: string;         // primær nøgle til deling
  role: Role;            // reader | editor (owner ligger kun på ownerUid)
  displayName?: string;
}

export interface Sign {
  id: string;
  kind: 'outer' | 'inner';   // ydre/indre tegn
  text: string;
  actorGroup?: string;       // valgfri: “forældre”, “lærere” osv.
}

export interface Assumption {
  id: string;
  text: string;
}

export interface TimeResp {
  deadline?: string;         // ISO dato eller fri tekst
  responsible?: string[];    // emails eller uids
}

export interface Step {
  id: string;
  title: string;             // “Trin”
  time?: TimeResp;           // “Tid & ansvar”
  assumptions?: Assumption[];// “Antagelser” (kan være tom)
  signs?: Sign[];            // “Tegn”
}

export interface Effects {
  short?: string;            // Kortsigtet effekt
  long?: string;             // Langsigtet effekt
}

export interface DisskDoc {
  id: string;
  title: string;             // vises i topbar (obligatorisk)
  ownerUid: string;
  participants: Participant[];
  input?: string;
  steps: Step[];             // anbefalet <= ~10
  output?: string;
  effects?: Effects;         // til højre for stiplede linje
  context?: string;          // overordnet kontekst (valgfri)
  createdAt: number;         // Date.now()
  updatedAt: number;         // Date.now()
}
