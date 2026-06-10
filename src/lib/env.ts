// Centralised environment access. Vite exposes only VITE_-prefixed vars to the client.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const forceMock = import.meta.env.VITE_USE_MOCK === "true";
const isTest = import.meta.env.MODE === "test";

export const supabaseUrl = url ?? "";
export const supabaseAnonKey = anonKey ?? "";

// True only when both Supabase credentials are present.
export const isSupabaseConfigured = Boolean(url && anonKey);

// When Supabase is not configured (or VITE_USE_MOCK=true), the app runs against an
// in-memory mock backend so dev and tests work fully offline.
export const useMockBackend = isTest || forceMock || !isSupabaseConfigured;

export const appUrl =
  (import.meta.env.VITE_APP_URL as string | undefined) ??
  (typeof window === "undefined" ? "http://localhost:5173" : window.location.origin);
