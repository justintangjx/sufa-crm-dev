import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "../data";
import type { SignInResult } from "../data/types";
import { isSupabaseConfigured } from "../lib/env";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types/database";

interface AuthState {
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await api.getCurrentProfile();
    setProfile(next);
  }, []);

  useEffect(() => {
    let active = true;
    void api.getCurrentProfile().then((p) => {
      if (active) {
        setProfile(p);
        setLoading(false);
      }
    });

    // Keep the profile in sync with Supabase auth events when configured.
    if (isSupabaseConfigured && supabase) {
      const { data } = supabase.auth.onAuthStateChange(() => {
        void refresh();
      });
      return () => {
        active = false;
        data.subscription.unsubscribe();
      };
    }

    return () => {
      active = false;
    };
  }, [refresh]);

  const signIn = useCallback(async (email: string) => {
    const result = await api.signIn(email);
    if (result.status === "signed_in") {
      setProfile(result.profile);
    }
    return result;
  }, []);

  const signOut = useCallback(async () => {
    await api.signOut();
    setProfile(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ profile, loading, signIn, signOut, refresh }),
    [profile, loading, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
