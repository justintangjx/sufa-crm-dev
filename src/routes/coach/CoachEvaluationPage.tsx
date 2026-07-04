import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { RatingField, TextAreaField } from "../../components/shell/FormFields";
import { Badge, PageHead } from "../../components/shell/PagePrimitives";
import { api } from "../../data";
import { demoCoachLlm, enableCoachLlm } from "../../lib/env";
import { optionalText, ratingValue } from "../../lib/form";
import { sentenceCase } from "../../lib/format";
import {
  buildAccumulatedInput,
  calculateCoachNoteEditMetrics,
  coachNoteDraftToFormText,
  createDeterministicCoachNoteDraft,
  COACH_NOTE_MAX_TURNS,
  validateCoachNoteDraft,
  type CoachNoteAction,
  type CoachNoteClarification,
  type CoachNoteDraftV1,
  type CoachNoteFeedback,
  type CoachNoteGenerationResult,
  type CoachNoteSection,
} from "../../lib/coachNotes";
import type { CoachAthleteView, PriorCoachEvaluation } from "../../types/database";
import {
  emptyEvaluationForm,
  evaluationFormFromRow,
  type EvaluationFormState,
} from "./coachEvaluationForm";
import { CoachNoteCopilotPanel, PriorEvaluationsPanel } from "./CoachEvaluationPanels";

