import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  BrowserRouter,
  Link,
  MemoryRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { api } from "./data";
import type {
  AdminStats,
  CampaignReadinessEntry,
  CampaignWithMembership,
  ChangeRequestView,
} from "./data/types";
import { draftPlayerReminder, summarizeCampaignReadiness } from "./lib/assistant";
import { getPassportStatus, passportStatusLabel } from "./lib/passport";
import { getProfileCompletion, getMissingAthleteFields } from "./lib/profile";
import { getRoleHome } from "./lib/roles";
import type { Athlete, Campaign, CoachAthleteView, CoachEvaluation, Role } from "./types/database";

function LoadingPage() {
  return (
    <main className="app-main">
      <p className="muted">Loading SUFA CRM...</p>
    </main>
  );
}

function PageHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}

function Badge({
  children,
  tone = "accent",
}: {
  children: ReactNode;
  tone?: "accent" | "danger" | "ok" | "warn";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function RootRedirect() {
  const { profile, loading } = useAuth();
  if (loading) {
    return <LoadingPage />;
  }
  return <Navigate to={profile ? getRoleHome(profile.role) : "/login"} replace />;
}

function RequireRole({ role }: { role: Role }) {
  const { profile, loading } = useAuth();
  if (loading) {
    return <LoadingPage />;
  }
  if (!profile) {
    return <Navigate to="/login" replace />;
  }
  if (profile.role !== role) {
    return <Navigate to={getRoleHome(profile.role)} replace />;
  }
  return <Outlet />;
}

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
  coach: [
    { to: "/coach", label: "Dashboard" },
    { to: "/coach/campaigns/c-sea", label: "SEA Games" },
  ],
};

function AppLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const nav = profile ? roleNav[profile.role] : [];

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand">
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
            <span>{profile.email}</span>
            <button type="button" className="btn sm" onClick={() => void handleSignOut()}>
              Sign out
            </button>
          </div>
        ) : null}
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

