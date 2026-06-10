import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
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
  AthletePatch,
  CampaignReadinessEntry,
  CampaignWithMembership,
  ChangeRequestView,
} from "./data/types";
import {
  draftPlayerReminder,
  structureCoachNotes,
  summarizeCampaignReadiness,
} from "./lib/assistant";
import { getPassportStatus, passportStatusLabel } from "./lib/passport";
import { getProfileCompletion, getMissingAthleteFields } from "./lib/profile";
import { getRoleHome } from "./lib/roles";
import type {
  Athlete,
  AssistantDraft,
  Campaign,
  CoachAthleteView,
  CoachEvaluation,
  Recommendation,
  Role,
} from "./types/database";

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
  const [form, setForm] = useState<PlayerProfileFormState>(emptyPlayerProfileForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      void api.getAthleteForProfile(profile.id).then((nextAthlete) => {
        setAthlete(nextAthlete);
        if (nextAthlete) {
          setForm(playerProfileFormFromAthlete(nextAthlete));
        }
      });
    }
  }, [profile]);

  function updateField(field: keyof PlayerProfileFormState, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) {
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const updated = await api.updateOwnAthlete(profile.id, playerProfilePatchFromForm(form));
      setAthlete(updated);
      setForm(playerProfileFormFromAthlete(updated));
      setMessage("Profile saved. Your updates are recorded for admin review.");
    } catch {
      setError("We could not save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const missing = athlete ? getMissingAthleteFields(athlete) : [];
  const completion = athlete ? getProfileCompletion(athlete) : 0;

  if (!athlete) {
    return (
      <>
        <PageHead title="Player Profile" subtitle="Keep your SUFA athlete record current." />
        <section className="card">
          <p className="muted">Loading profile...</p>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHead title="Player Profile" subtitle="Keep your SUFA athlete record current." />
      <section className="card stack">
        <div className="section-title">
          <h2>Completion</h2>
          <Badge tone={completion === 100 ? "ok" : "warn"}>{completion}%</Badge>
        </div>
        <div className="progress" aria-label={`Profile completion ${completion}%`}>
          <span style={{ width: `${completion}%` }} />
        </div>
        {missing.length > 0 ? (
          <p className="muted">Still missing: {missing.map((field) => field.label).join(", ")}.</p>
        ) : (
          <p>Your required profile details are complete.</p>
        )}
      </section>
      <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
        <section className="card">
          <h2>Basic details</h2>
          <div className="grid cols-2">
            <TextField
              label="Legal name"
              value={form.legal_name}
              onChange={(value) => updateField("legal_name", value)}
              required
            />
            <TextField
              label="Preferred name"
              value={form.preferred_name}
              onChange={(value) => updateField("preferred_name", value)}
            />
            <TextField
              label="Date of birth"
              type="date"
              value={form.date_of_birth}
              onChange={(value) => updateField("date_of_birth", value)}
              required
            />
          </div>
        </section>
        <section className="card">
          <h2>Contact details</h2>
          <div className="grid cols-2">
            <TextField
              label="Phone number"
              value={form.phone}
              onChange={(value) => updateField("phone", value)}
              required
            />
            <TextField
              label="Telegram handle"
              value={form.telegram_handle}
              onChange={(value) => updateField("telegram_handle", value)}
              placeholder="@username"
            />
          </div>
        </section>
        <section className="card">
          <h2>Emergency contact</h2>
          <div className="grid cols-2">
            <TextField
              label="Emergency contact name"
              value={form.emergency_contact_name}
              onChange={(value) => updateField("emergency_contact_name", value)}
              required
            />
            <TextField
              label="Emergency contact phone"
              value={form.emergency_contact_phone}
              onChange={(value) => updateField("emergency_contact_phone", value)}
              required
            />
          </div>
        </section>
        <section className="card">
          <h2>Travel readiness</h2>
          <div className="grid cols-2">
            <TextField
              label="Passport expiry"
              type="date"
              value={form.passport_expiry}
              onChange={(value) => updateField("passport_expiry", value)}
              required
            />
          </div>
        </section>
        <section className="card">
          <h2>Consent</h2>
          <div className="stack">
            <CheckboxField
              label="I consent to SUFA using my profile data for campaign administration."
              checked={form.data_sharing_consent}
              onChange={(value) => updateField("data_sharing_consent", value)}
            />
            <CheckboxField
              label="I consent to SUFA using photos or media from team activities."
              checked={form.media_consent}
              onChange={(value) => updateField("media_consent", value)}
            />
          </div>
        </section>
        <div className="btn-row">
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Saving..." : "Save profile"}
          </button>
          <Link className="btn" to="/player">
            Back to dashboard
          </Link>
        </div>
        {message ? <p className="alert ok">{message}</p> : null}
        {error ? <p className="alert danger">{error}</p> : null}
      </form>
    </>
  );
}

interface PlayerProfileFormState {
  legal_name: string;
  preferred_name: string;
  date_of_birth: string;
  phone: string;
  telegram_handle: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  passport_expiry: string;
  data_sharing_consent: boolean;
  media_consent: boolean;
}

const emptyPlayerProfileForm: PlayerProfileFormState = {
  legal_name: "",
  preferred_name: "",
  date_of_birth: "",
  phone: "",
  telegram_handle: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  passport_expiry: "",
  data_sharing_consent: false,
  media_consent: false,
};

function playerProfileFormFromAthlete(athlete: Athlete): PlayerProfileFormState {
  return {
    legal_name: athlete.legal_name ?? "",
    preferred_name: athlete.preferred_name ?? "",
    date_of_birth: athlete.date_of_birth ?? "",
    phone: athlete.phone ?? "",
    telegram_handle: athlete.telegram_handle ?? "",
    emergency_contact_name: athlete.emergency_contact_name ?? "",
    emergency_contact_phone: athlete.emergency_contact_phone ?? "",
    passport_expiry: athlete.passport_expiry ?? "",
    data_sharing_consent: athlete.data_sharing_consent,
    media_consent: athlete.media_consent,
  };
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function playerProfilePatchFromForm(form: PlayerProfileFormState): AthletePatch {
  return {
    legal_name: optionalText(form.legal_name),
    preferred_name: optionalText(form.preferred_name),
    date_of_birth: optionalText(form.date_of_birth),
    phone: optionalText(form.phone),
    telegram_handle: optionalText(form.telegram_handle),
    emergency_contact_name: optionalText(form.emergency_contact_name),
    emergency_contact_phone: optionalText(form.emergency_contact_phone),
    passport_expiry: optionalText(form.passport_expiry),
    data_sharing_consent: form.data_sharing_consent,
    media_consent: form.media_consent,
  };
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: "date" | "email" | "tel" | "text";
}) {
  const id = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = label
    .toLowerCase()
    .slice(0, 48)
    .replace(/[^a-z0-9]+/g, "-");
  return (
    <label className="field-row" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
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
  const [drafts, setDrafts] = useState<AssistantDraft[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [assistantResponse, setAssistantResponse] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([api.getCampaign(campaignId), api.getCampaignReadiness(campaignId)]).then(
      ([nextCampaign, nextRows]) => {
        setCampaign(nextCampaign);
        setRows(nextRows);
      },
    );
  }, [campaignId]);

  useEffect(() => {
    if (!profile) {
      return;
    }
    void api.listAssistantDrafts(profile.id).then((nextDrafts) => {
      setDrafts(nextDrafts.filter((draft) => draft.campaign_id === campaignId));
    });
  }, [campaignId, profile]);

  const incompleteRows = rows.filter((row) => row.missingFields.length > 0);
  const passportAttention = rows.filter(
    (row) => row.passportStatus === "expired" || row.passportStatus === "expiring_soon",
  );
  const pendingEvaluations = rows.filter((row) => row.evaluationStatus !== "submitted");

  function handleWhoIsIncomplete() {
    setAssistantResponse(buildIncompletePlayersAnswer(rows));
  }

  function handleSportSyncReadiness() {
    setAssistantResponse(buildSportSyncReadinessAnswer(rows));
  }

  async function createReminderDraft(row: CampaignReadinessEntry): Promise<AssistantDraft | null> {
    if (!profile) {
      return null;
    }
    const content = draftPlayerReminder({
      playerName: row.name,
      missingFields: row.missingFields,
      campaignName: campaign?.name,
    });
    return api.createAssistantDraft({
      createdBy: profile.id,
      draftType: "player_reminder",
      campaignId,
      content,
    });
  }

  async function handleDraftReminder(row: CampaignReadinessEntry) {
    if (row.missingFields.length === 0) {
      return;
    }
    setDrafting(true);
    setMessage(null);
    const draft = await createReminderDraft(row);
    if (draft) {
      setDrafts((current) => [draft, ...current]);
      setMessage("Reminder draft created for review. Nothing has been sent.");
      setAssistantResponse(
        `I drafted a reminder for ${row.name}. It is saved for admin review and has not been sent.`,
      );
    }
    setDrafting(false);
  }

  async function handleDraftAllReminders() {
    setDrafting(true);
    setMessage(null);
    const created = await Promise.all(incompleteRows.map((row) => createReminderDraft(row)));
    const validDrafts = created.filter((draft): draft is AssistantDraft => draft !== null);
    setDrafts((current) => [...validDrafts, ...current]);
    setMessage(
      validDrafts.length > 0
        ? `${validDrafts.length} reminder ${
            validDrafts.length === 1 ? "draft" : "drafts"
          } created for review. Nothing has been sent.`
        : "No incomplete players need reminders right now.",
    );
    setAssistantResponse(
      validDrafts.length > 0
        ? `I created ${validDrafts.length} reminder ${
            validDrafts.length === 1 ? "draft" : "drafts"
          } from the campaign readiness data. Nothing has been sent.`
        : "No incomplete players need reminders right now.",
    );
    setDrafting(false);
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
        <div className="section-title">
          <h2>Readiness summary</h2>
          <Badge tone={incompleteRows.length === 0 ? "ok" : "warn"}>
            {rows.length - incompleteRows.length}/{rows.length || 0} ready
          </Badge>
        </div>
        <p>{summarizeCampaignReadiness(rows)}</p>
        <div className="grid cols-4">
          <div className="stat">
            <div className="stat-value">{rows.length}</div>
            <div className="stat-label">Players</div>
          </div>
          <div className="stat">
            <div className="stat-value">{incompleteRows.length}</div>
            <div className="stat-label">Need profile info</div>
          </div>
          <div className="stat">
            <div className="stat-value">{passportAttention.length}</div>
            <div className="stat-label">Passport attention</div>
          </div>
          <div className="stat">
            <div className="stat-value">{pendingEvaluations.length}</div>
            <div className="stat-label">Evaluations pending</div>
          </div>
        </div>
        {message ? <p className="alert ok">{message}</p> : null}
      </section>
      <section className="card stack">
        <div className="section-title">
          <h2>Assistant</h2>
          <Badge>guided</Badge>
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={handleWhoIsIncomplete}>
            Who is incomplete?
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void handleDraftAllReminders()}
            disabled={drafting || incompleteRows.length === 0}
          >
            {drafting ? "Drafting..." : `Draft reminders (${incompleteRows.length})`}
          </button>
          <button type="button" className="btn" onClick={handleSportSyncReadiness}>
            Are we SportSync-ready?
          </button>
        </div>
        {assistantResponse ? <pre className="note-box">{assistantResponse}</pre> : null}
        <p className="muted">Assistant answers use CRM data already visible to this admin.</p>
      </section>
      <section className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Player</th>
              <th>Missing</th>
              <th>Passport</th>
              <th>Profile</th>
              <th>Evaluation</th>
              <th>Draft</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.athleteId}>
                <td>{row.name}</td>
                <td>
                  {row.missingFields.length > 0
                    ? row.missingFields.map((field) => field.label).join(", ")
                    : "Complete"}
                </td>
                <td>{passportStatusLabel(row.passportStatus)}</td>
                <td>{row.profileStatus}</td>
                <td>{row.evaluationStatus ?? "pending"}</td>
                <td>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => void handleDraftReminder(row)}
                    disabled={drafting || row.missingFields.length === 0}
                  >
                    Draft reminder
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {drafts.length > 0 ? (
        <section className="card stack">
          <div className="section-title">
            <h2>Reminder draft preview</h2>
            <Badge>{drafts.length} draft</Badge>
          </div>
          <p className="muted">
            These drafts are not sent. Admins can review, copy, edit, or discard them.
          </p>
          {drafts.map((draft) => (
            <pre className="note-box" key={draft.id}>
              {draft.content}
            </pre>
          ))}
        </section>
      ) : null}
    </>
  );
}

