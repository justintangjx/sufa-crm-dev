import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isAssignmentComplete,
  validateSurveyAnswer,
  type SurveyAnswerInput,
} from "../lib/campaignSurvey";
import { buildSectionAggregates } from "../lib/campaignSurvey";
import { planQuestionnaireImport } from "../lib/questionnaireImport";
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

type Db = SupabaseClient;

async function loadTemplateBundle(
  client: Db,
  templateId: string,
): Promise<SurveyTemplateBundle | null> {
  const { data: template, error } = await client
    .from("campaign_survey_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!template) {
    return null;
  }
  const { data: sections, error: sectionError } = await client
    .from("campaign_survey_sections")
    .select("*")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });
  if (sectionError) {
    throw sectionError;
  }
  const sectionIds = (sections ?? []).map((section) => section.id);
  const { data: questions, error: questionError } = await client
    .from("campaign_survey_questions")
    .select("*")
    .in("section_id", sectionIds.length > 0 ? sectionIds : ["00000000-0000-0000-0000-000000000000"])
    .order("sort_order", { ascending: true });
  if (questionError) {
    throw questionError;
  }
  return {
    template: template as CampaignSurveyTemplate,
    sections: (sections ?? []) as CampaignSurveySection[],
    questions: (questions ?? []) as CampaignSurveyQuestion[],
  };
}

async function persistDraft(
  client: Db,
  campaignId: string,
  draft: import("../lib/questionnaireImport").QuestionnaireTemplateDraft,
  createdBy: string,
): Promise<CampaignSurveyTemplate> {
  const { data: versions } = await client
    .from("campaign_survey_templates")
    .select("version")
    .eq("campaign_id", campaignId)
    .eq("audience", draft.audience);
  const version =
    (versions ?? []).reduce((max, row) => Math.max(max, (row as { version: number }).version), 0) +
    1;

  const { data: campaign } = await client
    .from("campaigns")
    .select("name")
    .eq("id", campaignId)
    .maybeSingle();

  const { data: template, error } = await client
    .from("campaign_survey_templates")
    .insert({
      campaign_id: campaignId,
      audience: draft.audience,
      survey_window: "post_season",
      name: draft.name || `${campaign?.name ?? "Campaign"} ${draft.audience} questionnaire`,
      status: "draft",
      version,
      source_kind: "csv",
      created_by: createdBy,
    })
    .select("*")
    .single();
  if (error) {
    throw error;
  }

  for (const sectionDraft of draft.sections) {
    const { data: section, error: sectionError } = await client
      .from("campaign_survey_sections")
      .insert({
        template_id: template.id,
        title: sectionDraft.title,
        sort_order: sectionDraft.sortOrder,
      })
      .select("*")
      .single();
    if (sectionError) {
      throw sectionError;
    }
    for (const questionDraft of sectionDraft.questions) {
      const { error: questionError } = await client.from("campaign_survey_questions").insert({
        section_id: section.id,
        sort_order: questionDraft.sortOrder,
        prompt: questionDraft.prompt,
        answer_type: questionDraft.answerType,
        scale_min: questionDraft.scaleMin,
        scale_max: questionDraft.scaleMax,
        scale_low_label: questionDraft.scaleLowLabel,
        scale_high_label: questionDraft.scaleHighLabel,
        subject_kind: questionDraft.subjectKind,
        required: questionDraft.required,
      });
      if (questionError) {
        throw questionError;
      }
    }
  }

  return template as CampaignSurveyTemplate;
}

export async function supabaseCommitQuestionnaireImport(
  client: Db,
  input: CampaignQuestionnaireImportInput,
): Promise<QuestionnaireImportCommitResult> {
  const { data: campaign } = await client
    .from("campaigns")
    .select("name")
    .eq("id", input.campaignId)
    .maybeSingle();
  const { data: openInstances } = await client
    .from("campaign_survey_instances")
    .select("id")
    .eq("campaign_id", input.campaignId)
    .eq("status", "open");
  const plan = planQuestionnaireImport({
    campaignId: input.campaignId,
    campaignName: campaign?.name ?? "Campaign",
    rows: input.rows,
    hasOpenInstance: (openInstances ?? []).length > 0,
  });
  if (plan.counts.error > 0) {
    throw new Error(plan.rows.find((row) => row.kind === "error")?.reason ?? "Import failed");
  }
  const playerTemplate = await persistDraft(
    client,
    input.campaignId,
    plan.playerTemplate,
    input.createdBy,
  );
  const coachTemplate = await persistDraft(
    client,
    input.campaignId,
    plan.coachTemplate,
    input.createdBy,
  );
  return {
    plan,
    playerTemplateId: playerTemplate.id,
    coachTemplateId: coachTemplate.id,
  };
}