function LoginPage() {
  const { profile, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (profile) {
    return <Navigate to={getRoleHome(profile.role)} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const result = await signIn(email);
      if (result.status === "signed_in") {
        navigate(getRoleHome(result.profile.role));
        return;
      }
      if (result.status === "unknown_email") {
        setStatus("No SUFA CRM account was found for that email.");
        return;
      }
      setStatus("Check your email for your login link.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <section className="card auth-card">
        <PageHead
          title="Sign in to SUFA CRM"
          subtitle="Use your SUFA email to request a magic link."
        />
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@sufa.test"
              required
            />
          </div>
          <button type="submit" className="btn primary" disabled={submitting}>
            {submitting ? "Sending..." : "Send magic link"}
          </button>
        </form>
        {status ? <p className="alert warn">{status}</p> : null}
        <p className="muted">
          Mock users: admin@sufa.test, coach@sufa.test, alice@sufa.test, ben@sufa.test.
        </p>
      </section>
    </div>
  );
}

function AuthCallbackPage() {
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
    <section className="card">
      <h1>Completing sign in...</h1>
      <p className="muted">We are checking your SUFA CRM session.</p>
    </section>
  );
}

function PlayerDashboard() {
  const { profile } = useAuth();
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignWithMembership[]>([]);

  useEffect(() => {
    if (!profile) {
      return;
    }
    void Promise.all([
      api.getAthleteForProfile(profile.id),
      api.getCampaignsForProfile(profile.id),
    ]).then(([nextAthlete, nextCampaigns]) => {
      setAthlete(nextAthlete);
      setCampaigns(nextCampaigns);
    });
  }, [profile]);

  const missing = useMemo(() => (athlete ? getMissingAthleteFields(athlete) : []), [athlete]);
  const completion = athlete ? getProfileCompletion(athlete) : 0;

  return (
    <>
      <PageHead
        title="Player Dashboard"
        subtitle="Your profile checklist and campaign readiness."
      />
      <div className="grid cols-2">
        <section className="card stack">
          <div className="section-title">
            <h2>Profile completion</h2>
            <Badge tone={completion === 100 ? "ok" : "warn"}>{completion}%</Badge>
          </div>
          <div className="progress" aria-label={`Profile completion ${completion}%`}>
            <span style={{ width: `${completion}%` }} />
          </div>
          {missing.length > 0 ? (
            <ul>
              {missing.map((field) => (
                <li key={field.field}>{field.label}</li>
              ))}
            </ul>
          ) : (
            <p>Your required profile details are complete.</p>
          )}
          <Link className="btn primary" to="/player/profile">
            Complete missing details
          </Link>
        </section>
        <section className="card stack">
          <h2>Assistant</h2>
          <p>
            {athlete
              ? `${completion}% complete. ${missing.length} required items remaining.`
              : "Loading profile..."}
          </p>
          <div className="note-box">
            {missing.length > 0
              ? `What am I missing? ${missing.map((field) => field.label).join(", ")}.`
              : "What am I missing? Nothing required right now."}
          </div>
        </section>
      </div>
      <section className="card stack">
        <h2>Campaigns</h2>
        {campaigns.length > 0 ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Team</th>
                  <th>Status</th>
                  <th>Member status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>{campaign.name}</td>
                    <td>{campaign.team ?? "Unassigned"}</td>
                    <td>{campaign.status}</td>
                    <td>{campaign.memberStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No campaign assignments yet.</p>
        )}
      </section>
    </>
  );
}

function PlayerProfilePage() {
  const { profile } = useAuth();
  const [athlete, setAthlete] = useState<Athlete | null>(null);

  useEffect(() => {
    if (profile) {
      void api.getAthleteForProfile(profile.id).then(setAthlete);
    }
  }, [profile]);

  return (
    <>
      <PageHead title="Player Profile" subtitle="Structured profile editing comes next." />
      <section className="card stack">
        <h2>Current details</h2>
        {athlete ? (
          <dl>
            <dt>Legal name</dt>
            <dd>{athlete.legal_name ?? "Missing"}</dd>
            <dt>Phone</dt>
            <dd>{athlete.phone ?? "Missing"}</dd>
            <dt>Passport expiry</dt>
            <dd>{athlete.passport_expiry ?? "Missing"}</dd>
          </dl>
        ) : (
          <p className="muted">Loading profile...</p>
        )}
      </section>
    </>
  );
}

function PlayerCampaignPage() {
  const { campaignId } = useParams();
  return (
    <>
      <PageHead title="Campaign Readiness" subtitle="Campaign-specific player checklist." />
      <section className="card">
        <p>Player campaign route ready for campaign {campaignId}.</p>
      </section>
    </>
  );
}

function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    void api.getAdminStats().then(setStats);
  }, []);

  const items = [
    ["Total athletes", stats?.totalAthletes ?? 0],
    ["Active campaigns", stats?.activeCampaigns ?? 0],
    ["Incomplete profiles", stats?.incompleteProfiles ?? 0],
    ["Passport expiring soon", stats?.passportExpiringSoon ?? 0],
    ["Pending evaluations", stats?.pendingEvaluations ?? 0],
    ["Pending review items", stats?.pendingReviewItems ?? 0],
  ] as const;

  return (
    <>
      <PageHead title="Admin Dashboard" subtitle="Operational overview for campaign readiness." />
      <div className="grid cols-3">
        {items.map(([label, value]) => (
          <section className="card stat" key={label}>
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
          </section>
        ))}
      </div>
      <section className="card stack">
        <h2>Assistant</h2>
        <p className="note-box">
          Who is incomplete? Start with the players table and campaign readiness view.
        </p>
      </section>
    </>
  );
}

