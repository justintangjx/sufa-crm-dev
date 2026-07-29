import { describe, expect, it } from "vitest";
import {
  buildU20QuestionnaireRows,
  countU20QuestionnaireByAudience,
} from "../fixtures/u20Questionnaire";
import {
  buildTemplateDraft,
  parseQuestionnaireCsv,
  planQuestionnaireImport,
  questionnaireRowsToCsv,
  rowAppliesToAudience,
} from "./questionnaireImport";

describe("questionnaireImport", () => {
  it("parses U20 fixture CSV with expected audience split", () => {
    const rows = buildU20QuestionnaireRows();
    const csv = questionnaireRowsToCsv(rows);
    const parsed = parseQuestionnaireCsv(csv);
    expect(parsed.headerError).toBeNull();
    expect(parsed.rows).toHaveLength(rows.length);

    const plan = planQuestionnaireImport({
      campaignId: "c-u24-mixed",
      campaignName: "U24 Worlds 2026 — Mixed",
      rows: parsed.rows,
    });
    expect(plan.counts.error).toBe(0);
    const counts = countU20QuestionnaireByAudience();
    expect(plan.playerQuestionCount).toBe(counts.player);
    expect(plan.coachQuestionCount).toBe(counts.coach);
    expect(plan.coachQuestionCount).toBeLessThan(plan.playerQuestionCount);
  });

  it("excludes player_only rows from coach template", () => {
    const rows = buildU20QuestionnaireRows();
    const coachOnly = rows.filter((row) => rowAppliesToAudience(row, "coach"));
    const coachDraft = buildTemplateDraft(rows, "coach", "Coach");
    const coachCount = coachDraft.sections.reduce(
      (total, section) => total + section.questions.length,
      0,
    );
    expect(coachCount).toBe(coachOnly.length);
    expect(rows.some((row) => row.audience === "player_only")).toBe(true);
  });

  it("blocks import when a survey instance is open", () => {
    const rows = buildU20QuestionnaireRows();
    const plan = planQuestionnaireImport({
      campaignId: "c-u24-mixed",
      campaignName: "U24",
      rows,
      hasOpenInstance: true,
    });
    expect(plan.counts.error).toBe(1);
    expect(plan.rows[0]?.kind).toBe("error");
  });
});