function buildIncompletePlayersAnswer(rows: readonly CampaignReadinessEntry[]): string {
  const incomplete = rows.filter((row) => row.missingFields.length > 0);
  const passportAttention = rows.filter(
    (row) => row.passportStatus === "expired" || row.passportStatus === "expiring_soon",
  );

  const lines: string[] = [];
  if (incomplete.length === 0) {
    lines.push("All campaign players have the required profile fields.");
  } else {
    lines.push(
      `${incomplete.length} ${incomplete.length === 1 ? "player is" : "players are"} missing required profile details:`,
    );
    for (const row of incomplete) {
      lines.push(`- ${row.name}: ${row.missingFields.map((field) => field.label).join(", ")}`);
    }
  }

  if (passportAttention.length > 0) {
    lines.push("", "Passport attention:");
    for (const row of passportAttention) {
      lines.push(`- ${row.name}: ${passportStatusLabel(row.passportStatus)}`);
    }
  }

  return lines.join("\n");
}

function buildSportSyncReadinessAnswer(rows: readonly CampaignReadinessEntry[]): string {
  if (rows.length === 0) {
    return "No campaign players are available to export yet.";
  }

  const incomplete = rows.filter((row) => row.missingFields.length > 0);
  const passportAttention = rows.filter(
    (row) => row.passportStatus === "expired" || row.passportStatus === "expiring_soon",
  );
  const pendingEvaluations = rows.filter((row) => row.evaluationStatus !== "submitted");
  const ready = rows.length - incomplete.length;

  return [
    `${ready} of ${rows.length} players are profile-ready for export.`,
    `${incomplete.length} ${incomplete.length === 1 ? "player is" : "players are"} missing required profile fields.`,
    `${passportAttention.length} ${
      passportAttention.length === 1 ? "player needs" : "players need"
    } passport attention.`,
    `${pendingEvaluations.length} coach ${
      pendingEvaluations.length === 1 ? "evaluation is" : "evaluations are"
    } still pending.`,
    "SportSync export can be drafted, but review the flagged rows before using it.",
  ].join(" ");
}

