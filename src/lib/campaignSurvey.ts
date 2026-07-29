import type {
  CampaignSurveyQuestion,
  SurveyAnswerType,
  SurveyAssignmentStatus,
} from "../types/database";

export const DEFAULT_SURVEY_MIN_RESPONSE_COUNT = 3;

export type SurveyAnswerInput = {
  questionId: string;
  numericValue?: number | null;
  textValue?: string | null;
};

export function validateSurveyAnswer(
  question: Pick<CampaignSurveyQuestion, "answer_type" | "scale_min" | "scale_max" | "required">,
  answer: SurveyAnswerInput,
): string | null {
  const hasNumeric = answer.numericValue !== null && answer.numericValue !== undefined;
  const hasText = Boolean(answer.textValue?.trim());

  if (question.answer_type === "text") {
    if (question.required && !hasText) {
      return "This question requires a written answer.";
    }
    if (hasNumeric) {
      return "Text questions cannot include a numeric score.";
    }
    return null;
  }

  if (!hasNumeric) {
    return question.required ? "Please select a score." : null;
  }
  const value = answer.numericValue as number;
  const min = question.scale_min ?? 0;
  const max = question.scale_max ?? 10;
  if (!Number.isInteger(value) || value < min || value > max) {
    return `Score must be an integer from ${min} to ${max}.`;
  }
  return null;
}

export function assignmentStatusFromAnswers(
  questions: readonly CampaignSurveyQuestion[],
  answers: readonly SurveyAnswerInput[],
  submit: boolean,
): SurveyAssignmentStatus {
  const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  const answeredCount = questions.filter((question) => {
    const answer = answerByQuestion.get(question.id);
    if (!answer) {
      return false;
    }
    return validateSurveyAnswer(question, answer) === null;
  }).length;

  if (submit) {
    const missingRequired = questions.some((question) => {
      if (!question.required) {
        return false;
      }
      const answer = answerByQuestion.get(question.id);
      if (!answer) {
        return true;
      }
      return validateSurveyAnswer(question, answer) !== null;
    });
    if (missingRequired) {
      return "in_progress";
    }
    return "submitted";
  }

  if (answeredCount === 0) {
    return "pending";
  }
  return "in_progress";
}

export function isAssignmentComplete(
  questions: readonly CampaignSurveyQuestion[],
  answers: readonly SurveyAnswerInput[],
): boolean {
  return assignmentStatusFromAnswers(questions, answers, true) === "submitted";
}

export function likertOptions(
  question: Pick<CampaignSurveyQuestion, "scale_min" | "scale_max">,
): number[] {
  const min = question.scale_min ?? 1;
  const max = question.scale_max ?? 5;
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

export function answerTypeLabel(answerType: SurveyAnswerType): string {
  switch (answerType) {
    case "likert":
      return "Likert scale";
    case "nps":
      return "NPS (0–10)";
    case "text":
      return "Open text";
    default:
      return answerType;
  }
}

export type SurveySectionAggregate = {
  sectionTitle: string;
  questionCount: number;
  responseCount: number;
  average: number | null;
  withheld: boolean;
};

export function buildSectionAggregates(input: {
  sections: readonly { title: string; questionIds: string[] }[];
  answersByQuestion: ReadonlyMap<string, readonly number[]>;
  minResponseCount: number;
  submittedAssignmentCount: number;
}): SurveySectionAggregate[] {
  return input.sections.map((section) => {
    const numericValues = section.questionIds.flatMap(
      (questionId) => input.answersByQuestion.get(questionId) ?? [],
    );
    const withheld = input.submittedAssignmentCount < input.minResponseCount;
    const average =
      numericValues.length === 0
        ? null
        : Math.round(
            (numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length) * 10,
          ) / 10;
    return {
      sectionTitle: section.title,
      questionCount: section.questionIds.length,
      responseCount: input.submittedAssignmentCount,
      average: withheld ? null : average,
      withheld,
    };
  });
}
