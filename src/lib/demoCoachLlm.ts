import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  demoCoachGateToken,
  demoCoachLlm,
  demoCoachLlmIdMap,
  isSupabaseConfigured,
  supabaseAnonKey,
  supabaseUrl,
} from "./env";
import { demoCoachLlmConfigError } from "./demoCoachLlmConfig";

let demoCoachClient: SupabaseClient | null = null;

export function mapDemoCoachNoteIds<T extends { campaignId: string; athleteId: string }>(
  input: T,
): T {
  if (!demoCoachLlm || Object.keys(demoCoachLlmIdMap).length === 0) {
    return input;
  }
  return {
    ...input,
    campaignId: demoCoachLlmIdMap[input.campaignId] ?? input.campaignId,
    athleteId: demoCoachLlmIdMap[input.athleteId] ?? input.athleteId,
  };
}

async function sessionIsFresh(client: SupabaseClient): Promise<boolean> {
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session?.expires_at) {
    return false;
  }
  return session.expires_at * 1000 > Date.now() + 60_000;
}

export async function ensureDemoCoachSupabaseClient(): Promise<SupabaseClient> {
  if (!demoCoachLlm || !isSupabaseConfigured) {
    throw new Error("Demo coach LLM is not configured");
  }
  if (demoCoachLlmConfigError) {
    throw new Error(demoCoachLlmConfigError);
  }
  if (!demoCoachGateToken) {
    throw new Error("VITE_COACH_DEMO_GATE_TOKEN is required for demo coach LLM");
  }
  if (demoCoachClient && (await sessionIsFresh(demoCoachClient))) {
    return demoCoachClient;
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/demo-coach-session`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "x-demo-gate": demoCoachGateToken,
      "Content-Type": "application/json",
    },
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
  };
  if (!response.ok || !body.access_token || !body.refresh_token) {
    throw new Error(body.error ?? "demo_coach_session_failed");
  }

  if (!demoCoachClient) {
    demoCoachClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
      },
    });
  }

  const { error } = await demoCoachClient.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  if (error) {
    throw error;
  }
  return demoCoachClient;
}

export async function clearDemoCoachSession(): Promise<void> {
  if (!demoCoachClient) {
    return;
  }
  await demoCoachClient.auth.signOut();
  demoCoachClient = null;
}