function AdminReviewPage() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<ChangeRequestView[]>([]);
  const [assistantResponse, setAssistantResponse] = useState<string | null>(null);

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
      <section className="card stack">
        <div className="section-title">
          <h2>Assistant</h2>
          <Badge>triage</Badge>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={() => setAssistantResponse(summarizeReviewQueue(requests))}
          >
            Summarize queue
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setAssistantResponse(reviewRiskReport(requests))}
          >
            Review risk
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => setAssistantResponse(suggestReviewDecisions(requests))}
          >
            Suggest decisions
          </button>
        </div>
        {assistantResponse ? <pre className="note-box">{assistantResponse}</pre> : null}
        <p className="muted">Assistant suggestions do not approve or reject changes.</p>
      </section>
      <section className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Athlete</th>
              <th>Field</th>
              <th>Risk</th>
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
                <td>
                  <Badge tone={reviewRiskTone(classifyReviewRisk(request.fieldName))}>
                    {classifyReviewRisk(request.fieldName)}
                  </Badge>
                </td>
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

type ReviewRisk = "high" | "low" | "medium";

const lowRiskReviewFields = new Set([
  "preferred_name",
  "phone",
  "telegram_handle",
  "media_consent",
]);
const mediumRiskReviewFields = new Set(["emergency_contact_name", "emergency_contact_phone"]);
const highRiskReviewFields = new Set([
  "legal_name",
  "date_of_birth",
  "passport_expiry",
  "data_sharing_consent",
]);

