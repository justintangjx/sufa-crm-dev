import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { DiscMark } from "../../components/shell/DiscMark";
import { getRoleHome } from "../../lib/roles";

export function AuthCallbackPage() {
  const { profile, refresh } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (profile) {
      navigate(getRoleHome(profile.role), { replace: true });
    }
  }, [navigate, profile]);

  return (
    <main className="loading-screen">
      <DiscMark className="loading-disc" />
      <p className="muted">Completing sign in to SUFA CRM...</p>
    </main>
  );
}
