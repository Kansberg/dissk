export type MiniDisskDoc = {
  id: string;
  title: string;
  rationale: string;
  theoreticalAssumptions: string;
  strategicEffort: string;
  strategicGoal: string;
  goalSigns: string;
  evaluation: string;
  ownerEmail: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export const MINI_DISSK_TEXT_FIELDS = [
  "rationale",
  "theoreticalAssumptions",
  "strategicEffort",
  "strategicGoal",
  "goalSigns",
  "evaluation",
] as const;

export type MiniDisskTextField = (typeof MINI_DISSK_TEXT_FIELDS)[number];

export function createEmptyMiniDissk(
  id: string,
  ownerEmail: string
): MiniDisskDoc {
  return {
    id,
    title: "Ny MiniDISSK",
    rationale: "",
    theoreticalAssumptions: "",
    strategicEffort: "",
    strategicGoal: "",
    goalSigns: "",
    evaluation: "",
    ownerEmail,
  };
}
