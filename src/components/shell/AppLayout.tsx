import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { demoCoachLlm } from "../../lib/env";
import { demoCoachLlmConfigError } from "../../lib/demoCoachLlmConfig";
import { sentenceCase } from "../../lib/format";
import type { Role } from "../../types/database";
import { DiscMark } from "./DiscMark";
import { Badge } from "./PagePrimitives";

const roleNav: Record<Role, { to: string; label: string }[]> = {
  player: [
    { to: "/player", label: "Dashboard" },
    { to: "/player/profile", label: "Profile" },
  ],
  admin: [
    { to: "/admin", label: "Dashboard" },
    { to: "/admin/players", label: "Players" },
    { to: "/admin/campaigns", label: "Campaigns" },
    { to: "/admin/review", label: "Review" },
    { to: "/admin/exports", label: "Exports" },
  ],
  coach: [{ to: "/coach", label: "Dashboard" }],
};

export function DemoCoachLlmConfigBanner() {
  if (!demoCoachLlm || !demoCoachLlmConfigError) {
    return null;
  }
  return (
    <p className="alert warn demo-coach-config-banner" role="status">
      Demo coach LLM is misconfigured: {demoCoachLlmConfigError}
    </p>
  );
}

export function AppLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const nav = profile ? roleNav[profile.role] : [];

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  return (
    <div className={`app-shell ${profile ? `role-${profile.role}` : ""}`}>
      <header className="app-header">
        <Link to="/" className="brand">
          <DiscMark className="brand-disc" />
          SUFA CRM
        </Link>
        <nav className="app-nav" aria-label="Primary">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to.split("/").length <= 2}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        {profile ? (
          <div className="app-user">
            <Badge>{sentenceCase(profile.role)}</Badge>
            <span>{profile.email}</span>
            <button type="button" className="btn sm" onClick={() => void handleSignOut()}>
              Sign out
            </button>
          </div>
        ) : null}
      </header>
      <DemoCoachLlmConfigBanner />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