function AdminPlayersPage() {
  const [athletes, setAthletes] = useState<Athlete[]>([]);

  useEffect(() => {
    void api.listAthletes().then(setAthletes);
  }, []);

  return (
    <>
      <PageHead title="Players" subtitle="Athlete database with readiness signals." />
      <section className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Profile</th>
              <th>Missing</th>
              <th>Passport</th>
              <th>Consent</th>
            </tr>
          </thead>
          <tbody>
            {athletes.map((athlete) => {
              const missing = getMissingAthleteFields(athlete);
              const passport = getPassportStatus(athlete.passport_expiry);
              return (
                <tr key={athlete.id}>
                  <td>{athlete.preferred_name || athlete.legal_name || "Unknown athlete"}</td>
                  <td>{athlete.profile_status}</td>
                  <td>{missing.length}</td>
                  <td>{passportStatusLabel(passport)}</td>
                  <td>{athlete.data_sharing_consent ? "Yes" : "No"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}

function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    void api.listCampaigns().then(setCampaigns);
  }, []);

  return (
    <>
      <PageHead title="Campaigns" subtitle="Campaign list and creation workspace." />
      <section className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Team</th>
              <th>Location</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign.id}>
                <td>
                  <Link to={`/admin/campaigns/${campaign.id}`}>{campaign.name}</Link>
                </td>
                <td>{campaign.team ?? "Unassigned"}</td>
                <td>{campaign.location ?? "TBC"}</td>
                <td>{campaign.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function AdminCampaignDetailPage() {
  const { campaignId = "" } = useParams();
  const { profile } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [rows, setRows] = useState<CampaignReadinessEntry[]>([]);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([api.getCampaign(campaignId), api.getCampaignReadiness(campaignId)]).then(
      ([nextCampaign, nextRows]) => {
        setCampaign(nextCampaign);
        setRows(nextRows);
      },
    );
  }, [campaignId]);

  async function handleDraftReminder(row: CampaignReadinessEntry) {
    if (!profile) {
      return;
    }
    const content = draftPlayerReminder({
      playerName: row.name,
      missingFields: row.missingFields,
      campaignName: campaign?.name,
    });
    await api.createAssistantDraft({
      createdBy: profile.id,
      draftType: "player_reminder",
      campaignId,
      content,
    });
    setDraft(content);
  }

  return (
    <>
      <PageHead
        title={campaign?.name ?? "Campaign"}
        subtitle={
          campaign
            ? `${campaign.team ?? "Team"} - ${campaign.location ?? "Location TBC"}`
            : "Campaign readiness"
        }
      />
      <section className="card stack">
        <h2>Readiness summary</h2>
        <p>{summarizeCampaignReadiness(rows)}</p>
      </section>
      <section className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Player</th>
              <th>Missing</th>
              <th>Passport</th>
              <th>Evaluation</th>
              <th>Draft</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.athleteId}>
                <td>{row.name}</td>
                <td>{row.missingFields.length}</td>
                <td>{passportStatusLabel(row.passportStatus)}</td>
                <td>{row.evaluationStatus ?? "pending"}</td>
                <td>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => void handleDraftReminder(row)}
                    disabled={row.missingFields.length === 0}
                  >
                    Draft reminder
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {draft ? (
        <section className="card stack">
          <h2>Latest reminder draft</h2>
          <pre className="note-box">{draft}</pre>
        </section>
      ) : null}
    </>
  );
}

function AdminReviewPage() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<ChangeRequestView[]>([]);

  async function load() {
    setRequests(await api.listChangeRequests());
  }

  useEffect(() => {
    void load();
  }, []);

  async function review(id: string, decision: "approved" | "rejected") {
    if (!profile) {
      return;
    }
    await api.reviewChangeRequest(id, decision, profile.id);
    await load();
  }

  return (
    <>
      <PageHead title="Review Queue" subtitle="Player-submitted profile changes." />
      <section className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Athlete</th>
              <th>Field</th>
              <th>Old</th>
              <th>New</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td>{request.athleteName}</td>
                <td>{request.fieldName}</td>
                <td>{request.oldValue ?? "-"}</td>
                <td>{request.newValue ?? "-"}</td>
                <td>{request.status}</td>
                <td>
                  <div className="btn-row">
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => void review(request.id, "approved")}
                      disabled={request.status !== "pending"}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => void review(request.id, "rejected")}
                      disabled={request.status !== "pending"}
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function AdminExportsPage() {
  return (
    <>
      <PageHead title="Exports" subtitle="CSV export workspace." />
      <section className="card stack">
        <h2>Available exports</h2>
        <ul>
          <li>All athletes</li>
          <li>Campaign players</li>
          <li>Campaign readiness</li>
          <li>Coach evaluation summary</li>
        </ul>
      </section>
    </>
  );
}

