import { useMemo, useState } from "react";
import { TextField } from "./FormFields";
import type { SurveyAssignmentBundle } from "../../data/types";
import { likertOptions } from "../../lib/campaignSurvey";
import type { CampaignSurveyQuestion } from "../../types/database";

function answerKey(questionId: string): string {
  return questionId;
}

export function CampaignSurveyForm({
  bundle,
  disabled,
  onSave,
}: {
  bundle: SurveyAssignmentBundle;
  disabled?: boolean;
  onSave: (
    answers: {
      questionId: string;
      numericValue?: number | null;
      textValue?: string | null;
    }[],
    submit: boolean,
  ) => Promise<void>;
}) {
  const initial = useMemo(() => {
    const map: Record<string, { numeric: string; text: string }> = {};
    for (const answer of bundle.answers) {
      map[answerKey(answer.question_id)] = {
        numeric: answer.numeric_value === null ? "" : String(answer.numeric_value),
        text: answer.text_value ?? "",
      };
    }
    return map;
  }, [bundle.answers]);

  const [values, setValues] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submitted = bundle.assignment.status === "submitted";

  const questionsBySection = bundle.template.sections.map((section) => ({
    section,
    questions: bundle.template.questions
      .filter((question) => question.section_id === section.id)
      .toSorted((a, b) => a.sort_order - b.sort_order),
  }));

  const answeredCount = bundle.template.questions.filter((question) => {
    const value = values[answerKey(question.id)];
    if (!value) {
      return false;
    }
    if (question.answer_type === "text") {
      return Boolean(value.text.trim());
    }
    return value.numeric !== "";
  }).length;

  async function collectAnswers() {
    return bundle.template.questions.map((question) => {
      const value = values[answerKey(question.id)];
      return {
        questionId: question.id,
        numericValue: value?.numeric ? Number(value.numeric) : null,
        textValue: value?.text ?? null,
      };
    });
  }

  async function handleSaveDraft() {
    setSaving(true);
    setMessage(null);
    try {
      await onSave(await collectAnswers(), false);
      setMessage("Progress saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save progress.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!window.confirm("Submit questionnaire? You cannot edit after submitting.")) {
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await onSave(await collectAnswers(), true);
      setMessage("Questionnaire submitted. Thank you.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack campaign-survey-form" id="survey">
      <div className="section-title">
        <h2>End-of-campaign questionnaire</h2>
        <span className="badge accent">
          {submitted
            ? "submitted"
            : `${answeredCount}/${bundle.template.questions.length} answered`}
        </span>
      </div>
      <p className="muted">
        Scores are reported only in anonymous aggregate views once the response threshold is met.
      </p>
      {questionsBySection.map(({ section, questions }) => (
        <section className="card stack survey-section" key={section.id}>
          <h3>{section.title}</h3>
          {questions.map((question) => (
            <SurveyQuestionField
              key={question.id}
              question={question}
              numericValue={values[answerKey(question.id)]?.numeric ?? ""}
              textValue={values[answerKey(question.id)]?.text ?? ""}
              disabled={disabled || submitted}
              onNumericChange={(numeric) =>
                setValues((current) => ({
                  ...current,
                  [answerKey(question.id)]: {
                    numeric,
                    text: current[answerKey(question.id)]?.text ?? "",
                  },
                }))
              }
              onTextChange={(text) =>
                setValues((current) => ({
                  ...current,
                  [answerKey(question.id)]: {
                    numeric: current[answerKey(question.id)]?.numeric ?? "",
                    text,
                  },
                }))
              }
            />
          ))}
        </section>
      ))}
      {!submitted ? (
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            disabled={saving || disabled}
            onClick={() => void handleSaveDraft()}
          >
            Save progress
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={saving || disabled}
            onClick={() => void handleSubmit()}
          >
            Submit questionnaire
          </button>
        </div>
      ) : null}
      {message ? <p className="alert ok">{message}</p> : null}
    </div>
  );
}

function SurveyQuestionField({
  question,
  numericValue,
  textValue,
  disabled,
  onNumericChange,
  onTextChange,
}: {
  question: CampaignSurveyQuestion;
  numericValue: string;
  textValue: string;
  disabled?: boolean;
  onNumericChange: (value: string) => void;
  onTextChange: (value: string) => void;
}) {
  if (question.answer_type === "text") {
    return (
      <TextField
        label={question.prompt}
        value={textValue}
        onChange={onTextChange}
        placeholder={question.required ? "Required" : "Optional"}
      />
    );
  }

  const options = likertOptions(question);
  const low = question.scale_low_label ?? String(question.scale_min ?? 1);
  const high = question.scale_high_label ?? String(question.scale_max ?? 5);

  return (
    <fieldset className="survey-likert-field" disabled={disabled}>
      <legend>{question.prompt}</legend>
      <div className="survey-likert-scale" role="radiogroup" aria-label={question.prompt}>
        <span className="muted survey-scale-end">{low}</span>
        <div className="survey-likert-options">
          {options.map((score) => (
            <label key={score} className="survey-likert-option">
              <input
                type="radio"
                name={`q-${question.id}`}
                value={score}
                checked={numericValue === String(score)}
                onChange={() => onNumericChange(String(score))}
              />
              <span>{score}</span>
            </label>
          ))}
        </div>
        <span className="muted survey-scale-end">{high}</span>
      </div>
    </fieldset>
  );
}
