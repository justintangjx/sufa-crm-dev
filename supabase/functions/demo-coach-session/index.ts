import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-demo-gate",
};

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;

const rateLimitWindows = new Map<string, { count: number; windowStart: number }>();

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`missing_env_${name.toLowerCase()}`);
  }
  return value;
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? "unknown";
}

function isRateLimited(clientIp: string): boolean {
  const now = Date.now();
  const entry = rateLimitWindows.get(clientIp);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitWindows.set(clientIp, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }
  entry.count += 1;
  return false;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  if (Deno.env.get("COACH_DEMO_ENABLED") !== "true") {
    return json(403, { error: "demo_disabled" });
  }

  const clientIp = getClientIp(request);
  if (isRateLimited(clientIp)) {
    return json(429, { error: "rate_limit_exceeded" });
  }

  const gate = request.headers.get("x-demo-gate");
  const expectedGate = Deno.env.get("COACH_DEMO_GATE_TOKEN");
  if (!expectedGate || gate !== expectedGate) {
    return json(403, { error: "invalid_demo_gate" });
  }

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const email = requiredEnv("COACH_DEMO_EMAIL");
    const password = requiredEnv("COACH_DEMO_PASSWORD");

    const client = createClient(supabaseUrl, anonKey);
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return json(502, { error: "demo_sign_in_failed" });
    }

    return json(200, {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "demo_session_failed";
    return json(500, { error: code });
  }
});
