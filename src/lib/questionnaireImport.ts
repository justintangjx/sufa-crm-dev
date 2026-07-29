import type {
  QuestionnaireAudienceScope,
  SurveyAnswerType,
  SurveyAudience,
  SurveySubjectKind,
} from "../types/database";

export type { QuestionnaireAudienceScope } from "../types/database";

export const QUESTIONNAIRE_CSV_HEADERS = [
  "section_order",
  "section_title",
  "question_order",
  "prompt",
  "answer_type",
  "scale_min",
  "scale_max",
  "scale_low_label",
  "scale_high_label",
  "subject_kind",
  "audience",
  "required",
] as const;

export const QUESTIONNAIRE_CSV_TEMPLATE = [
  QUESTIONNAIRE_CSV_HEADERS.join(","),
  "1,Leadership,1,The coaches set clear goals for the tournament,likert,1,5,Strongly disagree,Strongly agree,coaches,player_only,true",
].join("\n");

export type QuestionnaireImportSourceRow = {
  rowNumber?: number;
  sectionOrder: number;
  sectionTitle: string;
  questionOrder: number;
  prompt: string;
  answerType: SurveyAnswerType;
  scaleMin: number | null;
  scaleMax: number | null;
  scaleLowLabel: string | null;
  scaleHighLabel: string | null;
  subjectKind: SurveySubjectKind | null;
  audience: QuestionnaireAudienceScope;
  required: boolean;
  fieldErrors?: string[];
};

export type QuestionnaireTemplateDraft = {
  audience: SurveyAudience;
  name: string;
  sections: {
    sortOrder: number;
    title: string;
    questions: {
      sortOrder: number;
      prompt: string;
      answerType: SurveyAnswerType;
      scaleMin: number | null;
      scaleMax: number | null;
      scaleLowLabel: string | null;
      scaleHighLabel: string | null;
      subjectKind: SurveySubjectKind | null;
      required: boolean;
    }[];
  }[];
};

export type QuestionnaireImportPlanRow =
  | {
      kind: "create_question";
      rowNumber: number;
      audience: SurveyAudience;
      sectionTitle: string;
      prompt: string;
    }
  | {
      kind: "error";
      rowNumber: number;
      reason: string;
    };

export type QuestionnaireImportPlan = {
  campaignId: string;
  playerQuestionCount: number;
  coachQuestionCount: number;
  rows: QuestionnaireImportPlanRow[];
  playerTemplate: QuestionnaireTemplateDraft;
  coachTemplate: QuestionnaireTemplateDraft;
  counts: {
    create: number;
    error: number;
  };
};

const AUDIENCE_SCOPES = new Set<QuestionnaireAudienceScope>(["all", "player_only", "coach_only"]);
const ANSWER_TYPES = new Set<SurveyAnswerType>(["likert", "nps", "text"]);
const SUBJECT_KINDS = new Set<SurveySubjectKind>([
  "coaches",
  "captains",
  "spirit_captain",
  "team",
  "program",
]);

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function escapeCsvCell(input: string): string {
  if (/[",\n\r]/.test(input)) {
    return `"${input.replaceAll('"', '""')}"`;
  }
  return input;
}

export function questionnaireRowsToCsv(rows: readonly QuestionnaireImportSourceRow[]): string {
  const header = QUESTIONNAIRE_CSV_HEADERS.join(",");
  const body = rows.map((row) =>
    [
      row.sectionOrder,
      escapeCsvCell(row.sectionTitle),
      row.questionOrder,
      escapeCsvCell(row.prompt),
      row.answerType,
      row.scaleMin ?? "",
      row.scaleMax ?? "",
      row.scaleLowLabel ? escapeCsvCell(row.scaleLowLabel) : "",
      row.scaleHighLabel ? escapeCsvCell(row.scaleHighLabel) : "",
      row.subjectKind ?? "",
      row.audience,
      row.required,
    ].join(","),
  );
  return [header, ...body].join("\n");
}

function parseBoolean(raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "1";
}

function parseOptionalInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isInteger(value) ? value : null;
}

export function parseQuestionnaireCsv(text: string): {
  rows: QuestionnaireImportSourceRow[];
  headerError: string | null;
} {
  const normalized = text
    .replace(/^\uFEFF/, "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], headerError: "CSV is empty." };
  }

  const headerCells = splitCsvLine(lines[0] ?? "").map((cell) => cell.trim().toLowerCase());
  const expected = QUESTIONNAIRE_CSV_HEADERS.map((header) => header.toLowerCase());
  const missing = expected.filter((header) => !headerCells.includes(header));
  if (missing.length > 0) {
    return {
      rows: [],
      headerError: `CSV is missing required columns: ${missing.join(", ")}.`,
    };
  }

  const indexOf = (name: string) => headerCells.indexOf(name);
  const rows: QuestionnaireImportSourceRow[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cells = splitCsvLine(lines[lineIndex] ?? "");
    const read = (name: string) => cells[indexOf(name)] ?? "";
    const fieldErrors: string[] = [];

    const sectionOrder = parseOptionalInt(read("section_order"));
    const questionOrder = parseOptionalInt(read("question_order"));
    const answerTypeRaw = read("answer_type").toLowerCase() as SurveyAnswerType;
    const audienceRaw = read("audience").toLowerCase() as QuestionnaireAudienceScope;
    const subjectRaw = read("subject_kind").trim().toLowerCase();
    const scaleMin = parseOptionalInt(read("scale_min"));
    const scaleMax = parseOptionalInt(read("scale_max"));

    if (sectionOrder === null || sectionOrder < 1) {
      fieldErrors.push("section_order must be a positive integer");
    }
    if (questionOrder === null || questionOrder < 1) {
      fieldErrors.push("question_order must be a positive integer");
    }
    if (!read("section_title").trim()) {
      fieldErrors.push("section_title is required");
    }
    if (!read("prompt").trim()) {
      fieldErrors.push("prompt is required");
    }
    if (!ANSWER_TYPES.has(answerTypeRaw)) {
      fieldErrors.push(`answer_type must be likert, nps, or text`);
    }
    if (!AUDIENCE_SCOPES.has(audienceRaw)) {
      fieldErrors.push("audience must be all, player_only, or coach_only");
    }
    if (subjectRaw && !SUBJECT_KINDS.has(subjectRaw as SurveySubjectKind)) {
      fieldErrors.push("subject_kind is invalid");
    }
    if (answerTypeRaw === "text") {
      if (scaleMin !== null || scaleMax !== null) {
        fieldErrors.push("text questions must leave scale_min and scale_max empty");
      }
    } else if (scaleMin === null || scaleMax === null || scaleMin > scaleMax) {
      fieldErrors.push("likert and nps questions require valid scale_min and scale_max");
    }

    rows.push({
      rowNumber: lineIndex + 1,
      sectionOrder: sectionOrder ?? 0,
      sectionTitle: read("section_title"),
      questionOrder: questionOrder ?? 0,
      prompt: read("prompt"),
      answerType: answerTypeRaw,
      scaleMin,
      scaleMax,
      scaleLowLabel: read("scale_low_label") || null,
      scaleHighLabel: read("scale_high_label") || null,
      subjectKind: subjectRaw ? (subjectRaw as SurveySubjectKind) : null,
      audience: audienceRaw,
      required: parseBoolean(read("required") || "true"),
      fieldErrors,
    });
  }

  return { rows, headerError: null };
}

