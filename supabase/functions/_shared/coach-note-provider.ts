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
    signal: AbortSignal,
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
      hasContent: typeof message.content === "string" ? message.content.slice(0, 120) : message.content,
      hasReasoning: typeof message.reasoning === "string" ? message.reasoning.slice(0, 120) : null,
      reasoningDetailCount: message.reasoning_details?.length ?? 0,
    }),
  );
  throw new Error("provider_json_parse_failed");
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
    format: ResponseFormatMode,
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
        { role: "user", content: buildCoachNotePrompt(notes, repairErrors, options) },
      ],
    };

    if (format === "json_schema") {
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

    if (isOpenRouterApi(this.apiUrl)) {
      // Reasoning models (e.g. gpt-oss-120b:free) otherwise return prose in `reasoning`
      // with empty/non-JSON `content`, which breaks structured coach-note parsing.
      body.include_reasoning = false;
      body.reasoning = { effort: "none", exclude: true };
      body.plugins = [{ id: "response-healing" }];
    }

    return body;
  }

  private async requestOnce(
    notes: string,
    repairErrors: string[],
    signal: AbortSignal,
    options: { section?: string; action?: string },
    format: ResponseFormatMode,
  ): Promise<ProviderResult> {
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(this.buildRequestBody(notes, repairErrors, options, format)),
      signal,
    });

    if (!response.ok) {
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
    signal: AbortSignal,
    options: { section?: string; action?: string } = {},
  ): Promise<ProviderResult> {
    const formats: ResponseFormatMode[] = ["json_schema", "json_object"];
    let lastError: unknown = new Error("provider_json_parse_failed");

    for (const format of formats) {
      try {
        return await this.requestOnce(notes, repairErrors, signal, options, format);
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof Error &&
          (error.message === "provider_json_parse_failed" ||
            error.message === "provider_empty_response");
        if (!retryable || format === "json_object") {
          throw error;
        }
      }
    }

    throw lastError;
  }
}
