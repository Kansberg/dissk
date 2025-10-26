export type Step = {
  id: string;
  title: string;
  time: string;
  assumption: string;
  sign: string;
};

export type Effects = {
  short: string;
  long: string;
};

export type Doc = {
  id: string;
  title: string;
  input: string;
  steps: Step[];
  output: string;
  outputTime: string;
  outputAssumption: string;
  outputSign: string;
  effects: Effects;
  context?: string;
  updatedAt: number;
};
