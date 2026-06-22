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

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
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
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("provider_empty_response");
    }
    return {
      draft: JSON.parse(content) as CoachNoteDraft,
      usage: {
        inputTokens: body.usage?.prompt_tokens ?? null,
        outputTokens: body.usage?.completion_tokens ?? null,
      },
    };
  }
}