function classifyReviewRisk(fieldName: string): ReviewRisk {
  if (highRiskReviewFields.has(fieldName)) {
    return "high";
  }
  if (mediumRiskReviewFields.has(fieldName)) {
    return "medium";
  }
  if (lowRiskReviewFields.has(fieldName)) {
    return "low";
  }
  return "medium";
}

function reviewRiskTone(risk: ReviewRisk): "danger" | "ok" | "warn" {
  if (risk === "high") {
    return "danger";
  }
  if (risk === "medium") {
    return "warn";
  }
  return "ok";
}

function pendingReviewRequests(requests: readonly ChangeRequestView[]): ChangeRequestView[] {
  return requests.filter((request) => request.status === "pending");
}

function summarizeReviewQueue(requests: readonly ChangeRequestView[]): string {
  const pending = pendingReviewRequests(requests);
  if (pending.length === 0) {
    return "No pending profile changes need admin review.";
  }
  const high = pending.filter((request) => classifyReviewRisk(request.fieldName) === "high").length;
  const medium = pending.filter(
    (request) => classifyReviewRisk(request.fieldName) === "medium",
  ).length;
  const low = pending.filter((request) => classifyReviewRisk(request.fieldName) === "low").length;
  return `${pending.length} pending ${pending.length === 1 ? "change needs" : "changes need"} review: ${high} high risk, ${medium} medium risk, ${low} low risk.`;
}