export function CoachEvaluationPage() {
  const { campaignId = "", playerId = "" } = useParams();
  const { profile } = useAuth();
  const [athlete, setAthlete] = useState<CoachAthleteView | null>(null);
  const [priorEvaluations, setPriorEvaluations] = useState<PriorCoachEvaluation[]>([]);
  const [form, setForm] = useState<EvaluationFormState>(emptyEvaluationForm);
  const [roughNotes, setRoughNotes] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [clarifications, setClarifications] = useState<CoachNoteClarification[]>([]);
  const [pendingClarifications, setPendingClarifications] = useState<Record<string, string>>({});
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [turnCount, setTurnCount] = useState(0);
  const [evaluationId, setEvaluationId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationResult, setGenerationResult] = useState<CoachNoteGenerationResult | null>(null);
  const [feedback, setFeedback] = useState<CoachNoteFeedback | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const structuredSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!profile) {
      return;
    }
    void Promise.all([
      api.getCoachAthletes(campaignId),
      api.getEvaluation(campaignId, playerId, profile.id),
      api.listOwnSubmittedEvaluations(profile.id, playerId, 3),
    ]).then(([athletes, evaluation, prior]) => {
      setAthlete(athletes.find((row) => row.id === playerId) ?? null);
      setPriorEvaluations(prior.filter((row) => row.campaignId !== campaignId));
      if (evaluation) {
        setEvaluationId(evaluation.id);
        setForm(evaluationFormFromRow(evaluation));
      }
    });
  }, [campaignId, playerId, profile]);

  function updateField(field: keyof EvaluationFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function applyCoachNoteDraft(draft: CoachNoteDraftV1) {
    const text = coachNoteDraftToFormText(draft);
    setForm((current) => ({
      ...current,
      strengths: text.strengths || current.strengths,
      development_areas: text.developmentAreas || current.development_areas,
      overall_notes: text.overallNotes || current.overall_notes,
    }));
  }

  function applyGenerationResult(result: CoachNoteGenerationResult) {
    applyCoachNoteDraft(result.draft);
    setGenerationResult(result);
    setSessionId(result.sessionId);
    setTurnCount(result.turnIndex + 1);
  }

  function scrollToStructuredSection() {
    window.requestAnimationFrame(() => {
      const section = structuredSectionRef.current;
      if (typeof section?.scrollIntoView === "function") {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      section?.focus();
    });
  }

  async function runCoachNoteAction(
    action: CoachNoteAction,
    options: {
      nextClarifications?: CoachNoteClarification[];
      nextAdditionalNotes?: string;
      section?: CoachNoteSection;
      sessionId?: string | undefined;
      successMessage: string;
    },
  ) {
    const activeSessionId = options.sessionId !== undefined ? options.sessionId : sessionId;
    if (turnCount >= COACH_NOTE_MAX_TURNS && activeSessionId) {
      setGenerationError("This evaluation copilot session reached its turn limit.");
      return;
    }

    const nextClarifications = options.nextClarifications ?? clarifications;
    const nextAdditionalNotes = options.nextAdditionalNotes ?? additionalNotes;

    setGenerating(true);
    setGenerationError(null);
    setFeedback(null);
    try {
      const result = await api.coachNoteAction({
        campaignId,
        athleteId: playerId,
        roughNotes,
        action,
        sessionId: activeSessionId,
        clarifications: nextClarifications,
        additionalNotes: nextAdditionalNotes,
        section: options.section,
      });
      const validation = validateCoachNoteDraft(result.draft, result.redactedNotes);
      if (!validation.valid) {
        throw new Error("Generated draft failed grounding validation");
      }
      applyGenerationResult(result);
      setClarifications(nextClarifications);
      setAdditionalNotes(nextAdditionalNotes);
      setPendingClarifications({});
      setMessage(
        enableCoachLlm
          ? options.successMessage
          : `${options.successMessage} Review every field before saving.`,
      );
    } catch {
      setGenerationError(
        enableCoachLlm
          ? "The LLM draft is unavailable. You can retry or explicitly use the deterministic fallback."
          : "The evaluation copilot could not save telemetry. Check that coach-note migrations are applied, then retry.",
      );
      setMessage(null);
      setGenerating(false);
      return;
    }
    setGenerating(false);
    scrollToStructuredSection();
  }

  async function handleStructureNotes() {
    setSessionId(undefined);
    setTurnCount(0);
    setClarifications([]);
    setAdditionalNotes("");
    setPendingClarifications({});
    await runCoachNoteAction("structure", {
      sessionId: undefined,
      nextClarifications: [],
      nextAdditionalNotes: "",
      successMessage: "Notes structured into a draft. Review before saving.",
    });
  }

  async function handleApplyClarifications() {
    const draftAmbiguities = generationResult?.draft.ambiguities ?? [];
    const nextClarifications = draftAmbiguities
      .map((ambiguity) => {
        const answer = pendingClarifications[ambiguity.sourceQuote]?.trim();
        if (!answer || answer.startsWith("Skip")) {
          return null;
        }
        return { sourceQuote: ambiguity.sourceQuote, answer };
      })
      .filter((value): value is CoachNoteClarification => value !== null);
    if (nextClarifications.length === 0) {
      setMessage("Add at least one clarification answer or edit the form directly.");
      return;
    }
    await runCoachNoteAction("clarify", {
      nextClarifications: [...clarifications, ...nextClarifications],
      successMessage: "Clarifications applied to the draft. Review before saving.",
    });
  }

  async function handleAddMoreNotes() {
    if (additionalNotes.trim().length === 0) {
      setMessage("Add more notes before re-structuring.");
      return;
    }
    await runCoachNoteAction("add_notes", {
      successMessage: "Additional notes structured into the draft. Review before saving.",
    });
  }

  async function handleRegenerateSection(section: CoachNoteSection) {
    await runCoachNoteAction("regenerate_section", {
      section,
      successMessage: `Regenerated ${section.replaceAll("_", " ")}. Review before saving.`,
    });
  }

  function handleDeterministicFallback() {
    const accumulatedInput = buildAccumulatedInput(roughNotes, clarifications, additionalNotes);
    const draft = createDeterministicCoachNoteDraft(accumulatedInput);
    applyCoachNoteDraft(draft);
    setGenerationResult(null);
    setSessionId(undefined);
    setTurnCount(0);
    setGenerationError(null);
    setFeedback(null);
    setMessage("Deterministic fallback applied. Review every field before saving.");
  }

  async function handleCoachNoteFeedback(nextFeedback: CoachNoteFeedback) {
    if (!generationResult) {
      return;
    }
    try {
      await api.submitCoachNoteFeedback({
        runId: generationResult.runId,
        feedback: nextFeedback,
      });
      setFeedback(nextFeedback);
    } catch {
      setGenerationError("Feedback could not be saved. The evaluation draft is unchanged.");
    }
  }

  async function save(status: "draft" | "submitted") {
    if (!profile) {
      return;
    }
    setSaving(true);
    setMessage(null);
    const saved = await api.saveEvaluation({
      id: evaluationId,
      campaignId,
      athleteId: playerId,
      coachProfileId: profile.id,
      throwing_rating: ratingValue(form.throwing_rating),
      cutting_rating: ratingValue(form.cutting_rating),
      defense_rating: ratingValue(form.defense_rating),
      fitness_rating: ratingValue(form.fitness_rating),
      game_iq_rating: ratingValue(form.game_iq_rating),
      communication_rating: ratingValue(form.communication_rating),
      coachability_rating: ratingValue(form.coachability_rating),
      strengths: optionalText(form.strengths),
      development_areas: optionalText(form.development_areas),
      overall_notes: optionalText(form.overall_notes),
      recommendation: form.recommendation || null,
      status,
    });
    setEvaluationId(saved.id);
    setForm(evaluationFormFromRow(saved));
    let saveMessage = status === "submitted" ? "Evaluation submitted." : "Evaluation draft saved.";
    if (generationResult) {
      const generated = coachNoteDraftToFormText(generationResult.draft);
      const final = {
        strengths: form.strengths,
        developmentAreas: form.development_areas,
        overallNotes: form.overall_notes,
      };
      const metrics = calculateCoachNoteEditMetrics(generated, final);
      try {
        await api.recordCoachNoteEditMetrics({
          runId: generationResult.runId,
          ...metrics,
        });
      } catch {
        saveMessage = `${saveMessage} Edit metrics could not be recorded.`;
      }
    }
    setMessage(saveMessage);
    setSaving(false);
  }

  const athleteName = athlete?.preferred_name || athlete?.legal_name || "Assigned player";

  return (
    <>
      <PageHead
        title="Evaluation"
        subtitle="Structure coach notes before saving."
        eyebrow="Coach"
      />
      <section className="card stack">
        <div className="section-title">
          <h2>{athleteName}</h2>
          <Badge>{form.status}</Badge>
        </div>
        <div className="grid cols-3">
          <div className="stat">
            <div className="stat-label">Phone</div>
            <div>{athlete?.phone ?? "-"}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Profile</div>
            <div>{athlete?.profile_status ?? "-"}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Campaign</div>
            <div>{campaignId}</div>
          </div>
        </div>
      </section>
      {priorEvaluations.length > 0 ? (
        <PriorEvaluationsPanel evaluations={priorEvaluations} />
      ) : null}
      <section className="card stack">
        <div className="section-title">
          <h2>Evaluation copilot</h2>
          <Badge>{enableCoachLlm ? "LLM draft" : "local draft"}</Badge>
        </div>
        <div className="field">
          <label htmlFor="rough-notes">Paste rough notes</label>
          <textarea
            id="rough-notes"
            value={roughNotes}
            onChange={(event) => setRoughNotes(event.target.value)}
            placeholder="Strong hucks. Needs to work on reset defense. Reliable starter..."
          />
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() => void handleStructureNotes()}
          disabled={roughNotes.trim().length === 0 || generating}
        >
          {generating ? "Structuring..." : "Structure notes"}
        </button>
        {generationResult ? (
          <CoachNoteCopilotPanel
            draft={generationResult.draft}
            model={generationResult.model}
            ambiguityCount={generationResult.ambiguityCount}
            pendingClarifications={pendingClarifications}
            onPendingClarificationChange={(sourceQuote, answer) =>
              setPendingClarifications((current) => ({ ...current, [sourceQuote]: answer }))
            }
            onApplyClarifications={() => void handleApplyClarifications()}
            onRegenerateSection={(section) => void handleRegenerateSection(section)}
            regenerating={generating}
          />
        ) : null}
        {generationResult || clarifications.length > 0 || additionalNotes.trim().length > 0 ? (
          <div className="stack">
            <div className="field">
              <label htmlFor="additional-notes">Add more notes</label>
              <textarea
                id="additional-notes"
                value={additionalNotes}
                onChange={(event) => setAdditionalNotes(event.target.value)}
                placeholder="More detail on defense positioning..."
              />
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => void handleAddMoreNotes()}
              disabled={additionalNotes.trim().length === 0 || generating}
            >
              Add notes and re-structure
            </button>
          </div>
        ) : null}
        {sessionId ? (
          <p className="muted">
            Copilot session {sessionId.slice(0, 8)} · turn {turnCount}/{COACH_NOTE_MAX_TURNS}
          </p>
        ) : null}
        {generationError ? (
          <div className="stack">
            <p className="alert warn">{generationError}</p>
            <button type="button" className="btn" onClick={handleDeterministicFallback}>
              Use deterministic fallback
            </button>
          </div>
        ) : null}
        <p className="muted">
          {enableCoachLlm
            ? demoCoachLlm
              ? "Demo mode with live LLM drafting. The copilot structures evidence only; it never sets ratings or recommendations."
              : "The copilot structures evidence only. It never sets ratings or recommendations."
            : "Production LLM drafting is disabled until the Supabase Edge Function is deployed. This uses the local deterministic structurer."}
        </p>
        {generationResult ? (
          <div className="stack">
            <p className="muted">Was this grounded draft useful?</p>
            <div className="btn-row" aria-label="Coach note feedback">
              {(["useful", "incorrect", "missing_context"] as const).map((option) => (
                <button
                  type="button"
                  className="btn sm"
                  key={option}
                  aria-pressed={feedback === option}
                  onClick={() => void handleCoachNoteFeedback(option)}
                >
                  {option === "missing_context" ? "Missing context" : sentenceCase(option)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      <section className="card stack">
        <h2>Ratings</h2>
        <div className="grid cols-4">
          <RatingField
            label="Throwing rating"
            value={form.throwing_rating}
            onChange={(value) => updateField("throwing_rating", value)}
          />
          <RatingField
            label="Cutting rating"
            value={form.cutting_rating}
            onChange={(value) => updateField("cutting_rating", value)}
          />
          <RatingField
            label="Defense rating"
            value={form.defense_rating}
            onChange={(value) => updateField("defense_rating", value)}
          />
          <RatingField
            label="Fitness rating"
            value={form.fitness_rating}
            onChange={(value) => updateField("fitness_rating", value)}
          />
          <RatingField
            label="Game IQ rating"
            value={form.game_iq_rating}
            onChange={(value) => updateField("game_iq_rating", value)}
          />
          <RatingField
            label="Communication rating"
            value={form.communication_rating}
            onChange={(value) => updateField("communication_rating", value)}
          />
          <RatingField
            label="Coachability rating"
            value={form.coachability_rating}
            onChange={(value) => updateField("coachability_rating", value)}
          />
        </div>
      </section>
      <section className="card stack" ref={structuredSectionRef} tabIndex={-1}>
        <div className="section-title">
          <h2>Structured evaluation</h2>
          {message?.includes("Review") ? <Badge tone="ok">updated</Badge> : null}
        </div>
        {message?.includes("Review") ? <p className="alert ok">{message}</p> : null}
        <TextAreaField
          label="Strengths"
          value={form.strengths}
          onChange={(value) => updateField("strengths", value)}
        />
        <TextAreaField
          label="Development areas"
          value={form.development_areas}
          onChange={(value) => updateField("development_areas", value)}
        />
        <TextAreaField
          label="Overall notes"
          value={form.overall_notes}
          onChange={(value) => updateField("overall_notes", value)}
        />
        <div className="field">
          <label htmlFor="recommendation">Recommendation</label>
          <select
            id="recommendation"
            value={form.recommendation}
            onChange={(event) => updateField("recommendation", event.target.value)}
          >
            <option value="">Needs review</option>
            <option value="selected">Selected</option>
            <option value="reserve">Reserve</option>
            <option value="development">Development</option>
            <option value="not_selected">Not selected</option>
            <option value="needs_review">Needs review</option>
          </select>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={() => void save("draft")}
            disabled={saving}
          >
            Save draft
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void save("submitted")}
            disabled={saving}
          >
            Submit evaluation
          </button>
        </div>
        {message && !message.includes("Review") ? <p className="alert ok">{message}</p> : null}
      </section>
    </>
  );
}
