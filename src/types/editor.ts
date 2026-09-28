export type Step = {
  id: string;
  title: string;
  time: string;
  assumption: string;
  sign: string;

  hidden?: {
    time?: boolean;
    assump?: boolean;
    sign?: boolean;
  };
};

export type Effects = {
  short: string;
  long: string;
};

/** 🔹 NY: type for symboler pr. kolonne */
export type StepSymbol = "left" | "right" | "both" | "cycle";

export type Doc = {
  id: string;
  createdAt?: number;
  title: string;
  input: string;
  steps: Step[];
  output: string;
  outputTime: string;
  outputAssumption: string;
  outputSign: string;
  effects: Effects;
  context?: string;

  /** 🔹 NY: altid et map (object) af kolonne-id -> symbol */
  stepSymbols?: Record<string, StepSymbol>;

  updatedAt: number;

  // 👇 Output-række skjul
  outputHidden?: {
    time?: boolean;
    assump?: boolean;
    sign?: boolean;
  };

  // 👇 GLOBAL VISNING / SKJULNING AF RÆKKER FRA TOPBAR
// 👇 GLOBAL VISNING / SKJULNING AF RÆKKER FRA TOPBAR
showTidAnsvar: boolean;
showAntagelser: boolean;
showContext: boolean; // 👈 NY
stepLabel: "trin" | "tema";



  // 👇 Layout og farver
  styles?: {
    input?: {
      bg?: string;
    };
    output?: {
      bg?: string;
    };
    [key: string]: any;
  };
};
