// Selects the data backend. Offline/dev/tests use the in-memory mock; when Supabase
// credentials are present the real adapter is used. Both satisfy the same Api type.
import { useMockBackend } from "../lib/env";
import { mockApi } from "./mockApi";
import { supabaseApi } from "./supabaseApi";
import type { Api } from "./types";

export const api: Api = useMockBackend ? mockApi : supabaseApi;

export { resetData } from "./store";
export type * from "./types";
