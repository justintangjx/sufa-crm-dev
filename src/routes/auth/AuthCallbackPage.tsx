import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { DiscMark } from "../../components/shell/DiscMark";
import { getRoleHome } from "../../lib/roles";

const PROFILE_WAIT_MS = 8000;

export function AuthCallbackPage() {
  const { profile, refresh } = useAuth();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (profile) {
      navigate(getRoleHome(profile.role), { replace: true });
    }
  }, [navigate, profile]);

  // If a session never materializes (e.g. the roster link was rejected or the
  // magic link expired), stop spinning and send the user back to sign in.
  useEffect(() => {
    if (profile) {
      return;
    }
    const timer = window.setTimeout(() => setTimedOut(true), PROFILE_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [profile]);

  if (timedOut && !profile) {
    return (
      <main className="loading-screen">
        <DiscMark className="loading-disc" />
        <p className="muted">
          We could not complete your sign in. Your link may have expired, or your email may not be
          on a campaign roster yet.
        </p>
        <Link className="btn" to="/login">
          Back to sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="loading-screen">
      <DiscMark className="loading-disc" />
      <p className="muted">Completing sign in to SUFA CRM...</p>
    </main>
  );
}
