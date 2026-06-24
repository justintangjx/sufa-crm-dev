import { coachNoteJsonSchema, type CoachNoteDraft } from "./coach-note-contract.ts";
import { buildCoachNotePrompt } from "./coach-note-prompt.ts";

export interface ProviderUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface ProviderResult {
  draft: CoachNoteDraft;
  usage: ProviderUsage;
}

export interface CoachNoteGenerator {
  provider: string;
  model: string;
  generate(
    notes: string,
    repairErrors: string[],
    timeoutMs: number,
    options?: { section?: string; action?: string },
  ): Promise<ProviderResult>;
}

interface ReasoningDetail {
  type?: string;
  text?: string;
  summary?: string;
}

interface ChatCompletionMessage {
  content?: string | Record<string, unknown> | null;
  reasoning?: string | null;
  reasoning_details?: ReasoningDetail[];
}

interface ChatCompletionResponse {
  choices?: { message?: ChatCompletionMessage }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

type ResponseFormatMode = "json_schema" | "json_object";

interface RequestProfile {
  format: ResponseFormatMode;
  includeReasoning?: boolean;
  responseHealing?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOpenRouterApi(apiUrl: string): boolean {
  return apiUrl.includes("openrouter.ai");
}

function stripCodeFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : text;
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) {
    return null;
  }
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseJsonDraft(text: string): CoachNoteDraft {
  const cleaned = stripCodeFence(text.trim());
  try {
    return JSON.parse(cleaned) as CoachNoteDraft;
  } catch {
    const extracted = extractJsonObject(cleaned);
    if (!extracted) {
      throw new Error("provider_json_parse_failed");
    }
    return JSON.parse(extracted) as CoachNoteDraft;
  }
}

function collectMessageText(message: ChatCompletionMessage): string[] {
  const sources: string[] = [];
  if (typeof message.content === "string" && message.content.trim().length > 0) {
    sources.push(message.content);
  }
  if (typeof message.reasoning === "string" && message.reasoning.trim().length > 0) {
    sources.push(message.reasoning);
  }
  for (const detail of message.reasoning_details ?? []) {
    if (typeof detail.text === "string" && detail.text.trim().length > 0) {
      sources.push(detail.text);
    }
    if (typeof detail.summary === "string" && detail.summary.trim().length > 0) {
      sources.push(detail.summary);
    }
  }
  return sources;
}

function parseProviderDraft(message: ChatCompletionMessage | undefined): CoachNoteDraft {
  if (!message) {
    throw new Error("provider_empty_response");
  }

  if (isRecord(message.content)) {
    return message.content as CoachNoteDraft;
  }

  for (const source of collectMessageText(message)) {
    try {
      return parseJsonDraft(source);
    } catch (error) {
      if (error instanceof Error && error.message === "provider_json_parse_failed") {
        continue;
      }
      throw error;
    }
  }

  console.error(
    "provider_json_parse_failed",
    JSON.stringify({
      hasContent:
        typeof message.content === "string" ? message.content.slice(0, 120) : message.content,
      hasReasoning: typeof message.reasoning === "string" ? message.reasoning.slice(0, 120) : null,
      reasoningDetailCount: message.reasoning_details?.length ?? 0,
    }),
  );
  throw new Error("provider_json_parse_failed");
}

function isReasoningOrFreeModel(model: string): boolean {
  const normalized = model.toLowerCase();
  return normalized.includes("gpt-oss") || normalized.includes(":free");
}

function requestProfiles(apiUrl: string, model: string): RequestProfile[] {
  if (isOpenRouterApi(apiUrl) && isReasoningOrFreeModel(model)) {
    // One call with a full timeout budget. Free reasoning models need ~25s+ and often
    // return prose in `reasoning`; json_object + include_reasoning=false is the stable path.
    return [{ format: "json_object", includeReasoning: false, responseHealing: true }];
  }

  if (isOpenRouterApi(apiUrl)) {
    return [
      { format: "json_schema" },
      { format: "json_object", includeReasoning: false, responseHealing: true },
    ];
  }

  return [{ format: "json_schema" }, { format: "json_object" }];
}

function isRetryableProviderError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message === "provider_json_parse_failed" ||
    error.message === "provider_empty_response" ||
    error.message === "provider_http_400" ||
    error.message === "provider_http_422" ||
    error.message === "provider_timeout"
  );
}

export class OpenAiCompatibleCoachNoteGenerator implements CoachNoteGenerator {
  provider = "openai-compatible";

  constructor(
    readonly model: string,
    private readonly apiUrl: string,
    private readonly apiKey: string,
  ) {}

  private buildRequestBody(
    notes: string,
    repairErrors: string[],
    options: { section?: string; action?: string },
    profile: RequestProfile,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You structure coach notes into evidence-grounded JSON. You never make ratings or selection decisions.",
        },
        {
          role: "user",
          content: buildCoachNotePrompt(notes, repairErrors, {
            ...options,
            includeSchema: profile.format === "json_object",
          }),
        },
      ],
    };

    if (profile.format === "json_schema") {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: "coach_note_draft_v1",
          strict: true,
          schema: coachNoteJsonSchema,
        },
      };
    } else {
      body.response_format = { type: "json_object" };
    }

    if (profile.includeReasoning === false) {
      body.include_reasoning = false;
    }
    if (profile.responseHealing) {
      body.plugins = [{ id: "response-healing" }];
    }

    return body;
  }

  private async requestOnce(
    notes: string,
    repairErrors: string[],
    timeoutMs: number,
    options: { section?: string; action?: string },
    profile: RequestProfile,
  ): Promise<ProviderResult> {
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(this.buildRequestBody(notes, repairErrors, options, profile)),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        "provider_http_error",
        JSON.stringify({
          status: response.status,
          profile,
          body: errorBody.slice(0, 500),
        }),
      );
      throw new Error(`provider_http_${response.status}`);
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const draft = parseProviderDraft(body.choices?.[0]?.message);
    return {
      draft,
      usage: {
        inputTokens: body.usage?.prompt_tokens ?? null,
        outputTokens: body.usage?.completion_tokens ?? null,
      },
    };
  }

  async generate(
    notes: string,
    repairErrors: string[],
    timeoutMs: number,
    options: { section?: string; action?: string } = {},
  ): Promise<ProviderResult> {
    const profiles = requestProfiles(this.apiUrl, this.model);
    let lastError: unknown = new Error("provider_json_parse_failed");

    for (const profile of profiles) {
      try {
        return await this.requestOnce(notes, repairErrors, timeoutMs, options, profile);
      } catch (error) {
        lastError = error;
        if (!isRetryableProviderError(error) || profile === profiles[profiles.length - 1]) {
          throw error;
        }
        console.error(
          "provider_profile_retry",
          JSON.stringify({
            model: this.model,
            profile,
            error: error instanceof Error ? error.message : "unknown",
          }),
        );
      }
    }

    throw lastError;
  }
}