export async function supabaseGetSurveyTemplateBundle(
  client: Db,
  templateId: string,
): Promise<SurveyTemplateBundle | null> {
  return loadTemplateBundle(client, templateId);
}

export async function supabaseListSurveyTemplates(
  client: Db,
  campaignId: string,
): Promise<CampaignSurveyTemplate[]> {
  const { data, error } = await client
    .from("campaign_survey_templates")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("audience", { ascending: true })
    .order("version", { ascending: false });
  if (error) {
    throw error;
  }
  return (data ?? []) as CampaignSurveyTemplate[];
}

export async function supabasePublishSurveyTemplate(
  client: Db,
  templateId: string,
  publishedBy: string,
): Promise<SurveyTemplateBundle> {
  const { error } = await client
    .from("campaign_survey_templates")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      published_by: publishedBy,
    })
    .eq("id", templateId);
  if (error) {
    throw error;
  }
  const bundle = await loadTemplateBundle(client, templateId);
  if (!bundle) {
    throw new Error("Template not found");
  }
  return bundle;
}

async function listRaterProfiles(
  client: Db,
  campaignId: string,
  audience: SurveyAudience,
): Promise<Profile[]> {
  if (audience === "coach") {
    const { data: coaches, error } = await client
      .from("campaign_coaches")
      .select("coach_profile_id")
      .eq("campaign_id", campaignId);
    if (error) {
      throw error;
    }
    const ids = (coaches ?? []).map(
      (row) => (row as { coach_profile_id: string }).coach_profile_id,
    );
    if (ids.length === 0) {
      return [];
    }
    const { data: profiles, error: profileError } = await client
      .from("profiles")
      .select("*")
      .in("id", ids);
    if (profileError) {
      throw profileError;
    }
    return (profiles ?? []) as Profile[];
  }
  const { data: members, error } = await client
    .from("campaign_members")
    .select("athlete_id")
    .eq("campaign_id", campaignId);
  if (error) {
    throw error;
  }
  const athleteIds = (members ?? []).map((row) => (row as { athlete_id: string }).athlete_id);
  if (athleteIds.length === 0) {
    return [];
  }
  const { data: athletes, error: athleteError } = await client
    .from("athletes")
    .select("profile_id")
    .in("id", athleteIds)
    .not("profile_id", "is", null);
  if (athleteError) {
    throw athleteError;
  }
  const profileIds = (athletes ?? [])
    .map((row) => (row as { profile_id: string | null }).profile_id)
    .filter((id): id is string => id !== null);
  if (profileIds.length === 0) {
    return [];
  }
  const { data: profiles, error: profileError } = await client
    .from("profiles")
    .select("*")
    .in("id", profileIds);
  if (profileError) {
    throw profileError;
  }
  return (profiles ?? []) as Profile[];
}

