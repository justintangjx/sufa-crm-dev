import {
  isAssignmentComplete,
  validateSurveyAnswer,
  type SurveyAnswerInput,
} from "../lib/campaignSurvey";
import { planQuestionnaireImport } from "../lib/questionnaireImport";
import { buildSectionAggregates } from "../lib/campaignSurvey";
import type { MockData } from "./seed";
import type {
  CampaignQuestionnaireImportInput,
  QuestionnaireImportCommitResult,
  SurveyAssignmentBundle,
  SurveyCompletionRow,
  SurveyTemplateBundle,
} from "./types";
import type {
  CampaignSurveyAnswer,
  CampaignSurveyAssignment,
  CampaignSurveyInstance,
  CampaignSurveyQuestion,
  CampaignSurveySection,
  CampaignSurveyTemplate,
  Profile,
  SurveyAudience,
} from "../types/database";
import { profileDisplayName } from "./payloads/display";

function timestamp(): string {
  return new Date().toISOString();
}

function findCampaign(data: MockData, campaignId: string) {
  return data.campaigns.find((campaign) => campaign.id === campaignId);
}

function templateBundle(data: MockData, templateId: string): SurveyTemplateBundle | null {
  const template = data.surveyTemplates.find((row) => row.id === templateId);
  if (!template) {
    return null;
  }
  const sections = data.surveySections
    .filter((section) => section.template_id === templateId)
    .toSorted((a, b) => a.sort_order - b.sort_order);
  const sectionIds = new Set(sections.map((section) => section.id));
  const questions = data.surveyQuestions
    .filter((question) => sectionIds.has(question.section_id))
    .toSorted((a, b) => a.sort_order - b.sort_order);
  return { template, sections, questions };
}

function assignmentBundle(data: MockData, assignmentId: string): SurveyAssignmentBundle | null {
  const assignment = data.surveyAssignments.find((row) => row.id === assignmentId);
  if (!assignment) {
    return null;
  }
  const instance = data.surveyInstances.find((row) => row.id === assignment.instance_id);
  if (!instance) {
    return null;
  }
  const template = templateBundle(data, instance.template_id);
  if (!template) {
    return null;
  }
  const answers = data.surveyAnswers.filter((answer) => answer.assignment_id === assignmentId);
  return { assignment, instance, template, answers };
}

function nextTemplateVersion(data: MockData, campaignId: string, audience: SurveyAudience): number {
  const existing = data.surveyTemplates.filter(
    (template) => template.campaign_id === campaignId && template.audience === audience,
  );
  return existing.reduce((max, template) => Math.max(max, template.version), 0) + 1;
}

function persistTemplateFromDraft(
  data: MockData,
  input: {
    campaignId: string;
    draft: import("../lib/questionnaireImport").QuestionnaireTemplateDraft;
    createdBy: string;
    templateId: string;
  },
): CampaignSurveyTemplate {
  const template: CampaignSurveyTemplate = {
    id: input.templateId,
    campaign_id: input.campaignId,
    audience: input.draft.audience,
    survey_window: "post_season",
    name: input.draft.name,
    status: "draft",
    version: nextTemplateVersion(data, input.campaignId, input.draft.audience),
    source_kind: "csv",
    created_by: input.createdBy,
    published_at: null,
    published_by: null,
    created_at: timestamp(),
    updated_at: timestamp(),
  };
  data.surveyTemplates.push(template);

  for (const sectionDraft of input.draft.sections) {
    const sectionId = `${input.templateId}-s${sectionDraft.sortOrder}`;
    const section: CampaignSurveySection = {
      id: sectionId,
      template_id: template.id,
      title: sectionDraft.title,
      sort_order: sectionDraft.sortOrder,
      created_at: timestamp(),
    };
    data.surveySections.push(section);
    for (const questionDraft of sectionDraft.questions) {
      const question: CampaignSurveyQuestion = {
        id: `${sectionId}-q${questionDraft.sortOrder}`,
        section_id: sectionId,
        sort_order: questionDraft.sortOrder,
        prompt: questionDraft.prompt,
        answer_type: questionDraft.answerType,
        scale_min: questionDraft.scaleMin,
        scale_max: questionDraft.scaleMax,
        scale_low_label: questionDraft.scaleLowLabel,
        scale_high_label: questionDraft.scaleHighLabel,
        subject_kind: questionDraft.subjectKind,
        required: questionDraft.required,
        created_at: timestamp(),
      };
      data.surveyQuestions.push(question);
    }
  }

  return template;
}

