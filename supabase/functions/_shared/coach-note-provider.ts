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

interface ChatCompletionMessage {
  content?: string | Record<string, unknown> | null;
  reasoning?: string | null;
}

interface ChatCompletionResponse {
  choices?: { message?: ChatCompletionMessage }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function parseProviderDraft(message: ChatCompletionMessage | undefined): CoachNoteDraft {
  if (!message) {
    throw new Error("provider_empty_response");
  }

  if (isRecord(message.content)) {
    return message.content as CoachNoteDraft;
  }

  const textSources = [message.content, message.reasoning].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );

  for (const source of textSources) {
    try {
      return parseJsonDraft(source);
    } catch (error) {
      if (error instanceof Error && error.message === "provider_json_parse_failed") {
        continue;
      }
      throw error;
    }
  }

  throw new Error("provider_json_parse_failed");
}

export class OpenAiCompatibleCoachNoteGenerator implements CoachNoteGenerator {
  provider = "openai-compatible";

  constructor(
    readonly model: string,
    private readonly apiUrl: string,
    private readonly apiKey: string,
  ) {}

  async generate(
    notes: string,
    repairErrors: string[],
    signal: AbortSignal,
    options: { section?: string; action?: string } = {},
  ): Promise<ProviderResult> {
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
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
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "coach_note_draft_v1",
            strict: true,
            schema: coachNoteJsonSchema,
          },
        },
      }),
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
}