function reviewRiskReport(requests: readonly ChangeRequestView[]): string {
  const pending = pendingReviewRequests(requests);
  if (pending.length === 0) {
    return "No pending changes to risk-review.";
  }
  return pending
    .map((request) => {
      const risk = classifyReviewRisk(request.fieldName);
      const reason =
        risk === "high"
          ? "affects identity, travel readiness, or consent"
          : risk === "medium"
            ? "affects emergency contact reliability"
            : "is a routine contact/profile update";
      return `- ${request.athleteName}: ${request.fieldName} is ${risk} risk because it ${reason}.`;
    })
    .join("\n");
}

function suggestReviewDecisions(requests: readonly ChangeRequestView[]): string {
  const pending = pendingReviewRequests(requests);
  if (pending.length === 0) {
    return "No pending changes need suggested decisions.";
  }
  return pending
    .map((request) => {
      const risk = classifyReviewRisk(request.fieldName);
      const suggestion =
        risk === "high"
          ? "verify supporting context before approving"
          : risk === "medium"
            ? "approve if the new contact detail is plausible"
            : "approve if the value looks current";
      return `- ${request.athleteName}: ${request.fieldName} changed from "${request.oldValue ?? "-"}" to "${request.newValue ?? "-"}". Recommendation: ${suggestion}.`;
    })
    .join("\n");
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
  const { campaignId = "", playerId = "" } = useParams();
  const { profile } = useAuth();
  const [athlete, setAthlete] = useState<CoachAthleteView | null>(null);
  const [form, setForm] = useState<EvaluationFormState>(emptyEvaluationForm);
  const [roughNotes, setRoughNotes] = useState("");
  const [evaluationId, setEvaluationId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const structuredSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!profile) {
      return;
    }
    void Promise.all([
      api.getCoachAthletes(campaignId),
      api.getEvaluation(campaignId, playerId, profile.id),
    ]).then(([athletes, evaluation]) => {
      setAthlete(athletes.find((row) => row.id === playerId) ?? null);
      if (evaluation) {
        setEvaluationId(evaluation.id);
        setForm(evaluationFormFromRow(evaluation));
      }
    });
  }, [campaignId, playerId, profile]);

  function updateField(field: keyof EvaluationFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleStructureNotes() {
    const draft = structureCoachNotes(roughNotes);
    setForm((current) => ({
      ...current,
      strengths: draft.strengths || current.strengths,
      development_areas: draft.developmentAreas || current.development_areas,
      overall_notes: draft.overallNotes || current.overall_notes,
      recommendation: draft.recommendation ?? current.recommendation,
    }));
    setMessage("Notes structured into a draft. Review before saving.");
    window.requestAnimationFrame(() => {
      const section = structuredSectionRef.current;
      if (typeof section?.scrollIntoView === "function") {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      section?.focus();
    });
  }

  async function save(status: "draft" | "submitted") {
    if (!profile) {
      return;
    }
    setSaving(true);
    setMessage(null);
    const saved = await api.saveEvaluation({
      id: evaluationId,
      campaignId,
      athleteId: playerId,
      coachProfileId: profile.id,
      throwing_rating: ratingValue(form.throwing_rating),
      cutting_rating: ratingValue(form.cutting_rating),
      defense_rating: ratingValue(form.defense_rating),
      fitness_rating: ratingValue(form.fitness_rating),
      game_iq_rating: ratingValue(form.game_iq_rating),
      communication_rating: ratingValue(form.communication_rating),
      coachability_rating: ratingValue(form.coachability_rating),
      strengths: optionalText(form.strengths),
      development_areas: optionalText(form.development_areas),
      overall_notes: optionalText(form.overall_notes),
      recommendation: form.recommendation || null,
      status,
    });
    setEvaluationId(saved.id);
    setForm(evaluationFormFromRow(saved));
    setMessage(status === "submitted" ? "Evaluation submitted." : "Evaluation draft saved.");
    setSaving(false);
  }

  const athleteName = athlete?.preferred_name || athlete?.legal_name || "Assigned player";

  return (
    <>
      <PageHead title="Evaluation" subtitle="Structure coach notes before saving." />
      <section className="card stack">
        <div className="section-title">
          <h2>{athleteName}</h2>
          <Badge>{form.status}</Badge>
        </div>
        <div className="grid cols-3">
          <div className="stat">
            <div className="stat-label">Phone</div>
            <div>{athlete?.phone ?? "-"}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Profile</div>
            <div>{athlete?.profile_status ?? "-"}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Campaign</div>
            <div>{campaignId}</div>
          </div>
        </div>
      </section>
      <section className="card stack">
        <div className="section-title">
          <h2>Assistant</h2>
          <Badge>draft only</Badge>
        </div>
        <div className="field">
          <label htmlFor="rough-notes">Paste rough notes</label>
          <textarea
            id="rough-notes"
            value={roughNotes}
            onChange={(event) => setRoughNotes(event.target.value)}
            placeholder="Strong hucks. Needs to work on reset defense. Reliable starter..."
          />
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={handleStructureNotes}
          disabled={roughNotes.trim().length === 0}
        >
          Structure notes
        </button>
        <p className="muted">
          The assistant fills draft fields only. The coach must review and save.
        </p>
      </section>
      <section className="card stack">
        <h2>Ratings</h2>
        <div className="grid cols-4">
          <RatingField
            label="Throwing rating"
            value={form.throwing_rating}
            onChange={(value) => updateField("throwing_rating", value)}
          />
          <RatingField
            label="Cutting rating"
            value={form.cutting_rating}
            onChange={(value) => updateField("cutting_rating", value)}
          />
          <RatingField
            label="Defense rating"
            value={form.defense_rating}
            onChange={(value) => updateField("defense_rating", value)}
          />
          <RatingField
            label="Fitness rating"
            value={form.fitness_rating}
            onChange={(value) => updateField("fitness_rating", value)}
          />
          <RatingField
            label="Game IQ rating"
            value={form.game_iq_rating}
            onChange={(value) => updateField("game_iq_rating", value)}
          />
          <RatingField
            label="Communication rating"
            value={form.communication_rating}
            onChange={(value) => updateField("communication_rating", value)}
          />
          <RatingField
            label="Coachability rating"
            value={form.coachability_rating}
            onChange={(value) => updateField("coachability_rating", value)}
          />
        </div>
      </section>
      <section className="card stack" ref={structuredSectionRef} tabIndex={-1}>
        <div className="section-title">
          <h2>Structured evaluation</h2>
          {message === "Notes structured into a draft. Review before saving." ? (
            <Badge tone="ok">updated</Badge>
          ) : null}
        </div>
        {message === "Notes structured into a draft. Review before saving." ? (
          <p className="alert ok">{message}</p>
        ) : null}
        <TextAreaField
          label="Strengths"
          value={form.strengths}
          onChange={(value) => updateField("strengths", value)}
        />
        <TextAreaField
          label="Development areas"
          value={form.development_areas}
          onChange={(value) => updateField("development_areas", value)}
        />
        <TextAreaField
          label="Overall notes"
          value={form.overall_notes}
          onChange={(value) => updateField("overall_notes", value)}
        />
        <div className="field">
          <label htmlFor="recommendation">Recommendation</label>
          <select
            id="recommendation"
            value={form.recommendation}
            onChange={(event) => updateField("recommendation", event.target.value)}
          >
            <option value="">Needs review</option>
            <option value="selected">Selected</option>
            <option value="reserve">Reserve</option>
            <option value="development">Development</option>
            <option value="not_selected">Not selected</option>
            <option value="needs_review">Needs review</option>
          </select>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={() => void save("draft")}
            disabled={saving}
          >
            Save draft
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void save("submitted")}
            disabled={saving}
          >
            Submit evaluation
          </button>
        </div>
        {message && message !== "Notes structured into a draft. Review before saving." ? (
          <p className="alert ok">{message}</p>
        ) : null}
      </section>
    </>
  );
}