export function mockCommitQuestionnaireImport(
  data: MockData,
  input: CampaignQuestionnaireImportInput,
  generateId: () => string,
): QuestionnaireImportCommitResult {
  const campaign = findCampaign(data, input.campaignId);
  if (!campaign) {
    throw new Error("Campaign not found");
  }
  const hasOpenInstance = data.surveyInstances.some(
    (instance) => instance.campaign_id === input.campaignId && instance.status === "open",
  );
  const plan = planQuestionnaireImport({
    campaignId: input.campaignId,
    campaignName: campaign.name,
    rows: input.rows,
    hasOpenInstance,
  });
  if (plan.counts.error > 0) {
    throw new Error(plan.rows.find((row) => row.kind === "error")?.reason ?? "Import failed");
  }

  const playerTemplateId = generateId();
  const coachTemplateId = generateId();
  persistTemplateFromDraft(data, {
    campaignId: input.campaignId,
    draft: plan.playerTemplate,
    createdBy: input.createdBy,
    templateId: playerTemplateId,
  });
  persistTemplateFromDraft(data, {
    campaignId: input.campaignId,
    draft: plan.coachTemplate,
    createdBy: input.createdBy,
    templateId: coachTemplateId,
  });

  return { plan, playerTemplateId, coachTemplateId };
}

export function mockPublishSurveyTemplate(
  data: MockData,
  templateId: string,
  publishedBy: string,
): SurveyTemplateBundle {
  const bundle = templateBundle(data, templateId);
  if (!bundle) {
    throw new Error("Template not found");
  }
  const hasOpen = data.surveyInstances.some(
    (instance) => instance.template_id === templateId && instance.status === "open",
  );
  if (hasOpen) {
    throw new Error("Close the survey before publishing a new template version.");
  }
  bundle.template.status = "published";
  bundle.template.published_at = timestamp();
  bundle.template.published_by = publishedBy;
  bundle.template.updated_at = timestamp();
  return bundle;
}

function raterProfilesForAudience(
  data: MockData,
  campaignId: string,
  audience: SurveyAudience,
): Profile[] {
  if (audience === "coach") {
    const coachIds = data.campaignCoaches
      .filter((row) => row.campaign_id === campaignId)
      .map((row) => row.coach_profile_id);
    return data.profiles.filter((profile) => coachIds.includes(profile.id));
  }
  const athleteIds = data.campaignMembers
    .filter((row) => row.campaign_id === campaignId)
    .map((row) => row.athlete_id);
  const profileIds = data.athletes
    .filter((athlete) => athleteIds.includes(athlete.id) && athlete.profile_id)
    .map((athlete) => athlete.profile_id as string);
  return data.profiles.filter((profile) => profileIds.includes(profile.id));
}

export function mockOpenSurveyInstance(
  data: MockData,
  input: { campaignId: string; audience: SurveyAudience; createdBy: string },
  generateId: () => string,
): CampaignSurveyInstance {
  const template = data.surveyTemplates
    .filter(
      (row) =>
        row.campaign_id === input.campaignId &&
        row.audience === input.audience &&
        row.status === "published",
    )
    .toSorted((a, b) => b.version - a.version)[0];
  if (!template) {
    throw new Error("Publish the questionnaire before opening the survey.");
  }

  let instance = data.surveyInstances.find(
    (row) =>
      row.campaign_id === input.campaignId &&
      row.audience === input.audience &&
      row.template_id === template.id,
  );
  if (!instance) {
    instance = {
      id: generateId(),
      campaign_id: input.campaignId,
      template_id: template.id,
      audience: input.audience,
      status: "open",
      opens_at: timestamp(),
      closes_at: null,
      min_response_count: 3,
      created_by: input.createdBy,
      created_at: timestamp(),
      updated_at: timestamp(),
    };
    data.surveyInstances.push(instance);
  } else {
    instance.status = "open";
    instance.opens_at = instance.opens_at ?? timestamp();
    instance.closes_at = null;
    instance.updated_at = timestamp();
  }

  const raters = raterProfilesForAudience(data, input.campaignId, input.audience);
  for (const profile of raters) {
    const exists = data.surveyAssignments.some(
      (row) => row.instance_id === instance!.id && row.rater_profile_id === profile.id,
    );
    if (!exists) {
      const assignment: CampaignSurveyAssignment = {
        id: generateId(),
        instance_id: instance.id,
        rater_profile_id: profile.id,
        status: "pending",
        submitted_at: null,
        created_at: timestamp(),
        updated_at: timestamp(),
      };
      data.surveyAssignments.push(assignment);
    }
  }

  return instance;
}

export function mockCloseSurveyInstance(
  data: MockData,
  instanceId: string,
): CampaignSurveyInstance {
  const instance = data.surveyInstances.find((row) => row.id === instanceId);
  if (!instance) {
    throw new Error("Survey instance not found");
  }
  instance.status = "closed";
  instance.closes_at = timestamp();
  instance.updated_at = timestamp();
  return instance;
}

export function mockGetMySurveyAssignment(
  data: MockData,
  profileId: string,
  campaignId: string,
): SurveyAssignmentBundle | null {
  const assignment = data.surveyAssignments.find((row) => {
    if (row.rater_profile_id !== profileId) {
      return false;
    }
    const instance = data.surveyInstances.find((inst) => inst.id === row.instance_id);
    return instance?.campaign_id === campaignId && instance.status === "open";
  });
  if (!assignment) {
    return null;
  }
  return assignmentBundle(data, assignment.id);
}

