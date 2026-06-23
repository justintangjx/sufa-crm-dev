// Centralised environment access. Vite exposes only VITE_-prefixed vars to the client.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const forceMock = import.meta.env.VITE_USE_MOCK === "true";
const isTest = import.meta.env.MODE === "test";
const forceCoachLlm = import.meta.env.VITE_ENABLE_COACH_LLM === "true";

export const supabaseUrl = url ?? "";
export const supabaseAnonKey = anonKey ?? "";

// True only when both Supabase credentials are present.
export const isSupabaseConfigured = Boolean(url && anonKey);

// When Supabase is not configured (or VITE_USE_MOCK=true), the app runs against an
// in-memory mock backend so dev and tests work fully offline.
export const useMockBackend = isTest || forceMock || !isSupabaseConfigured;

// Hybrid demo: mock login buttons + real Edge Function LLM for the coach evaluation flow.
export const demoCoachLlm =
  !isTest && import.meta.env.VITE_DEMO_COACH_LLM === "true" && isSupabaseConfigured;

export const demoCoachGateToken =
  (import.meta.env.VITE_COACH_DEMO_GATE_TOKEN as string | undefined) ?? "";

function parseDemoCoachLlmIdMap(): Record<string, string> {
  const raw = import.meta.env.VITE_DEMO_COACH_LLM_ID_MAP as string | undefined;
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export const demoCoachLlmIdMap = parseDemoCoachLlmIdMap();

// Real remote LLM: production flag on Supabase backend, or hybrid demo coach mode.
export const useRemoteCoachLlm =
  (!useMockBackend && forceCoachLlm) || (useMockBackend && demoCoachLlm);

export const enableCoachLlm = useRemoteCoachLlm;

export const appUrl =
  (import.meta.env.VITE_APP_URL as string | undefined) ??
  (typeof window === "undefined" ? "http://localhost:5173" : window.location.origin);