export async function supabaseOpenSurveyInstance(
  client: Db,
  input: { campaignId: string; audience: SurveyAudience; createdBy: string },
): Promise<CampaignSurveyInstance> {
  const { data: template, error: templateError } = await client
    .from("campaign_survey_templates")
    .select("*")
    .eq("campaign_id", input.campaignId)
    .eq("audience", input.audience)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (templateError) {
    throw templateError;
  }
  if (!template) {
    throw new Error("Publish the questionnaire before opening the survey.");
  }

  const { data: existing } = await client
    .from("campaign_survey_instances")
    .select("*")
    .eq("campaign_id", input.campaignId)
    .eq("audience", input.audience)
    .eq("template_id", template.id)
    .maybeSingle();

  let instance = existing as CampaignSurveyInstance | null;
  if (!instance) {
    const { data: created, error } = await client
      .from("campaign_survey_instances")
      .insert({
        campaign_id: input.campaignId,
        template_id: template.id,
        audience: input.audience,
        status: "open",
        opens_at: new Date().toISOString(),
        created_by: input.createdBy,
      })
      .select("*")
      .single();
    if (error) {
      throw error;
    }
    instance = created as CampaignSurveyInstance;
  } else {
    const { data: updated, error } = await client
      .from("campaign_survey_instances")
      .update({
        status: "open",
        opens_at: instance.opens_at ?? new Date().toISOString(),
        closes_at: null,
      })
      .eq("id", instance.id)
      .select("*")
      .single();
    if (error) {
      throw error;
    }
    instance = updated as CampaignSurveyInstance;
  }

  const raters = await listRaterProfiles(client, input.campaignId, input.audience);
  for (const profile of raters) {
    const { data: existingAssignment } = await client
      .from("campaign_survey_assignments")
      .select("id")
      .eq("instance_id", instance.id)
      .eq("rater_profile_id", profile.id)
      .maybeSingle();
    if (!existingAssignment) {
      const { error } = await client.from("campaign_survey_assignments").insert({
        instance_id: instance.id,
        rater_profile_id: profile.id,
        status: "pending",
      });
      if (error) {
        throw error;
      }
    }
  }

  return instance;
}

export async function supabaseCloseSurveyInstance(
  client: Db,
  instanceId: string,
): Promise<CampaignSurveyInstance> {
  const { data, error } = await client
    .from("campaign_survey_instances")
    .update({ status: "closed", closes_at: new Date().toISOString() })
    .eq("id", instanceId)
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  return data as CampaignSurveyInstance;
}

