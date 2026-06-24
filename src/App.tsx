import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
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
import heroImage from "./assets/hero.png";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { api } from "./data";
import { demoCoachLlm, enableCoachLlm, enablePlayerGrowthMatrix, useMockBackend } from "./lib/env";
import { demoCoachLlmConfigError } from "./lib/demoCoachLlmConfig";
import type {
  AdminStats,
  AthletePatch,
  CampaignReadinessEntry,
  CampaignWithMembership,
  ChangeRequestView,
  GrowthReviewWithDetails,
  PlayerCampaignFlow,
} from "./data/types";
import { draftPlayerReminder, summarizeCampaignReadiness } from "./lib/assistant";
import {
  buildAccumulatedInput,
  calculateCoachNoteEditMetrics,
  coachNoteDraftToFormText,
  createDeterministicCoachNoteDraft,
  COACH_NOTE_MAX_TURNS,
  suggestedAmbiguityOptions,
  validateCoachNoteDraft,
  type CoachNoteAction,
  type CoachNoteClarification,
  type CoachNoteDraftV1,
  type CoachNoteFeedback,
  type CoachNoteGenerationResult,
  type CoachNoteSection,
  type EvidenceItem,
} from "./lib/coachNotes";
import { getPassportStatus, passportStatusLabel } from "./lib/passport";
import { canShareGrowthReview, getQuadrantInfo } from "./lib/playerGrowth";
import { getProfileCompletion, getMissingAthleteFields } from "./lib/profile";
import { getRoleHome } from "./lib/roles";
import type {
  Athlete,
  AssistantDraft,
  Campaign,
  CampaignTryoutBriefing,
  CoachAthleteView,
  CoachEvaluation,
  PriorCoachEvaluation,
  Recommendation,
  Role,
} from "./types/database";

function DiscMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <ellipse
        cx="24"
        cy="24"
        rx="20"
        ry="9"
        transform="rotate(-18 24 24)"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="3"
      />
      <ellipse
        cx="24"
        cy="24"
        rx="11"
        ry="4.5"
        transform="rotate(-18 24 24)"
        stroke="currentColor"
        strokeWidth="2.5"
      />
    </svg>
  );
}

function LoadingPage() {
  return (
    <main className="loading-screen">
      <DiscMark className="loading-disc" />
      <p className="muted">Loading SUFA CRM...</p>
    </main>
  );
}