export function mockSaveSurveyAnswers(
  data: MockData,
  input: { assignmentId: string; answers: SurveyAnswerInput[]; submit: boolean },
  generateId: () => string,
): SurveyAssignmentBundle {
  const bundle = assignmentBundle(data, input.assignmentId);
  if (!bundle) {
    throw new Error("Assignment not found");
  }
  if (bundle.assignment.status === "submitted") {
    throw new Error("This questionnaire has already been submitted.");
  }
  if (bundle.instance.status !== "open") {
    throw new Error("This questionnaire is not open.");
  }

  for (const answerInput of input.answers) {
    const question = bundle.template.questions.find((row) => row.id === answerInput.questionId);
    if (!question) {
      throw new Error("Unknown question");
    }
    const error = validateSurveyAnswer(question, answerInput);
    if (error && input.submit) {
      throw new Error(error);
    }
    if (error && !input.submit) {
      continue;
    }
    const existing = data.surveyAnswers.find(
      (row) =>
        row.assignment_id === input.assignmentId && row.question_id === answerInput.questionId,
    );
    if (existing) {
      existing.numeric_value = answerInput.numericValue ?? null;
      existing.text_value = answerInput.textValue ?? null;
      existing.updated_at = timestamp();
    } else {
      const answer: CampaignSurveyAnswer = {
        id: generateId(),
        assignment_id: input.assignmentId,
        question_id: answerInput.questionId,
        numeric_value: answerInput.numericValue ?? null,
        text_value: answerInput.textValue ?? null,
        created_at: timestamp(),
        updated_at: timestamp(),
      };
      data.surveyAnswers.push(answer);
    }
  }

  const refreshed = assignmentBundle(data, input.assignmentId);
  if (!refreshed) {
    throw new Error("Assignment not found");
  }
  const answerInputs: SurveyAnswerInput[] = refreshed.answers.map((answer) => ({
    questionId: answer.question_id,
    numericValue: answer.numeric_value,
    textValue: answer.text_value,
  }));

  if (input.submit) {
    if (!isAssignmentComplete(refreshed.template.questions, answerInputs)) {
      throw new Error("Answer all required questions before submitting.");
    }
    refreshed.assignment.status = "submitted";
    refreshed.assignment.submitted_at = timestamp();
    refreshed.assignment.updated_at = timestamp();
  } else {
    refreshed.assignment.status =
      answerInputs.length > 0 ? "in_progress" : refreshed.assignment.status;
    refreshed.assignment.updated_at = timestamp();
  }

  return refreshed;
}

export function mockListSurveyCompletion(
  data: MockData,
  campaignId: string,
): SurveyCompletionRow[] {
  const instances = data.surveyInstances.filter((row) => row.campaign_id === campaignId);
  const rows: SurveyCompletionRow[] = [];

  for (const instance of instances) {
    const bundle = templateBundle(data, instance.template_id);
    if (!bundle) {
      continue;
    }
    const questionCount = bundle.questions.length;
    const assignments = data.surveyAssignments.filter((row) => row.instance_id === instance.id);
    for (const assignment of assignments) {
      const profile = data.profiles.find((row) => row.id === assignment.rater_profile_id);
      if (!profile) {
        continue;
      }
      const answers = data.surveyAnswers.filter((row) => row.assignment_id === assignment.id);
      rows.push({
        profileId: profile.id,
        name: profileDisplayName(profile),
        email: profile.email,
        audience: instance.audience,
        status: assignment.status,
        answeredCount: answers.length,
        questionCount,
        submittedAt: assignment.submitted_at,
      });
    }
  }

  return rows.toSorted(
    (a, b) => a.audience.localeCompare(b.audience) || a.name.localeCompare(b.name),
  );
}

export function mockGetSurveySectionAggregates(
  data: MockData,
  campaignId: string,
  audience: SurveyAudience,
) {
  const instance = data.surveyInstances
    .filter((row) => row.campaign_id === campaignId && row.audience === audience)
    .toSorted((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  if (!instance) {
    return [];
  }
  const bundle = templateBundle(data, instance.template_id);
  if (!bundle) {
    return [];
  }
  const assignments = data.surveyAssignments.filter(
    (row) => row.instance_id === instance.id && row.status === "submitted",
  );
  const answersByQuestion = new Map<string, number[]>();
  for (const assignment of assignments) {
    for (const answer of data.surveyAnswers.filter((row) => row.assignment_id === assignment.id)) {
      if (answer.numeric_value === null) {
        continue;
      }
      const bucket = answersByQuestion.get(answer.question_id) ?? [];
      bucket.push(answer.numeric_value);
      answersByQuestion.set(answer.question_id, bucket);
    }
  }
  const sections = bundle.sections.map((section) => ({
    title: section.title,
    questionIds: bundle.questions
      .filter((question) => question.section_id === section.id)
      .map((question) => question.id),
  }));
  return buildSectionAggregates({
    sections,
    answersByQuestion,
    minResponseCount: instance.min_response_count,
    submittedAssignmentCount: assignments.length,
  });
}