export async function supabaseListSurveyInstances(
  client: Db,
  campaignId: string,
): Promise<CampaignSurveyInstance[]> {
  const { data, error } = await client
    .from("campaign_survey_instances")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("audience", { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []) as CampaignSurveyInstance[];
}

export async function supabaseGetMySurveyAssignment(
  client: Db,
  profileId: string,
  campaignId: string,
): Promise<SurveyAssignmentBundle | null> {
  const { data: assignments, error } = await client
    .from("campaign_survey_assignments")
    .select("*, instance:campaign_survey_instances!inner(*)")
    .eq("rater_profile_id", profileId)
    .eq("campaign_survey_instances.campaign_id", campaignId)
    .eq("campaign_survey_instances.status", "open");
  if (error) {
    throw error;
  }
  const assignment = (assignments ?? [])[0] as
    | (CampaignSurveyAssignment & { instance: CampaignSurveyInstance })
    | undefined;
  if (!assignment) {
    return null;
  }
  const template = await loadTemplateBundle(client, assignment.instance.template_id);
  if (!template) {
    return null;
  }
  const { data: answers, error: answerError } = await client
    .from("campaign_survey_answers")
    .select("*")
    .eq("assignment_id", assignment.id);
  if (answerError) {
    throw answerError;
  }
  return {
    assignment,
    instance: assignment.instance,
    template,
    answers: (answers ?? []) as CampaignSurveyAnswer[],
  };
}

export async function supabaseSaveSurveyAnswers(
  client: Db,
  input: { assignmentId: string; answers: SurveyAnswerInput[]; submit: boolean },
): Promise<SurveyAssignmentBundle> {
  const { data: assignment, error } = await client
    .from("campaign_survey_assignments")
    .select("*, instance:campaign_survey_instances(*)")
    .eq("id", input.assignmentId)
    .single();
  if (error) {
    throw error;
  }
  const row = assignment as CampaignSurveyAssignment & { instance: CampaignSurveyInstance };
  if (row.status === "submitted") {
    throw new Error("This questionnaire has already been submitted.");
  }
  if (row.instance.status !== "open") {
    throw new Error("This questionnaire is not open.");
  }
  const template = await loadTemplateBundle(client, row.instance.template_id);
  if (!template) {
    throw new Error("Template not found");
  }

  for (const answerInput of input.answers) {
    const question = template.questions.find((q) => q.id === answerInput.questionId);
    if (!question) {
      throw new Error("Unknown question");
    }
    const validationError = validateSurveyAnswer(question, answerInput);
    if (validationError && input.submit) {
      throw new Error(validationError);
    }
    if (validationError) {
      continue;
    }
    const { data: existing } = await client
      .from("campaign_survey_answers")
      .select("id")
      .eq("assignment_id", input.assignmentId)
      .eq("question_id", answerInput.questionId)
      .maybeSingle();
    const payload = {
      numeric_value: answerInput.numericValue ?? null,
      text_value: answerInput.textValue ?? null,
    };
    if (existing) {
      const { error: updateError } = await client
        .from("campaign_survey_answers")
        .update(payload)
        .eq("id", existing.id);
      if (updateError) {
        throw updateError;
      }
    } else {
      const { error: insertError } = await client.from("campaign_survey_answers").insert({
        assignment_id: input.assignmentId,
        question_id: answerInput.questionId,
        ...payload,
      });
      if (insertError) {
        throw insertError;
      }
    }
  }

  const bundle = await supabaseGetMySurveyAssignment(
    client,
    row.rater_profile_id,
    row.instance.campaign_id,
  );
  if (!bundle) {
    throw new Error("Assignment not found");
  }
  const answerInputs: SurveyAnswerInput[] = bundle.answers.map((answer) => ({
    questionId: answer.question_id,
    numericValue: answer.numeric_value,
    textValue: answer.text_value,
  }));
  if (input.submit) {
    if (!isAssignmentComplete(bundle.template.questions, answerInputs)) {
      throw new Error("Answer all required questions before submitting.");
    }
    const { error: submitError } = await client
      .from("campaign_survey_assignments")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", input.assignmentId);
    if (submitError) {
      throw submitError;
    }
    bundle.assignment.status = "submitted";
    bundle.assignment.submitted_at = new Date().toISOString();
  } else if (answerInputs.length > 0) {
    await client
      .from("campaign_survey_assignments")
      .update({ status: "in_progress" })
      .eq("id", input.assignmentId);
    bundle.assignment.status = "in_progress";
  }
  return bundle;
}

export async function supabaseListSurveyCompletion(
  client: Db,
  campaignId: string,
): Promise<SurveyCompletionRow[]> {
  const instances = await supabaseListSurveyInstances(client, campaignId);
  const rows: SurveyCompletionRow[] = [];
  for (const instance of instances) {
    const bundle = await loadTemplateBundle(client, instance.template_id);
    if (!bundle) {
      continue;
    }
    const { data: assignments, error } = await client
      .from("campaign_survey_assignments")
      .select("*")
      .eq("instance_id", instance.id);
    if (error) {
      throw error;
    }
    for (const assignment of assignments ?? []) {
      const row = assignment as CampaignSurveyAssignment;
      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("*")
        .eq("id", row.rater_profile_id)
        .single();
      if (profileError || !profile) {
        continue;
      }
      const { count } = await client
        .from("campaign_survey_answers")
        .select("id", { count: "exact", head: true })
        .eq("assignment_id", row.id);
      rows.push({
        profileId: profile.id,
        name: profileDisplayName(profile as Profile),
        email: (profile as Profile).email,
        audience: instance.audience,
        status: row.status,
        answeredCount: count ?? 0,
        questionCount: bundle.questions.length,
        submittedAt: row.submitted_at,
      });
    }
  }
  return rows;
}

export async function supabaseGetSurveySectionAggregates(
  client: Db,
  campaignId: string,
  audience: SurveyAudience,
) {
  const instances = await supabaseListSurveyInstances(client, campaignId);
  const instance = instances
    .filter((row) => row.audience === audience)
    .toSorted((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  if (!instance) {
    return [];
  }
  const bundle = await loadTemplateBundle(client, instance.template_id);
  if (!bundle) {
    return [];
  }
  const { data: assignments } = await client
    .from("campaign_survey_assignments")
    .select("id")
    .eq("instance_id", instance.id)
    .eq("status", "submitted");
  const answersByQuestion = new Map<string, number[]>();
  for (const assignment of assignments ?? []) {
    const { data: answers } = await client
      .from("campaign_survey_answers")
      .select("*")
      .eq("assignment_id", (assignment as { id: string }).id);
    for (const answer of answers ?? []) {
      const row = answer as CampaignSurveyAnswer;
      if (row.numeric_value === null) {
        continue;
      }
      const bucket = answersByQuestion.get(row.question_id) ?? [];
      bucket.push(row.numeric_value);
      answersByQuestion.set(row.question_id, bucket);
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
    submittedAssignmentCount: (assignments ?? []).length,
  });
}