function PageHead({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
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

function StatCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: "accent" | "danger" | "neutral" | "ok" | "warn";
}) {
  return (
    <section className={`card stat stat-card ${tone}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {detail ? <p className="muted">{detail}</p> : null}
    </section>
  );
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

function DemoCoachLlmConfigBanner() {
  if (!demoCoachLlm || !demoCoachLlmConfigError) {
    return null;
  }
  return (
    <p className="alert warn demo-coach-config-banner" role="status">
      Demo coach LLM is misconfigured: {demoCoachLlmConfigError}
    </p>
  );
}

function AppLayout() {
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

const demoAccounts = [
  { email: "admin@sufa.test", label: "Admin" },
  { email: "coach@sufa.test", label: "Coach" },
  { email: "alice@sufa.test", label: "Player (Alice)" },
  { email: "derrick@sufa.test", label: "Player (Derrick)" },
] as const;

function LoginPage() {
  const { profile, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ tone: "ok" | "warn"; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (profile) {
    return <Navigate to={getRoleHome(profile.role)} replace />;
  }

  async function handleSignIn(targetEmail: string) {
    setSubmitting(true);
    setStatus(null);
    try {
      const result = await signIn(targetEmail);
      if (result.status === "signed_in") {
        navigate(getRoleHome(result.profile.role));
        return;
      }
      if (result.status === "unknown_email") {
        setStatus({ tone: "warn", message: "No SUFA CRM account was found for that email." });
        return;
      }
      setStatus({ tone: "ok", message: "Check your email for your login link." });
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleSignIn(email);
  }

  return (
    <div className="auth-screen">
      <aside className="auth-brand">
        <div className="auth-brand-inner">
          <p className="auth-wordmark">SUFA CRM</p>
          <h1>Every roster, tournament-ready.</h1>
          <p className="auth-sub">
            Player profiles, travel documents, and coach evaluations for Singapore Ultimate
            campaigns - from SEA Games to Worlds.
          </p>
          <div className="auth-visual" aria-hidden="true">
            <img src={heroImage} alt="" />
            <div className="auth-visual-panel top">
              <span>SEA Games 2026</span>
              <strong>2/3 profile-ready</strong>
            </div>
            <div className="auth-visual-panel bottom">
              <span>Coach notes</span>
              <strong>Structured for review</strong>
            </div>
          </div>
          <ul className="auth-points">
            <li>
              <span>Players</span> keep profiles and travel documents up to date.
            </li>
            <li>
              <span>Admins</span> track campaign readiness and review profile changes.
            </li>
            <li>
              <span>Coaches</span> turn rough notes into structured evaluations.
            </li>
          </ul>
        </div>
      </aside>
      <main className="auth-form-pane">
        <div className="auth-form-inner">
          <section className="card auth-card">
            <PageHead title="Sign in" subtitle="Use your SUFA email to request a magic link." />
            <DemoCoachLlmConfigBanner />
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@sufa.org.sg"
                  required
                />
              </div>
              <button type="submit" className="btn primary auth-submit" disabled={submitting}>
                {submitting ? "Sending..." : "Send magic link"}
              </button>
            </form>
            {status ? <p className={`alert ${status.tone}`}>{status.message}</p> : null}
            {useMockBackend ? (
              <div className="auth-demo">
                <p className="muted">Demo mode &mdash; sign in instantly as:</p>
                {demoCoachLlm ? (
                  <p className="muted">
                    Coach evaluations use the live LLM when you sign in as Coach.
                  </p>
                ) : null}
                <div className="btn-row">
                  {demoAccounts.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      className="btn sm"
                      disabled={submitting}
                      onClick={() => void handleSignIn(account.email)}
                    >
                      {account.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
          <p className="auth-footnote">SUFA &middot; Singapore Ultimate - internal demo</p>
        </div>
      </main>
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
    <main className="loading-screen">
      <DiscMark className="loading-disc" />
      <p className="muted">Completing sign in to SUFA CRM...</p>
    </main>
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
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "active");
  const submittedReviewCount = athlete?.profile_status === "submitted" ? 1 : 0;
  const blockerCount = missing.length;

  return (
    <>
      <PageHead
        title="Player Dashboard"
        subtitle="Your personal readiness checklist for national team campaigns."
        eyebrow="Player workspace"
        actions={
          <Link className="btn primary" to="/player/profile">
            Update profile
          </Link>
        }
      />
      <section className="card player-readiness stack">
        <div className="readiness-hero">
          <div>
            <p className="eyebrow">Your readiness</p>
            <h2>You're {completion}% ready</h2>
            <p className="muted">
              {blockerCount > 0
                ? `${blockerCount} ${blockerCount === 1 ? "item is" : "items are"} blocking campaign readiness.`
                : "Your required profile details are ready for campaign admin."}
            </p>
          </div>
          <Badge tone={completion === 100 ? "ok" : "warn"}>{completion}%</Badge>
        </div>
        <div className="progress" aria-label={`Profile completion ${completion}%`}>
          <span style={{ width: `${completion}%` }} />
        </div>
        <div className="readiness-metrics">
          <div className="readiness-metric">
            <strong>{blockerCount}</strong>
            <span>Blocking items</span>
          </div>
          <div className="readiness-metric">
            <strong>{submittedReviewCount}</strong>
            <span>Submitted changes awaiting review</span>
          </div>
          <div className="readiness-metric">
            <strong>{activeCampaigns.length}</strong>
            <span>Active campaign assignments</span>
          </div>
        </div>
      </section>
      <div className="grid cols-2 role-dashboard-grid">
        <section className="card stack checklist-panel">
          <div className="section-title">
            <h2>Personal checklist</h2>
            <Badge tone={missing.length === 0 ? "ok" : "warn"}>
              {missing.length === 0 ? "clear" : `${missing.length} left`}
            </Badge>
          </div>
          {athlete?.profile_status === "submitted" ? (
            <p className="alert warn">
              Your latest profile submission is waiting for admin review.
            </p>
          ) : null}
          {missing.length > 0 ? (
            <div className="checklist">
              {missing.map((field) => (
                <div className="checklist-item" key={field.field}>
                  <span aria-hidden="true" />
                  <div>
                    <strong>{field.label}</strong>
                    <p className="muted">{field.section}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="checklist-item complete">
              <span aria-hidden="true" />
              <div>
                <strong>Profile details complete</strong>
                <p className="muted">No required admin fields are missing right now.</p>
              </div>
            </div>
          )}
          <Link className="btn" to="/player/profile">
            {missing.length > 0 ? "Complete missing details" : "Review profile"}
          </Link>
        </section>
        <section className="card stack player-campaign-panel">
          <div className="section-title">
            <h2>Campaign readiness</h2>
            <Badge>{campaigns.length} assigned</Badge>
          </div>
          {campaigns.length > 0 ? (
            <div className="campaign-strip">
              {campaigns.map((campaign) => (
                <div className="campaign-strip-item" key={campaign.id}>
                  <div>
                    <strong>
                      {enablePlayerGrowthMatrix ? (
                        <Link to={`/player/campaigns/${campaign.id}`}>{campaign.name}</Link>
                      ) : (
                        campaign.name
                      )}
                    </strong>
                    <p className="muted">
                      {campaign.team ?? "Team TBC"} - {campaign.location ?? "Location TBC"}
                    </p>
                  </div>
                  <Badge tone={campaign.status === "active" ? "accent" : "ok"}>
                    {campaign.memberStatus}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No campaign assignments yet.</p>
          )}
          <div className="note-box">
            {missing.length > 0
              ? `Next best step: update ${missing[0]?.label.toLowerCase()} so admin can clear your readiness.`
              : "You're clear on required profile fields. Watch for campaign-specific requests from admin."}
          </div>
        </section>
      </div>
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
  const { campaignId = "" } = useParams();
  const { profile } = useAuth();
  const [flow, setFlow] = useState<PlayerCampaignFlow | null>(null);
  const [reply, setReply] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) {
      return;
    }
    setLoading(true);
    setFlow(await api.getPlayerCampaignFlow(profile.id, campaignId));
    setLoading(false);
  }, [campaignId, profile]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitReply(reviewId: string) {
    if (!profile || reply.trim().length === 0) {
      return;
    }
    await api.submitGrowthReply(reviewId, profile.id, reply);
    setReply("");
    setMessage("Reply submitted. Your placement is unchanged while the dispute is reviewed.");
    await load();
  }

  if (!enablePlayerGrowthMatrix) {
    return (
      <>
        <PageHead title="Campaign Readiness" subtitle="Campaign-specific player checklist." />
        <section className="card">
          <p className="muted">
            Player Growth Matrix is disabled for this deployment until the supporting database
            tables are provisioned.
          </p>
        </section>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <PageHead title="Campaign Readiness" subtitle="Campaign-specific player checklist." />
        <section className="card">
          <p className="muted">Loading campaign flow...</p>
        </section>
      </>
    );
  }

  if (!flow) {
    return (
      <>
        <PageHead title="Campaign Readiness" subtitle="Campaign-specific player checklist." />
        <section className="card">
          <p className="muted">This campaign is not assigned to your player profile.</p>
        </section>
      </>
    );
  }

  const latestReview = flow.reviews[0] ?? null;

  return (
    <>
      <PageHead
        title={flow.campaign.name}
        subtitle="Tryout transparency, matrix placement, and right-of-reply."
        eyebrow="Player campaign flow"
      />
      <div className="grid cols-2">
        <TryoutBriefingPanel briefing={flow.briefing} />
        <GrowthMatrixExplainer />
      </div>
      <section className="card stack growth-review-card">
        <div className="section-title">
          <h2>Latest quarterly placement</h2>
          <Badge tone={latestReview ? growthStatusTone(latestReview.status) : "warn"}>
            {latestReview?.status ?? "not shared"}
          </Badge>
        </div>
        {latestReview ? (
          <>
            <GrowthReviewSummary review={latestReview} />
            <div className="note-box">{latestReview.rationale}</div>
            <p className="muted">
              Signed by {latestReview.signoffs.length} coach
              {latestReview.signoffs.length === 1 ? "" : "es"}. Results are shared with you and
              available for admin welfare-board reporting.
            </p>
            {latestReview.replies.length > 0 ? (
              <div className="stack">
                <strong>Your replies</strong>
                {latestReview.replies.map((growthReply) => (
                  <p className="note-box" key={growthReply.id}>
                    {growthReply.body}
                  </p>
                ))}
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="growth-right-of-reply">Formal right-of-reply</label>
              <textarea
                id="growth-right-of-reply"
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="Add context if you dispute this placement..."
              />
              <p className="hint">
                Submitting a reply records a dispute for human review. It does not change the
                placement automatically.
              </p>
            </div>
            <button
              type="button"
              className="btn primary"
              disabled={reply.trim().length === 0}
              onClick={() => void submitReply(latestReview.id)}
            >
              Submit reply
            </button>
            {message ? <p className="alert ok">{message}</p> : null}
          </>
        ) : (
          <p className="muted">
            No matrix placement has been shared yet. Drafts and one-coach sign-offs are not visible
            to players.
          </p>
        )}
      </section>
    </>
  );
}

function TryoutBriefingPanel({ briefing }: { briefing: CampaignTryoutBriefing | null }) {
  if (!briefing) {
    return (
      <section className="card stack">
        <div className="section-title">
          <h2>Before tryouts</h2>
          <Badge tone="warn">unpublished</Badge>
        </div>
        <p className="muted">The org chart and schedule have not been published yet.</p>
      </section>
    );
  }
  const rows = [
    ["Head coach", briefing.head_coach],
    ["Selectors", briefing.selectors],
    ["Welfare committee", briefing.welfare_committee],
    ["Liaison", briefing.liaison],
    ["Training", briefing.training_schedule],
    ["Camps", briefing.camps_schedule],
    ["Competitions", briefing.competitions_schedule],
    ["Time commitment", briefing.time_commitment],
  ];
  return (
    <section className="card stack">
      <div className="section-title">
        <h2>Before tryouts</h2>
        <Badge tone="ok">published</Badge>
      </div>
      <div className="definition-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value || "TBC"}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function GrowthMatrixExplainer() {
  return (
    <section className="card stack">
      <div className="section-title">
        <h2>Growth Matrix</h2>
        <Badge>quarterly</Badge>
      </div>
      <div className="matrix-explainer">
        <div>
          <strong>X-axis: current skill</strong>
          <p className="muted">Physical output, tactical execution, performance under pressure.</p>
        </div>
        <div>
          <strong>Y-axis: growth potential</strong>
          <p className="muted">Trainability, feedback attitude, improvement rate, resilience.</p>
        </div>
      </div>
      <p className="muted">
        Each placement needs two-coach sign-off and a written rationale before it is shared.
      </p>
    </section>
  );
}

function GrowthReviewSummary({ review }: { review: GrowthReviewWithDetails }) {
  const quadrant = getQuadrantInfo(review.quadrant);
  return (
    <div className="growth-summary">
      <div>
        <span>Skill</span>
        <strong>{review.skill_score}/5</strong>
      </div>
      <div>
        <span>Growth potential</span>
        <strong>{review.growth_potential_score}/5</strong>
      </div>
      <div>
        <span>Quadrant</span>
        <strong>{quadrant.label}</strong>
      </div>
      <div>
        <span>Quarter</span>
        <strong>{review.quarter_label}</strong>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [rows, setRows] = useState<CampaignReadinessEntry[]>([]);
  const [requests, setRequests] = useState<ChangeRequestView[]>([]);

  useEffect(() => {
    void Promise.all([api.getAdminStats(), api.listCampaigns(), api.listChangeRequests()]).then(
      async ([nextStats, campaigns, nextRequests]) => {
        const primaryCampaign =
          campaigns.find((nextCampaign) => nextCampaign.status === "active") ??
          campaigns[0] ??
          null;
        setStats(nextStats);
        setCampaign(primaryCampaign);
        setRequests(nextRequests);
        setRows(primaryCampaign ? await api.getCampaignReadiness(primaryCampaign.id) : []);
      },
    );
  }, []);

  const totalPlayers = rows.length;
  const chaseRows = rows.filter((row) => row.missingFields.length > 0);
  const blockedRows = rows.filter(
    (row) =>
      row.missingFields.length > 0 ||
      row.passportStatus === "expired" ||
      row.passportStatus === "missing",
  );
  const passportRiskRows = rows.filter((row) => row.passportStatus !== "ok");
  const consentRiskRows = rows.filter((row) =>
    row.missingFields.some((field) => field.field === "data_sharing_consent"),
  );
  const pendingEvaluationRows = rows.filter((row) => row.evaluationStatus !== "submitted");
  const readyRows = rows.filter(
    (row) => row.missingFields.length === 0 && row.passportStatus === "ok",
  );
  const readyPercent = totalPlayers > 0 ? Math.round((readyRows.length / totalPlayers) * 100) : 0;
  const pendingRequests = pendingReviewRequests(requests);

  return (
    <>
      <PageHead
        title="Admin Dashboard"
        subtitle="What needs attention before this squad can travel, compete, and be submitted."
        eyebrow="Readiness control room"
        actions={
          <>
            <Link className="btn" to="/admin/review">
              Review queue
            </Link>
            <Link
              className="btn primary"
              to={campaign ? `/admin/campaigns/${campaign.id}` : "/admin/campaigns"}
            >
              Open campaign
            </Link>
          </>
        }
      />
      <section className="card control-room stack">
        <div className="control-room-head">
          <div>
            <p className="eyebrow">Primary campaign</p>
            <h2>{campaign?.name ?? "No active campaign"}</h2>
            <p className="muted">
              {campaign
                ? `${campaign.team ?? "Team TBC"} - ${campaign.location ?? "Location TBC"}`
                : "Create or activate a campaign to start tracking readiness."}
            </p>
          </div>
          <div className="readiness-score">
            <strong>
              {readyRows.length}/{totalPlayers || 0}
            </strong>
            <span>players travel-ready</span>
          </div>
        </div>
        <div className="progress" aria-label={`Campaign readiness ${readyPercent}%`}>
          <span style={{ width: `${readyPercent}%` }} />
        </div>
        <div className="ops-metrics">
          <div>
            <strong>{readyRows.length}</strong>
            <span>Ready</span>
          </div>
          <div>
            <strong>{blockedRows.length}</strong>
            <span>Blocked</span>
          </div>
          <div>
            <strong>{chaseRows.length}</strong>
            <span>Needs chase</span>
          </div>
          <div>
            <strong>{passportRiskRows.length + consentRiskRows.length}</strong>
            <span>Passport / consent risk</span>
          </div>
          <div>
            <strong>{pendingEvaluationRows.length}</strong>
            <span>Evaluations pending</span>
          </div>
        </div>
        <div className="ops-lanes">
          <section className="ops-lane">
            <div className="section-title">
              <h3>Needs chase</h3>
              <Badge tone={chaseRows.length === 0 ? "ok" : "warn"}>{chaseRows.length}</Badge>
            </div>
            {chaseRows.length > 0 ? (
              <ul className="compact-list">
                {chaseRows.slice(0, 3).map((row) => (
                  <li key={row.athleteId}>
                    <strong>{row.name}</strong>
                    <span>{row.missingFields.map((field) => field.label).join(", ")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No player profile chases needed.</p>
            )}
          </section>
          <section className="ops-lane">
            <div className="section-title">
              <h3>Risk checks</h3>
              <Badge
                tone={passportRiskRows.length + consentRiskRows.length === 0 ? "ok" : "danger"}
              >
                {passportRiskRows.length + consentRiskRows.length}
              </Badge>
            </div>
            <ul className="compact-list">
              <li>
                <strong>{passportRiskRows.length}</strong>
                <span>passport records need attention</span>
              </li>
              <li>
                <strong>{consentRiskRows.length}</strong>
                <span>players missing data-sharing consent</span>
              </li>
            </ul>
          </section>
          <section className="ops-lane">
            <div className="section-title">
              <h3>Next admin actions</h3>
              <Badge>ops</Badge>
            </div>
            <div className="action-list">
              <Link to={campaign ? `/admin/campaigns/${campaign.id}` : "/admin/campaigns"}>
                Draft reminders for {chaseRows.length} incomplete player
                {chaseRows.length === 1 ? "" : "s"}
              </Link>
              <Link to="/admin/review">
                Review {pendingRequests.length} pending profile change
                {pendingRequests.length === 1 ? "" : "s"}
              </Link>
              <Link to="/admin/exports">Check export readiness after risks are cleared</Link>
            </div>
          </section>
        </div>
      </section>
      <div className="ops-footer-grid">
        <section className="card stack">
          <div className="section-title">
            <h2>Review lanes</h2>
            <Badge tone={pendingRequests.length === 0 ? "ok" : "warn"}>
              {pendingRequests.length} pending
            </Badge>
          </div>
          <p className="muted">
            Profile updates stay human-reviewed. Assistant drafts do not approve or send anything.
          </p>
        </section>
        <section className="card stack">
          <div className="section-title">
            <h2>Submission pressure</h2>
            <Badge tone={(stats?.pendingEvaluations ?? 0) === 0 ? "ok" : "warn"}>
              {stats?.pendingEvaluations ?? pendingEvaluationRows.length} pending
            </Badge>
          </div>
          <p className="muted">
            Coach evaluations are tracked separately so admin can see when the squad file is ready
            to export.
          </p>
        </section>
      </div>
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
      <PageHead
        title="Players"
        subtitle="Athlete database with readiness signals."
        eyebrow="Admin"
      />
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
      <PageHead
        title="Campaigns"
        subtitle="Campaign list and creation workspace."
        eyebrow="Admin"
      />
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
  const [briefing, setBriefing] = useState<CampaignTryoutBriefing | null>(null);
  const [growthReviews, setGrowthReviews] = useState<GrowthReviewWithDetails[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [assistantResponse, setAssistantResponse] = useState<string | null>(null);

  const loadGrowthMatrixAdmin = useCallback(async () => {
    if (!enablePlayerGrowthMatrix) {
      return;
    }
    const [nextBriefing, nextGrowthReviews] = await Promise.all([
      api.getTryoutBriefing(campaignId),
      api.getCampaignGrowthReviews(campaignId),
    ]);
    setBriefing(nextBriefing);
    setGrowthReviews(nextGrowthReviews);
  }, [campaignId]);

  useEffect(() => {
    void Promise.all([api.getCampaign(campaignId), api.getCampaignReadiness(campaignId)]).then(
      ([nextCampaign, nextRows]) => {
        setCampaign(nextCampaign);
        setRows(nextRows);
      },
    );
    void loadGrowthMatrixAdmin();
  }, [campaignId, loadGrowthMatrixAdmin]);

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

  async function handleShareGrowthReview(reviewId: string) {
    if (!profile) {
      return;
    }
    await api.shareGrowthReview(reviewId, profile.id);
    setMessage("Growth review shared with the athlete and ready for welfare-board reporting.");
    await loadGrowthMatrixAdmin();
  }

  return (
    <>
      <PageHead
        title={campaign?.name ?? "Campaign"}
        eyebrow="Campaign readiness"
        subtitle={
          campaign
            ? `${campaign.team ?? "Team"} - ${campaign.location ?? "Location TBC"}`
            : "Campaign readiness"
        }
      />
      <section className="card stack summary-card">
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
      {enablePlayerGrowthMatrix ? (
        <AdminGrowthMatrixPanel
          briefing={briefing}
          reviews={growthReviews}
          onShare={(reviewId) => void handleShareGrowthReview(reviewId)}
        />
      ) : null}
      <section className="card stack assistant-card">
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

function AdminGrowthMatrixPanel({
  briefing,
  reviews,
  onShare,
}: {
  briefing: CampaignTryoutBriefing | null;
  reviews: GrowthReviewWithDetails[];
  onShare: (reviewId: string) => void;
}) {
  const disputed = reviews.filter((review) => review.status === "disputed");
  const welfareReady = reviews.filter(
    (review) => review.status === "shared" || review.status === "closed",
  );

  return (
    <section className="card stack growth-admin-panel">
      <div className="section-title">
        <h2>Player Growth Matrix</h2>
        <Badge tone={briefing?.published ? "ok" : "warn"}>
          {briefing?.published ? "briefing published" : "briefing unpublished"}
        </Badge>
      </div>
      <div className="grid cols-3">
        <StatCard
          label="Reviews"
          value={reviews.length}
          detail="Quarterly matrix placements"
          tone="accent"
        />
        <StatCard
          label="Disputes"
          value={disputed.length}
          detail="Right-of-reply records"
          tone={disputed.length > 0 ? "warn" : "ok"}
        />
        <StatCard
          label="Welfare-board ready"
          value={welfareReady.length}
          detail="Shared placements for report"
          tone="ok"
        />
      </div>
      {reviews.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Player</th>
                <th>Quarter</th>
                <th>Quadrant</th>
                <th>Sign-offs</th>
                <th>Replies</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((review) => (
                <tr key={review.id}>
                  <td>{review.athleteName}</td>
                  <td>{review.quarter_label}</td>
                  <td>{getQuadrantInfo(review.quadrant).label}</td>
                  <td>{review.signoffs.length}/2</td>
                  <td>{review.replies.length}</td>
                  <td>
                    <Badge tone={growthStatusTone(review.status)}>{review.status}</Badge>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn sm"
                      disabled={!canShareGrowthReview(review, review.signoffs)}
                      onClick={() => onShare(review.id)}
                    >
                      Share
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No growth matrix reviews have been drafted for this campaign yet.</p>
      )}
      <p className="muted">
        Sharing requires two distinct coach sign-offs. Player replies record disputes for human
        review and do not alter the placement automatically.
      </p>
    </section>
  );
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
      <PageHead title="Review Queue" subtitle="Player-submitted profile changes." eyebrow="Admin" />
      <section className="card stack assistant-card">
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

function growthStatusTone(status: string): "accent" | "danger" | "ok" | "warn" {
  if (status === "shared" || status === "closed") {
    return "ok";
  }
  if (status === "disputed") {
    return "danger";
  }
  if (status === "awaiting_second_signoff") {
    return "accent";
  }
  return "warn";
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
      <PageHead title="Exports" subtitle="CSV export workspace." eyebrow="Admin" />
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
      <PageHead
        title="Coach Dashboard"
        subtitle="Assigned campaigns and evaluation progress."
        eyebrow="Coach workspace"
        actions={
          campaigns[0] ? (
            <Link className="btn primary" to={`/coach/campaigns/${campaigns[0].id}`}>
              Open campaign
            </Link>
          ) : null
        }
      />
      <div className="grid cols-2">
        <StatCard
          label="Assigned campaigns"
          value={campaigns.length}
          tone="accent"
          detail="Coach-safe campaign access"
        />
        <StatCard
          label="Draft evaluations"
          value={evaluations.filter((e) => e.status === "draft").length}
          tone="warn"
          detail="Saved but not submitted"
        />
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
  const { profile } = useAuth();
  const [athletes, setAthletes] = useState<CoachAthleteView[]>([]);
  const [growthReviews, setGrowthReviews] = useState<GrowthReviewWithDetails[]>([]);
  const [growthForm, setGrowthForm] = useState<GrowthMatrixFormState>(emptyGrowthMatrixForm);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) {
      return;
    }
    const [nextAthletes, nextGrowthReviews] = await Promise.all([
      api.getCoachAthletes(campaignId),
      enablePlayerGrowthMatrix
        ? api.getCoachGrowthReviews(campaignId, profile.id)
        : Promise.resolve([]),
    ]);
    setAthletes(nextAthletes);
    setGrowthReviews(nextGrowthReviews);
    setGrowthForm((current) => ({
      ...current,
      athleteId: current.athleteId || nextAthletes[0]?.id || "",
    }));
  }, [campaignId, profile]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateGrowthForm(field: keyof GrowthMatrixFormState, value: string) {
    setGrowthForm((current) => ({ ...current, [field]: value }));
  }

  function editGrowthReview(review: GrowthReviewWithDetails) {
    setGrowthForm({
      id: review.id,
      athleteId: review.athlete_id,
      quarterLabel: review.quarter_label,
      skillScore: String(review.skill_score),
      growthPotentialScore: String(review.growth_potential_score),
      rationale: review.rationale,
    });
  }

  async function saveGrowthDraft() {
    if (!profile || !growthForm.athleteId || !growthForm.rationale.trim()) {
      setMessage("Choose a player and add a written rationale before saving.");
      return;
    }
    const saved = await api.saveGrowthReviewDraft({
      id: growthForm.id,
      campaignId,
      athleteId: growthForm.athleteId,
      coachProfileId: profile.id,
      quarterLabel: growthForm.quarterLabel,
      skillScore: Number(growthForm.skillScore),
      growthPotentialScore: Number(growthForm.growthPotentialScore),
      rationale: growthForm.rationale,
    });
    editGrowthReview(saved);
    setMessage("Growth matrix draft saved. It still needs two-coach sign-off before sharing.");
    await load();
  }

  async function signGrowthReview() {
    if (!profile || !growthForm.id) {
      setMessage("Save or select a growth review before signing.");
      return;
    }
    const signed = await api.signGrowthReview(growthForm.id, profile.id);
    editGrowthReview(signed);
    setMessage(
      signed.signoffs.length >= 2
        ? "Second sign-off recorded. Admin can now share this placement."
        : "Sign-off recorded. A second coach must sign before sharing.",
    );
    await load();
  }

  const latestReviewByAthlete = new Map<string, GrowthReviewWithDetails>();
  for (const review of growthReviews) {
    if (!latestReviewByAthlete.has(review.athlete_id)) {
      latestReviewByAthlete.set(review.athlete_id, review);
    }
  }

  return (
    <>
      <PageHead
        title="Assigned Players"
        subtitle="Coach-safe player list for this campaign."
        eyebrow="Coach"
      />
      <section className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Player</th>
              <th>Phone</th>
              <th>Profile</th>
              {enablePlayerGrowthMatrix ? <th>Growth Matrix</th> : null}
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {athletes.map((athlete) => {
              const growthReview = latestReviewByAthlete.get(athlete.id);
              return (
                <tr key={athlete.id}>
                  <td>{athlete.preferred_name || athlete.legal_name || "Unknown athlete"}</td>
                  <td>{athlete.phone ?? "-"}</td>
                  <td>{athlete.profile_status}</td>
                  {enablePlayerGrowthMatrix ? (
                    <td>
                      {growthReview ? (
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => editGrowthReview(growthReview)}
                        >
                          {growthReview.status}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() =>
                            setGrowthForm((current) => ({ ...current, athleteId: athlete.id }))
                          }
                        >
                          Draft matrix
                        </button>
                      )}
                    </td>
                  ) : null}
                  <td>
                    <Link className="btn sm" to={`/coach/evaluations/${campaignId}/${athlete.id}`}>
                      Evaluate
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {enablePlayerGrowthMatrix ? (
        <section className="card stack">
          <div className="section-title">
            <h2>Growth Matrix review</h2>
            <Badge>two-coach sign-off</Badge>
          </div>
          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="growth-athlete">Player</label>
              <select
                id="growth-athlete"
                value={growthForm.athleteId}
                onChange={(event) => updateGrowthForm("athleteId", event.target.value)}
              >
                {athletes.map((athlete) => (
                  <option key={athlete.id} value={athlete.id}>
                    {athlete.preferred_name || athlete.legal_name || "Unknown athlete"}
                  </option>
                ))}
              </select>
            </div>
            <TextField
              label="Quarter label"
              value={growthForm.quarterLabel}
              onChange={(value) => updateGrowthForm("quarterLabel", value)}
              required
            />
            <RatingField
              label="Current skill score"
              value={growthForm.skillScore}
              onChange={(value) => updateGrowthForm("skillScore", value)}
            />
            <RatingField
              label="Growth potential score"
              value={growthForm.growthPotentialScore}
              onChange={(value) => updateGrowthForm("growthPotentialScore", value)}
            />
          </div>
          <TextAreaField
            label="Written rationale"
            value={growthForm.rationale}
            onChange={(value) => updateGrowthForm("rationale", value)}
          />
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => void saveGrowthDraft()}>
              Save matrix draft
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!growthForm.id}
              onClick={() => void signGrowthReview()}
            >
              Sign matrix review
            </button>
          </div>
          {message ? <p className="alert ok">{message}</p> : null}
          <p className="muted">
            Coaches draft placement and rationale only. Admin sharing is blocked until two distinct
            coaches sign.
          </p>
        </section>
      ) : null}
    </>
  );
}

interface GrowthMatrixFormState {
  id?: string;
  athleteId: string;
  quarterLabel: string;
  skillScore: string;
  growthPotentialScore: string;
  rationale: string;
}

const emptyGrowthMatrixForm: GrowthMatrixFormState = {
  athleteId: "",
  quarterLabel: "Q2 2026",
  skillScore: "3",
  growthPotentialScore: "3",
  rationale: "",
};

function CoachEvaluationPage() {
  const { campaignId = "", playerId = "" } = useParams();
  const { profile } = useAuth();
  const [athlete, setAthlete] = useState<CoachAthleteView | null>(null);
  const [priorEvaluations, setPriorEvaluations] = useState<PriorCoachEvaluation[]>([]);
  const [form, setForm] = useState<EvaluationFormState>(emptyEvaluationForm);
  const [roughNotes, setRoughNotes] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [clarifications, setClarifications] = useState<CoachNoteClarification[]>([]);
  const [pendingClarifications, setPendingClarifications] = useState<Record<string, string>>({});
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [turnCount, setTurnCount] = useState(0);
  const [evaluationId, setEvaluationId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationResult, setGenerationResult] = useState<CoachNoteGenerationResult | null>(null);
  const [feedback, setFeedback] = useState<CoachNoteFeedback | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const structuredSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!profile) {
      return;
    }
    void Promise.all([
      api.getCoachAthletes(campaignId),
      api.getEvaluation(campaignId, playerId, profile.id),
      api.listOwnSubmittedEvaluations(profile.id, playerId, 3),
    ]).then(([athletes, evaluation, prior]) => {
      setAthlete(athletes.find((row) => row.id === playerId) ?? null);
      setPriorEvaluations(prior.filter((row) => row.campaignId !== campaignId));
      if (evaluation) {
        setEvaluationId(evaluation.id);
        setForm(evaluationFormFromRow(evaluation));
      }
    });
  }, [campaignId, playerId, profile]);

  function updateField(field: keyof EvaluationFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function applyCoachNoteDraft(draft: CoachNoteDraftV1) {
    const text = coachNoteDraftToFormText(draft);
    setForm((current) => ({
      ...current,
      strengths: text.strengths || current.strengths,
      development_areas: text.developmentAreas || current.development_areas,
      overall_notes: text.overallNotes || current.overall_notes,
    }));
  }

  function applyGenerationResult(result: CoachNoteGenerationResult) {
    applyCoachNoteDraft(result.draft);
    setGenerationResult(result);
    setSessionId(result.sessionId);
    setTurnCount(result.turnIndex + 1);
  }

  function scrollToStructuredSection() {
    window.requestAnimationFrame(() => {
      const section = structuredSectionRef.current;
      if (typeof section?.scrollIntoView === "function") {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      section?.focus();
    });
  }

  async function runCoachNoteAction(
    action: CoachNoteAction,
    options: {
      nextClarifications?: CoachNoteClarification[];
      nextAdditionalNotes?: string;
      section?: CoachNoteSection;
      sessionId?: string | undefined;
      successMessage: string;
    },
  ) {
    const activeSessionId = options.sessionId !== undefined ? options.sessionId : sessionId;
    if (turnCount >= COACH_NOTE_MAX_TURNS && activeSessionId) {
      setGenerationError("This evaluation copilot session reached its turn limit.");
      return;
    }

    const nextClarifications = options.nextClarifications ?? clarifications;
    const nextAdditionalNotes = options.nextAdditionalNotes ?? additionalNotes;

    setGenerating(true);
    setGenerationError(null);
    setFeedback(null);
    try {
      const result = await api.coachNoteAction({
        campaignId,
        athleteId: playerId,
        roughNotes,
        action,
        sessionId: activeSessionId,
        clarifications: nextClarifications,
        additionalNotes: nextAdditionalNotes,
        section: options.section,
      });
      const validation = validateCoachNoteDraft(result.draft, result.redactedNotes);
      if (!validation.valid) {
        throw new Error("Generated draft failed grounding validation");
      }
      applyGenerationResult(result);
      setClarifications(nextClarifications);
      setAdditionalNotes(nextAdditionalNotes);
      setPendingClarifications({});
      setMessage(
        enableCoachLlm
          ? options.successMessage
          : `${options.successMessage} Review every field before saving.`,
      );
    } catch {
      setGenerationError(
        enableCoachLlm
          ? "The LLM draft is unavailable. You can retry or explicitly use the deterministic fallback."
          : "The evaluation copilot could not save telemetry. Check that coach-note migrations are applied, then retry.",
      );
      setMessage(null);
      setGenerating(false);
      return;
    }
    setGenerating(false);
    scrollToStructuredSection();
  }

  async function handleStructureNotes() {
    setSessionId(undefined);
    setTurnCount(0);
    setClarifications([]);
    setAdditionalNotes("");
    setPendingClarifications({});
    await runCoachNoteAction("structure", {
      sessionId: undefined,
      nextClarifications: [],
      nextAdditionalNotes: "",
      successMessage: "Notes structured into a draft. Review before saving.",
    });
  }

  async function handleApplyClarifications() {
    const draftAmbiguities = generationResult?.draft.ambiguities ?? [];
    const nextClarifications = draftAmbiguities
      .map((ambiguity) => {
        const answer = pendingClarifications[ambiguity.sourceQuote]?.trim();
        if (!answer || answer.startsWith("Skip")) {
          return null;
        }
        return { sourceQuote: ambiguity.sourceQuote, answer };
      })
      .filter((value): value is CoachNoteClarification => value !== null);
    if (nextClarifications.length === 0) {
      setMessage("Add at least one clarification answer or edit the form directly.");
      return;
    }
    await runCoachNoteAction("clarify", {
      nextClarifications: [...clarifications, ...nextClarifications],
      successMessage: "Clarifications applied to the draft. Review before saving.",
    });
  }

  async function handleAddMoreNotes() {
    if (additionalNotes.trim().length === 0) {
      setMessage("Add more notes before re-structuring.");
      return;
    }
    await runCoachNoteAction("add_notes", {
      successMessage: "Additional notes structured into the draft. Review before saving.",
    });
  }

  async function handleRegenerateSection(section: CoachNoteSection) {
    await runCoachNoteAction("regenerate_section", {
      section,
      successMessage: `Regenerated ${section.replaceAll("_", " ")}. Review before saving.`,
    });
  }

  function handleDeterministicFallback() {
    const accumulatedInput = buildAccumulatedInput(roughNotes, clarifications, additionalNotes);
    const draft = createDeterministicCoachNoteDraft(accumulatedInput);
    applyCoachNoteDraft(draft);
    setGenerationResult(null);
    setSessionId(undefined);
    setTurnCount(0);
    setGenerationError(null);
    setFeedback(null);
    setMessage("Deterministic fallback applied. Review every field before saving.");
  }

  async function handleCoachNoteFeedback(nextFeedback: CoachNoteFeedback) {
    if (!generationResult) {
      return;
    }
    try {
      await api.submitCoachNoteFeedback({
        runId: generationResult.runId,
        feedback: nextFeedback,
      });
      setFeedback(nextFeedback);
    } catch {
      setGenerationError("Feedback could not be saved. The evaluation draft is unchanged.");
    }
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
    let saveMessage = status === "submitted" ? "Evaluation submitted." : "Evaluation draft saved.";
    if (generationResult) {
      const generated = coachNoteDraftToFormText(generationResult.draft);
      const final = {
        strengths: form.strengths,
        developmentAreas: form.development_areas,
        overallNotes: form.overall_notes,
      };
      const metrics = calculateCoachNoteEditMetrics(generated, final);
      try {
        await api.recordCoachNoteEditMetrics({
          runId: generationResult.runId,
          ...metrics,
        });
      } catch {
        saveMessage = `${saveMessage} Edit metrics could not be recorded.`;
      }
    }
    setMessage(saveMessage);
    setSaving(false);
  }

  const athleteName = athlete?.preferred_name || athlete?.legal_name || "Assigned player";

  return (
    <>
      <PageHead
        title="Evaluation"
        subtitle="Structure coach notes before saving."
        eyebrow="Coach"
      />
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
      {priorEvaluations.length > 0 ? (
        <PriorEvaluationsPanel evaluations={priorEvaluations} />
      ) : null}
      <section className="card stack">
        <div className="section-title">
          <h2>Evaluation copilot</h2>
          <Badge>{enableCoachLlm ? "LLM draft" : "local draft"}</Badge>
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
          onClick={() => void handleStructureNotes()}
          disabled={roughNotes.trim().length === 0 || generating}
        >
          {generating ? "Structuring..." : "Structure notes"}
        </button>
        {generationResult ? (
          <CoachNoteCopilotPanel
            draft={generationResult.draft}
            model={generationResult.model}
            ambiguityCount={generationResult.ambiguityCount}
            pendingClarifications={pendingClarifications}
            onPendingClarificationChange={(sourceQuote, answer) =>
              setPendingClarifications((current) => ({ ...current, [sourceQuote]: answer }))
            }
            onApplyClarifications={() => void handleApplyClarifications()}
            onRegenerateSection={(section) => void handleRegenerateSection(section)}
            regenerating={generating}
          />
        ) : null}
        {generationResult || clarifications.length > 0 || additionalNotes.trim().length > 0 ? (
          <div className="stack">
            <div className="field">
              <label htmlFor="additional-notes">Add more notes</label>
              <textarea
                id="additional-notes"
                value={additionalNotes}
                onChange={(event) => setAdditionalNotes(event.target.value)}
                placeholder="More detail on defense positioning..."
              />
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => void handleAddMoreNotes()}
              disabled={additionalNotes.trim().length === 0 || generating}
            >
              Add notes and re-structure
            </button>
          </div>
        ) : null}
        {sessionId ? (
          <p className="muted">
            Copilot session {sessionId.slice(0, 8)} · turn {turnCount}/{COACH_NOTE_MAX_TURNS}
          </p>
        ) : null}
        {generationError ? (
          <div className="stack">
            <p className="alert warn">{generationError}</p>
            <button type="button" className="btn" onClick={handleDeterministicFallback}>
              Use deterministic fallback
            </button>
          </div>
        ) : null}
        <p className="muted">
          {enableCoachLlm
            ? demoCoachLlm
              ? "Demo mode with live LLM drafting. The copilot structures evidence only; it never sets ratings or recommendations."
              : "The copilot structures evidence only. It never sets ratings or recommendations."
            : "Production LLM drafting is disabled until the Supabase Edge Function is deployed. This uses the local deterministic structurer."}
        </p>
        {generationResult ? (
          <div className="stack">
            <p className="muted">Was this grounded draft useful?</p>
            <div className="btn-row" aria-label="Coach note feedback">
              {(["useful", "incorrect", "missing_context"] as const).map((option) => (
                <button
                  type="button"
                  className="btn sm"
                  key={option}
                  aria-pressed={feedback === option}
                  onClick={() => void handleCoachNoteFeedback(option)}
                >
                  {option === "missing_context" ? "Missing context" : sentenceCase(option)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
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
          {message?.includes("Review") ? <Badge tone="ok">updated</Badge> : null}
        </div>
        {message?.includes("Review") ? <p className="alert ok">{message}</p> : null}
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
        {message && !message.includes("Review") ? <p className="alert ok">{message}</p> : null}
      </section>
    </>
  );
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function PriorEvaluationsPanel({ evaluations }: { evaluations: PriorCoachEvaluation[] }) {
  return (
    <section className="card stack prior-eval-panel">
      <h2>Your prior evaluations for this athlete</h2>
      <p className="muted">
        Read-only context from your submitted evaluations. This is not merged into the current draft
        automatically.
      </p>
      {evaluations.map((evaluation) => (
        <details key={evaluation.id} className="prior-eval-item">
          <summary>
            {evaluation.campaignName} · {new Date(evaluation.submittedAt).toLocaleDateString()}
          </summary>
          {evaluation.strengths ? (
            <div>
              <strong>Strengths</strong>
              <p>{evaluation.strengths}</p>
            </div>
          ) : null}
          {evaluation.developmentAreas ? (
            <div>
              <strong>Development areas</strong>
              <p>{evaluation.developmentAreas}</p>
            </div>
          ) : null}
          {evaluation.overallNotes ? (
            <div>
              <strong>Overall notes</strong>
              <p>{evaluation.overallNotes}</p>
            </div>
          ) : null}
          {evaluation.recommendation ? (
            <p className="muted">
              Recommendation: {evaluation.recommendation.replaceAll("_", " ")}
            </p>
          ) : null}
        </details>
      ))}
    </section>
  );
}

function CoachNoteCopilotPanel({
  draft,
  model,
  ambiguityCount,
  pendingClarifications,
  onPendingClarificationChange,
  onApplyClarifications,
  onRegenerateSection,
  regenerating,
}: {
  draft: CoachNoteDraftV1;
  model: string;
  ambiguityCount: number;
  pendingClarifications: Record<string, string>;
  onPendingClarificationChange: (sourceQuote: string, answer: string) => void;
  onApplyClarifications: () => void;
  onRegenerateSection: (section: CoachNoteSection) => void;
  regenerating: boolean;
}) {
  const groups: { label: string; items: EvidenceItem[]; section: CoachNoteSection }[] = [
    { label: "Strength evidence", items: draft.strengths, section: "strengths" },
    { label: "Development evidence", items: draft.developmentAreas, section: "development_areas" },
    {
      label: "Overall evidence",
      items: draft.overallObservations,
      section: "overall_observations",
    },
  ];
  return (
    <div className="stack">
      <p className="muted">
        Generated by {model}. Ambiguities flagged: {ambiguityCount}.
      </p>
      <details className="evidence-panel">
        <summary>Review grounding evidence</summary>
        {groups.map((group) =>
          group.items.length > 0 ? (
            <div key={group.label} className="evidence-group">
              <div className="section-title">
                <strong>{group.label}</strong>
                <button
                  type="button"
                  className="btn sm"
                  disabled={regenerating}
                  onClick={() => onRegenerateSection(group.section)}
                >
                  Regenerate section
                </button>
              </div>
              {group.items.map((item) => (
                <div
                  className="evidence-item"
                  key={`${group.label}-${item.draftText}-${item.evidenceQuotes.join("|")}`}
                >
                  <div>{item.draftText}</div>
                  <div className="muted">
                    Evidence: {item.evidenceQuotes.map((quote) => `"${quote}"`).join(", ")} (
                    {item.confidence})
                  </div>
                </div>
              ))}
            </div>
          ) : null,
        )}
      </details>
      {draft.ambiguities.length > 0 ? (
        <div className="clarification-panel stack">
          <strong>Needs coach clarification</strong>
          <p className="muted">
            Answer a clarification to re-structure the draft. This is not a chat.
          </p>
          {draft.ambiguities.map((ambiguity) => (
            <div
              className="clarification-card"
              key={`${ambiguity.sourceQuote}-${ambiguity.question}`}
            >
              <div>{ambiguity.question}</div>
              <div className="muted">Source: "{ambiguity.sourceQuote}"</div>
              <div className="btn-row">
                {suggestedAmbiguityOptions(ambiguity.sourceQuote).map((option) => (
                  <button
                    type="button"
                    className="btn sm"
                    key={option}
                    aria-pressed={pendingClarifications[ambiguity.sourceQuote] === option}
                    onClick={() => onPendingClarificationChange(ambiguity.sourceQuote, option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <div className="field">
                <label htmlFor={`clarify-${ambiguity.sourceQuote}`}>Or type a short answer</label>
                <input
                  id={`clarify-${ambiguity.sourceQuote}`}
                  value={pendingClarifications[ambiguity.sourceQuote] ?? ""}
                  onChange={(event) =>
                    onPendingClarificationChange(ambiguity.sourceQuote, event.target.value)
                  }
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            disabled={regenerating}
            onClick={onApplyClarifications}
          >
            Apply clarifications and re-structure
          </button>
        </div>
      ) : null}
    </div>
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