function CoachDashboard() {
  const { profile } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [evaluations, setEvaluations] = useState<CoachEvaluation[]>([]);

  useEffect(() => {
    if (!profile) {
      return;
    }
    void Promise.all([
      api.getCoachCampaigns(profile.id),
      api.listCoachEvaluations(profile.id),
    ]).then(([nextCampaigns, nextEvaluations]) => {
      setCampaigns(nextCampaigns);
      setEvaluations(nextEvaluations);
    });
  }, [profile]);

  return (
    <>
      <PageHead title="Coach Dashboard" subtitle="Assigned campaigns and evaluation progress." />
      <div className="grid cols-2">
        <section className="card stat">
          <div className="stat-value">{campaigns.length}</div>
          <div className="stat-label">Assigned campaigns</div>
        </section>
        <section className="card stat">
          <div className="stat-value">{evaluations.filter((e) => e.status === "draft").length}</div>
          <div className="stat-label">Draft evaluations</div>
        </section>
      </div>
      <section className="card stack">
        <h2>Campaigns</h2>
        {campaigns.map((campaign) => (
          <Link key={campaign.id} className="btn" to={`/coach/campaigns/${campaign.id}`}>
            {campaign.name}
          </Link>
        ))}
      </section>
    </>
  );
}

function CoachCampaignPage() {
  const { campaignId = "" } = useParams();
  const [athletes, setAthletes] = useState<CoachAthleteView[]>([]);

  useEffect(() => {
    void api.getCoachAthletes(campaignId).then(setAthletes);
  }, [campaignId]);

  return (
    <>
      <PageHead title="Assigned Players" subtitle="Coach-safe player list for this campaign." />
      <section className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Player</th>
              <th>Phone</th>
              <th>Profile</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {athletes.map((athlete) => (
              <tr key={athlete.id}>
                <td>{athlete.preferred_name || athlete.legal_name || "Unknown athlete"}</td>
                <td>{athlete.phone ?? "-"}</td>
                <td>{athlete.profile_status}</td>
                <td>
                  <Link className="btn sm" to={`/coach/evaluations/${campaignId}/${athlete.id}`}>
                    Evaluate
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function CoachEvaluationPage() {
  const { campaignId, playerId } = useParams();
  return (
    <>
      <PageHead title="Evaluation" subtitle="Structured coach evaluation form comes next." />
      <section className="card">
        <p>
          Evaluation route ready for campaign {campaignId} and athlete {playerId}.
        </p>
      </section>
    </>
  );
}

function NotFoundPage() {
  return (
    <section className="card">
      <h1>Page not found</h1>
      <p className="muted">Return to the SUFA CRM dashboard.</p>
      <Link className="btn" to="/">
        Go home
      </Link>
    </section>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/" element={<RootRedirect />} />
      <Route element={<RequireRole role="player" />}>
        <Route element={<AppLayout />}>
          <Route path="/player" element={<PlayerDashboard />} />
          <Route path="/player/profile" element={<PlayerProfilePage />} />
          <Route path="/player/campaigns/:campaignId" element={<PlayerCampaignPage />} />
        </Route>
      </Route>
      <Route element={<RequireRole role="admin" />}>
        <Route element={<AppLayout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/players" element={<AdminPlayersPage />} />
          <Route path="/admin/campaigns" element={<AdminCampaignsPage />} />
          <Route path="/admin/campaigns/:campaignId" element={<AdminCampaignDetailPage />} />
          <Route path="/admin/review" element={<AdminReviewPage />} />
          <Route path="/admin/exports" element={<AdminExportsPage />} />
        </Route>
      </Route>
      <Route element={<RequireRole role="coach" />}>
        <Route element={<AppLayout />}>
          <Route path="/coach" element={<CoachDashboard />} />
          <Route path="/coach/campaigns/:campaignId" element={<CoachCampaignPage />} />
          <Route
            path="/coach/evaluations/:campaignId/:playerId"
            element={<CoachEvaluationPage />}
          />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

const defaultTestEntries = ["/"];

export function TestApp({ initialEntries = defaultTestEntries }: { initialEntries?: string[] }) {
  return (
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
