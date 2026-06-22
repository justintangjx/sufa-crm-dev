import { PROMPT_VERSION } from "./coach-note-contract.ts";

const rubric = `
Strengths: observed effective skills, decisions, habits, or communication.
Development areas: observed limitations, inconsistencies, or explicit improvement needs.
Overall observations: neutral factual context that is neither clearly positive nor developmental.
Ambiguities: vague, contradictory, decision-oriented, or underspecified phrases requiring coach review.
`;

export function buildCoachNotePrompt(
  notes: string,
  repairErrors: string[] = [],
  options: { section?: string; action?: string } = {},
): string {
  const repair =
    repairErrors.length === 0
      ? ""
      : `\nThe previous result failed validation. Correct these issues:\n- ${repairErrors.join("\n- ")}\n`;
  const actionHint =
    options.action === "clarify"
      ? "\nCoach clarifications were appended after the original notes. Use them only when grounded in SOURCE_NOTES.\n"
      : options.action === "add_notes"
        ? "\nAdditional notes were appended after the original notes. Include new evidence from the appended section.\n"
        : options.action === "regenerate_section" && options.section
          ? `\nFocus regeneration on the ${options.section} field while keeping other categories faithful to SOURCE_NOTES.\n`
          : "";
  const sectionHint = options.section
    ? `\nPrioritize evidence for the ${options.section} category in this turn.\n`
    : "";
  return `
Prompt version: ${PROMPT_VERSION}

Transform the supplied rough Ultimate Frisbee coaching notes into an editable evidence-grounded draft.

Rules:
- Use only facts explicitly present in SOURCE_NOTES.
- Do not infer or suggest numeric ratings, selection, reserve status, recommendations, or roster decisions.
- Put decision-oriented phrases in ambiguities rather than repeating the decision as draft text.
- Preserve negation, uncertainty, shorthand, fragments, and Singaporean English phrasing.
- Every evidenceQuotes entry must be copied exactly from SOURCE_NOTES.
- Keep draftText concise and faithful. Do not add biographical or historical claims.
- Use empty arrays when a category has no evidence.
- Return only the requested JSON object. Do not reveal reasoning or chain-of-thought.
${actionHint}${sectionHint}
Rubric:
${rubric}

Examples:
SOURCE_NOTES: "Strong hucks. Needs tighter reset D."
Strength evidence: "Strong hucks"
Development evidence: "Needs tighter reset D"

SOURCE_NOTES: "Not strong in the air yet. Calm with the disc."
Development evidence: "Not strong in the air yet"
Strength evidence: "Calm with the disc"

SOURCE_NOTES: "Reliable resets. Selected for the squad."
Strength evidence: "Reliable resets"
Ambiguity source: "Selected for the squad"
${repair}
SOURCE_NOTES:
${notes}
`.trim();
}