export function rowAppliesToAudience(
  row: Pick<QuestionnaireImportSourceRow, "audience">,
  audience: SurveyAudience,
): boolean {
  if (row.audience === "all") {
    return true;
  }
  return row.audience === `${audience}_only`;
}

export function buildTemplateDraft(
  rows: readonly QuestionnaireImportSourceRow[],
  audience: SurveyAudience,
  name: string,
): QuestionnaireTemplateDraft {
  const applicable = rows.filter((row) => rowAppliesToAudience(row, audience));
  const sectionOrder = new Map<number, QuestionnaireTemplateDraft["sections"][number]>();

  for (const row of applicable) {
    let section = sectionOrder.get(row.sectionOrder);
    if (!section) {
      section = { sortOrder: row.sectionOrder, title: row.sectionTitle, questions: [] };
      sectionOrder.set(row.sectionOrder, section);
    }
    section.questions.push({
      sortOrder: row.questionOrder,
      prompt: row.prompt,
      answerType: row.answerType,
      scaleMin: row.scaleMin,
      scaleMax: row.scaleMax,
      scaleLowLabel: row.scaleLowLabel,
      scaleHighLabel: row.scaleHighLabel,
      subjectKind: row.subjectKind,
      required: row.required,
    });
  }

  const sections = [...sectionOrder.values()].toSorted((a, b) => a.sortOrder - b.sortOrder);
  for (const section of sections) {
    section.questions.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return { audience, name, sections };
}

export function planQuestionnaireImport(input: {
  campaignId: string;
  campaignName: string;
  rows: readonly QuestionnaireImportSourceRow[];
  hasOpenInstance?: boolean;
}): QuestionnaireImportPlan {
  const planRows: QuestionnaireImportPlanRow[] = [];
  let errors = 0;

  if (input.hasOpenInstance) {
    return {
      campaignId: input.campaignId,
      playerQuestionCount: 0,
      coachQuestionCount: 0,
      rows: [
        {
          kind: "error",
          rowNumber: 0,
          reason: "Close the open player or coach survey before uploading a new CSV.",
        },
      ],
      playerTemplate: buildTemplateDraft([], "player", ""),
      coachTemplate: buildTemplateDraft([], "coach", ""),
      counts: { create: 0, error: 1 },
    };
  }

  const seen = new Set<string>();
  for (const row of input.rows) {
    const rowNumber = row.rowNumber ?? 0;
    if (row.fieldErrors && row.fieldErrors.length > 0) {
      planRows.push({
        kind: "error",
        rowNumber,
        reason: row.fieldErrors.join("; "),
      });
      errors += 1;
      continue;
    }
    const key = `${row.sectionOrder}:${row.questionOrder}:${row.audience}`;
    if (seen.has(key)) {
      planRows.push({
        kind: "error",
        rowNumber,
        reason: `duplicate section_order/question_order/audience (${key})`,
      });
      errors += 1;
      continue;
    }
    seen.add(key);
    for (const audience of ["player", "coach"] as const) {
      if (!rowAppliesToAudience(row, audience)) {
        continue;
      }
      planRows.push({
        kind: "create_question",
        rowNumber,
        audience,
        sectionTitle: row.sectionTitle,
        prompt: row.prompt,
      });
    }
  }

  const playerTemplate = buildTemplateDraft(
    input.rows,
    "player",
    `${input.campaignName} player questionnaire`,
  );
  const coachTemplate = buildTemplateDraft(
    input.rows,
    "coach",
    `${input.campaignName} coach questionnaire`,
  );

  const playerQuestionCount = playerTemplate.sections.reduce(
    (total, section) => total + section.questions.length,
    0,
  );
  const coachQuestionCount = coachTemplate.sections.reduce(
    (total, section) => total + section.questions.length,
    0,
  );

  return {
    campaignId: input.campaignId,
    playerQuestionCount,
    coachQuestionCount,
    rows: planRows,
    playerTemplate,
    coachTemplate,
    counts: {
      create: planRows.filter((row) => row.kind === "create_question").length,
      error: errors,
    },
  };
}