interface EvaluationFormState {
  throwing_rating: string;
  cutting_rating: string;
  defense_rating: string;
  fitness_rating: string;
  game_iq_rating: string;
  communication_rating: string;
  coachability_rating: string;
  strengths: string;
  development_areas: string;
  overall_notes: string;
  recommendation: "" | Recommendation;
  status: "draft" | "submitted";
}

const emptyEvaluationForm: EvaluationFormState = {
  throwing_rating: "",
  cutting_rating: "",
  defense_rating: "",
  fitness_rating: "",
  game_iq_rating: "",
  communication_rating: "",
  coachability_rating: "",
  strengths: "",
  development_areas: "",
  overall_notes: "",
  recommendation: "",
  status: "draft",
};

function evaluationFormFromRow(row: CoachEvaluation): EvaluationFormState {
  return {
    throwing_rating: row.throwing_rating ? String(row.throwing_rating) : "",
    cutting_rating: row.cutting_rating ? String(row.cutting_rating) : "",
    defense_rating: row.defense_rating ? String(row.defense_rating) : "",
    fitness_rating: row.fitness_rating ? String(row.fitness_rating) : "",
    game_iq_rating: row.game_iq_rating ? String(row.game_iq_rating) : "",
    communication_rating: row.communication_rating ? String(row.communication_rating) : "",
    coachability_rating: row.coachability_rating ? String(row.coachability_rating) : "",
    strengths: row.strengths ?? "",
    development_areas: row.development_areas ?? "",
    overall_notes: row.overall_notes ?? "",
    recommendation: row.recommendation ?? "",
    status: row.status,
  };
}

function ratingValue(value: string): number | null {
  return value ? Number(value) : null;
}

function RatingField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Not rated</option>
        <option value="1">1</option>
        <option value="2">2</option>
        <option value="3">3</option>
        <option value="4">4</option>
        <option value="5">5</option>
      </select>
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
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
