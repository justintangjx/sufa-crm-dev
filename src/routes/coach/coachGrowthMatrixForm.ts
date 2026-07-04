export interface GrowthMatrixFormState {
  id?: string;
  athleteId: string;
  quarterLabel: string;
  skillScore: string;
  growthPotentialScore: string;
  rationale: string;
}

export const emptyGrowthMatrixForm: GrowthMatrixFormState = {
  athleteId: "",
  quarterLabel: "Q2 2026",
  skillScore: "3",
  growthPotentialScore: "3",
  rationale: "",
};
