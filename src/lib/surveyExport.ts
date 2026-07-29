import { toCsv, type CsvColumn } from "./csv";
import type { SurveySectionAggregate } from "./campaignSurvey";
import type {
  CampaignSurveyQuestion,
  CampaignSurveySection,
  Profile,
  SurveyAudience,
} from "../types/database";

export type SurveyResponseExportRow = {
  campaignName: string;
  audience: SurveyAudience;
  raterName: string;
  raterEmail: string;
  status: string;
  submittedAt: string | null;
  answers: Record<string, string | number | null>;
};

export function surveyResponsesToCsv(
  questions: readonly CampaignSurveyQuestion[],
  sections: readonly CampaignSurveySection[],
  rows: readonly SurveyResponseExportRow[],
): string {
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const orderedQuestions = [...questions].toSorted((a, b) => {
    const sectionA = sectionById.get(a.section_id)?.sort_order ?? 0;
    const sectionB = sectionById.get(b.section_id)?.sort_order ?? 0;
    if (sectionA !== sectionB) {
      return sectionA - sectionB;
    }
    return a.sort_order - b.sort_order;
  });

  const columns: CsvColumn<SurveyResponseExportRow>[] = [
    { header: "Campaign", value: (row) => row.campaignName },
    { header: "Audience", value: (row) => row.audience },
    { header: "Rater name", value: (row) => row.raterName },
    { header: "Rater email", value: (row) => row.raterEmail },
    { header: "Status", value: (row) => row.status },
    { header: "Submitted at", value: (row) => row.submittedAt },
    ...orderedQuestions.map((question, index) => ({
      header: `Q${index + 1}: ${question.prompt}`,
      value: (row: SurveyResponseExportRow) => row.answers[question.id] ?? null,
    })),
  ];

  return toCsv(rows, columns);
}

export function surveyAggregatesToCsv(aggregates: readonly SurveySectionAggregate[]): string {
  return toCsv(aggregates, [
    { header: "Section", value: (row) => row.sectionTitle },
    { header: "Questions", value: (row) => row.questionCount },
    { header: "Responses", value: (row) => row.responseCount },
    { header: "Average", value: (row) => (row.withheld ? "Withheld" : row.average) },
    { header: "Withheld", value: (row) => row.withheld },
  ]);
}

export function downloadCsv(filename: string, contents: string): void {
  const blob = new Blob([contents + "\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function profileExportName(
  profile: Pick<Profile, "full_name" | "preferred_name" | "email">,
): {
  name: string;
  email: string;
} {
  return {
    name: profile.preferred_name ?? profile.full_name ?? profile.email,
    email: profile.email,
  };
}

export function surveyExportFilename(slug: string, kind: "responses" | "summary"): string {
  const date = new Date().toISOString().slice(0, 10);
  return `sufa-${slug}-questionnaire-${kind}-${date}.csv`;
}

export function slugifyCampaignName(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}
