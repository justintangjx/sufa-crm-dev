import { demoCoachGateToken, demoCoachLlm, demoCoachLlmIdMap } from "./env";

export const DEMO_COACH_LLM_SEED_UUIDS = {
  "c-sea": "c0000000-0000-4000-8000-000000000001",
  "a-alice": "a0000000-0000-4000-8000-000000000001",
  "a-ben": "a0000000-0000-4000-8000-000000000002",
  "a-cara": "a0000000-0000-4000-8000-000000000003",
} as const;

export const DEMO_COACH_LLM_REQUIRED_MOCK_IDS = Object.keys(
  DEMO_COACH_LLM_SEED_UUIDS,
) as (keyof typeof DEMO_COACH_LLM_SEED_UUIDS)[];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildDemoCoachLlmIdMapEnvValue(): string {
  return JSON.stringify(DEMO_COACH_LLM_SEED_UUIDS);
}

export function validateDemoCoachLlmConfig(input: {
  enabled: boolean;
  gateToken: string;
  idMap: Record<string, string>;
}): string | null {
  if (!input.enabled) {
    return null;
  }
  if (!input.gateToken.trim()) {
    return "VITE_COACH_DEMO_GATE_TOKEN is required when VITE_DEMO_COACH_LLM is enabled.";
  }
  for (const mockId of DEMO_COACH_LLM_REQUIRED_MOCK_IDS) {
    const mapped = input.idMap[mockId]?.trim();
    if (!mapped) {
      return `VITE_DEMO_COACH_LLM_ID_MAP is missing "${mockId}". Use supabase/seed-demo-coach.sql and the documented env value.`;
    }
    if (!UUID_RE.test(mapped)) {
      return `VITE_DEMO_COACH_LLM_ID_MAP["${mockId}"] must be a UUID.`;
    }
  }
  return null;
}

export const demoCoachLlmConfigError = validateDemoCoachLlmConfig({
  enabled: demoCoachLlm,
  gateToken: demoCoachGateToken,
  idMap: demoCoachLlmIdMap,
});
