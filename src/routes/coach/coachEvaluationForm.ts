import type { CoachEvaluation, Recommendation } from "../../types/database";

export interface EvaluationFormState {
  throwing_rating: string;
  cutting_rating: string;
  defense_rating: string;
  fitness_rating: string;
  game_iq_rating: string;
  communication_rating: string;
  coachability_rating: string;
  strengths: string;
  development_areas: string;
  overall_notes: string;
  recommendation: "" | Recommendation;
  status: "draft" | "submitted";
}

export const emptyEvaluationForm: EvaluationFormState = {
  throwing_rating: "",
  cutting_rating: "",
  defense_rating: "",
  fitness_rating: "",
  game_iq_rating: "",
  communication_rating: "",
  coachability_rating: "",
  strengths: "",
  development_areas: "",
  overall_notes: "",
  recommendation: "",
  status: "draft",
};

export function evaluationFormFromRow(row: CoachEvaluation): EvaluationFormState {
  return {
    throwing_rating: row.throwing_rating ? String(row.throwing_rating) : "",
    cutting_rating: row.cutting_rating ? String(row.cutting_rating) : "",
    defense_rating: row.defense_rating ? String(row.defense_rating) : "",
    fitness_rating: row.fitness_rating ? String(row.fitness_rating) : "",
    game_iq_rating: row.game_iq_rating ? String(row.game_iq_rating) : "",
    communication_rating: row.communication_rating ? String(row.communication_rating) : "",
    coachability_rating: row.coachability_rating ? String(row.coachability_rating) : "",
    strengths: row.strengths ?? "",
    development_areas: row.development_areas ?? "",
    overall_notes: row.overall_notes ?? "",
    recommendation: row.recommendation ?? "",
    status: row.status,
  };
}
