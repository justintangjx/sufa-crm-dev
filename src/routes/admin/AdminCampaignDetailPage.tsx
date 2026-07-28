import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { Badge, PageHead } from "../../components/shell/PagePrimitives";
import { api } from "../../data";
import type {
  CampaignCoachView,
  CampaignMatrixStatusRow,
  CampaignReadinessEntry,
  GrowthReviewWithDetails,
  NpsReport,
} from "../../data/types";
import { buildCampaignRosterRows, coachProvisioningMode } from "../../lib/adminCampaignOps";
import { campaignCapabilities } from "../../lib/campaignCapabilities";
import { enablePlayerGrowthMatrix, supabaseUrl, useMockBackend } from "../../lib/env";
import type {
  Athlete,
  Campaign,
  CampaignNpsSurvey,
  CampaignTryoutBriefing,
  EvaluationAuditEvent,
  Profile,
} from "../../types/database";
import { AdminGrowthMatrixPanel, AdminLiveMatrixPanel, AdminNpsPanel } from "./AdminCampaignPanels";
import { AdminRosterImportPanel } from "./AdminRosterImportPanel";
import { emptyCampaignAssignmentForm, type CampaignAssignmentFormState } from "./adminCampaignForm";

function alertTone(message: string): "ok" | "warn" {
  return /could not|select a coach|need a name|permission|denied/i.test(message) ? "warn" : "ok";
}

function isCoachAssignError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /coach/i.test(lower) && /could not|select a coach|need a name|permission|denied/i.test(lower)
  );
}

export function AdminCampaignDetailPage() {
  const { campaignId = "" } = useParams();
  const location = useLocation();
  const { profile } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [rows, setRows] = useState<CampaignReadinessEntry[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [coachProfiles, setCoachProfiles] = useState<Profile[]>([]);
  const [campaignCoaches, setCampaignCoaches] = useState<CampaignCoachView[]>([]);
  const [coachAssignId, setCoachAssignId] = useState("");
  const [newCoach, setNewCoach] = useState({ name: "", email: "" });
  const [assignment, setAssignment] = useState<CampaignAssignmentFormState>(
    emptyCampaignAssignmentForm,
  );
  const [briefing, setBriefing] = useState<CampaignTryoutBriefing | null>(null);
  const [growthReviews, setGrowthReviews] = useState<GrowthReviewWithDetails[]>([]);
  const [matrixRows, setMatrixRows] = useState<CampaignMatrixStatusRow[]>([]);
  const [auditEvents, setAuditEvents] = useState<EvaluationAuditEvent[]>([]);
  const [npsReport, setNpsReport] = useState<NpsReport>({ coachRows: [], playerRows: [] });
  const [npsSurveys, setNpsSurveys] = useState<CampaignNpsSurvey[]>([]);
  const [newPlayer, setNewPlayer] = useState({ name: "", email: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [manualPlayerOpen, setManualPlayerOpen] = useState(false);
  const coachMode = coachProvisioningMode(useMockBackend);
  const rosterRows = buildCampaignRosterRows(rows, athletes);

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

  const loadCampaignDetail = useCallback(async () => {
    const [nextCampaign, nextRows, nextAthletes, nextCoachProfiles, nextCampaignCoaches] =
      await Promise.all([
        api.getCampaign(campaignId),
        api.getCampaignReadiness(campaignId),
        api.listAthletes(),
        api.listCoachProfiles(),
        api.listCampaignCoaches(campaignId),
      ]);
    setCampaign(nextCampaign);
    setRows(nextRows);
    setAthletes(nextAthletes);
    setCoachProfiles(nextCoachProfiles);
    setCampaignCoaches(nextCampaignCoaches);
    if (campaignCapabilities(nextCampaign).liveMatrix) {
      const [nextMatrixRows, nextAuditEvents] = await Promise.all([
        api.getCampaignMatrixStatus(campaignId),
        api.listEvaluationAuditEvents(campaignId),
      ]);
      setMatrixRows(nextMatrixRows);
      setAuditEvents(nextAuditEvents);
    } else {
      setMatrixRows([]);
      setAuditEvents([]);
    }
    if (campaignCapabilities(nextCampaign).coachNps) {
      const [nextReport, nextSurveys] = await Promise.all([
        api.getNpsReport(campaignId),
        api.listNpsSurveys(campaignId),
      ]);
      setNpsReport(nextReport);
      setNpsSurveys(nextSurveys);
    } else {
      setNpsReport({ coachRows: [], playerRows: [] });
      setNpsSurveys([]);
    }
    void loadGrowthMatrixAdmin();
  }, [campaignId, loadGrowthMatrixAdmin]);

  useEffect(() => {
    void loadCampaignDetail();
  }, [loadCampaignDetail]);

  useEffect(() => {
    if (location.hash !== "#nps") {
      return;
    }
    document.getElementById("nps")?.scrollIntoView({ behavior: "smooth" });
  }, [location.hash, campaign]);

  const assignedAthleteIds = new Set(rows.map((row) => row.athleteId));
  const unassignedAthletes = athletes.filter((athlete) => !assignedAthleteIds.has(athlete.id));
  const assignedCoachIds = new Set(campaignCoaches.map((coach) => coach.coachProfileId));
  const unassignedCoaches = coachProfiles.filter((coach) => !assignedCoachIds.has(coach.id));
  const detailCaps = campaignCapabilities(campaign);

  useEffect(() => {
    if (assignment.athleteId || unassignedAthletes.length === 0) {
      return;
    }
    setAssignment((current) => ({ ...current, athleteId: unassignedAthletes[0]?.id ?? "" }));
  }, [assignment.athleteId, unassignedAthletes]);

  useEffect(() => {
    if (coachAssignId || unassignedCoaches.length === 0) {
      return;
    }
    setCoachAssignId(unassignedCoaches[0]?.id ?? "");
  }, [coachAssignId, unassignedCoaches]);

  async function handleShareGrowthReview(reviewId: string) {
    if (!profile) {
      return;
    }
    await api.shareGrowthReview(reviewId, profile.id);
    setMessage("Growth review shared with the athlete and ready for welfare-board reporting.");
    await loadGrowthMatrixAdmin();
  }

  async function handleAssignPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignment.athleteId) {
      setMessage("Select a player before assigning.");
      return;
    }
    await api.assignCampaignMember({
      campaignId,
      athleteId: assignment.athleteId,
      status: assignment.status,
    });
    const assigned = athletes.find((athlete) => athlete.id === assignment.athleteId);
    setMessage(
      `${assigned?.preferred_name || assigned?.legal_name || "Player"} assigned to ${campaign?.name ?? "campaign"}.`,
    );
    setAssignment(emptyCampaignAssignmentForm);
    await loadCampaignDetail();
  }

  async function handleCreateAndAssignPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newPlayer.name.trim() || !newPlayer.email.trim()) {
      setMessage("New players need a name and a login email.");
      return;
    }
    try {
      const created = await api.createAthlete({
        legalName: newPlayer.name,
        email: newPlayer.email,
      });
      await api.assignCampaignMember({
        campaignId,
        athleteId: created.id,
        status: "invited",
      });
      setMessage(
        `${created.legal_name ?? "Player"} added to the roster and invited to ${campaign?.name ?? "this campaign"}.`,
      );
      setNewPlayer({ name: "", email: "" });
      await loadCampaignDetail();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add the player.");
    }
  }

  async function handleAssignCoach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!coachAssignId) {
      setMessage("Select a coach before assigning.");
      return;
    }
    try {
      await api.assignCampaignCoach({
        campaignId,
        coachProfileId: coachAssignId,
      });
      const assigned = coachProfiles.find((coach) => coach.id === coachAssignId);
      setMessage(
        `${assigned?.full_name || assigned?.email || "Coach"} assigned to ${campaign?.name ?? "campaign"}.`,
      );
      setCoachAssignId("");
      await loadCampaignDetail();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not assign the coach.");
    }
  }

  async function handleUnassignPlayer(athleteId: string, name: string) {
    if (
      !window.confirm(
        `Remove ${name} from ${campaign?.name ?? "this campaign"}? They can be reassigned later.`,
      )
    ) {
      return;
    }
    try {
      await api.unassignCampaignMember({
        campaignId,
        athleteId,
      });
      setMessage(`${name} removed from ${campaign?.name ?? "campaign"}.`);
      await loadCampaignDetail();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove the player.");
    }
  }

  async function handleUnassignCoach(coach: CampaignCoachView) {
    if (
      !window.confirm(
        `Remove ${coach.name} from ${campaign?.name ?? "this campaign"}? They can be reassigned later.`,
      )
    ) {
      return;
    }
    try {
      await api.unassignCampaignCoach({
        campaignId,
        coachProfileId: coach.coachProfileId,
      });
      setMessage(`${coach.name} removed from ${campaign?.name ?? "campaign"}.`);
      await loadCampaignDetail();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove the coach.");
    }
  }

  async function handleCreateAndAssignCoach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newCoach.name.trim() || !newCoach.email.trim()) {
      setMessage("New coaches need a name and a login email.");
      return;
    }
    try {
      const created = await api.createCoachProfile({
        fullName: newCoach.name,
        email: newCoach.email,
      });
      await api.assignCampaignCoach({
        campaignId,
        coachProfileId: created.id,
      });
      setMessage(
        `${created.full_name ?? "Coach"} created and assigned to ${campaign?.name ?? "this campaign"}.`,
      );
      setNewCoach({ name: "", email: "" });
      await loadCampaignDetail();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add the coach.");
    }
  }

  async function handleSaveNpsSurvey(
    window: "mid_season" | "post_season",
    status: "open" | "closed",
  ) {
    if (!profile || !campaign) {
      return;
    }
    await api.saveNpsSurvey({
      campaignId,
      title: `${campaign.name} ${window === "mid_season" ? "mid-season" : "post-season"} NPS`,
      window,
      status,
      opensAt: status === "open" ? new Date().toISOString() : null,
      closesAt: status === "closed" ? new Date().toISOString() : null,
      createdBy: profile.id,
    });
    setMessage(`NPS survey ${status === "open" ? "opened" : "closed"}.`);
    const [nextReport, nextSurveys] = await Promise.all([
      api.getNpsReport(campaignId),
      api.listNpsSurveys(campaignId),
    ]);
    setNpsReport(nextReport);
    setNpsSurveys(nextSurveys);
  }

  return (
    <>
      <PageHead
        title={campaign?.name ?? "Campaign"}
        eyebrow="Campaign workspace"
        subtitle={
          campaign
            ? `${campaign.team ?? "Team"} · ${campaign.location ?? "Location TBC"}`
            : "Import roster, assign coaches, administer NPS."
        }
      />
      {message && !isCoachAssignError(message) ? (
        <p className={`alert ${alertTone(message)} page-message`}>{message}</p>
      ) : null}
      <AdminRosterImportPanel
        campaignId={campaignId}
        athletes={athletes}
        memberAthleteIds={assignedAthleteIds}
        onImported={loadCampaignDetail}
      />
      {rosterRows.length > 0 ? (
        <section className="card table-wrap">
          <div className="section-title">
            <h2>Campaign roster</h2>
            <Badge>{rosterRows.length} players</Badge>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Login email</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rosterRows.map((row) => (
                <tr key={row.athleteId}>
                  <td>{row.name}</td>
                  <td>{row.email}</td>
                  <td>
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => void handleUnassignPlayer(row.athleteId, row.name)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      <section className="card stack optional-panel">
        <button
          type="button"
          className="optional-panel-trigger"
          aria-expanded={manualPlayerOpen}
          onClick={() => setManualPlayerOpen((open) => !open)}
        >
          <span className="optional-panel-chevron" aria-hidden="true">
            {manualPlayerOpen ? "−" : "+"}
          </span>
          <span className="optional-panel-label">
            <strong>Add one player manually</strong>
            <span className="muted">Optional — use CSV import above for full rosters</span>
          </span>
        </button>
        {manualPlayerOpen ? (
          <div className="optional-panel-body stack">
            {unassignedAthletes.length > 0 ? (
              <form
                className="grid cols-3 assignment-form"
                onSubmit={(event) => void handleAssignPlayer(event)}
              >
                <div className="field">
                  <label htmlFor="assign-player">Existing player</label>
                  <select
                    id="assign-player"
                    value={assignment.athleteId}
                    onChange={(event) =>
                      setAssignment((current) => ({ ...current, athleteId: event.target.value }))
                    }
                  >
                    {unassignedAthletes.map((athlete) => (
                      <option key={athlete.id} value={athlete.id}>
                        {athlete.preferred_name || athlete.legal_name || "Unnamed player"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="assign-status">Assignment status</label>
                  <select
                    id="assign-status"
                    value={assignment.status}
                    onChange={(event) =>
                      setAssignment((current) => ({
                        ...current,
                        status: event.target.value as CampaignAssignmentFormState["status"],
                      }))
                    }
                  >
                    <option value="invited">Invited</option>
                    <option value="registered">Registered</option>
                    <option value="selected">Selected</option>
                    <option value="reserve">Reserve</option>
                    <option value="withdrawn">Withdrawn</option>
                  </select>
                </div>
                <div className="field field-action">
                  <label aria-hidden="true">&nbsp;</label>
                  <button type="submit" className="btn primary">
                    Assign player
                  </button>
                </div>
              </form>
            ) : (
              <p className="muted">
                All athletes in the CRM are already assigned to this campaign.
              </p>
            )}
            <form
              className="grid cols-3 assignment-form"
              onSubmit={(event) => void handleCreateAndAssignPlayer(event)}
            >
              <div className="field">
                <label htmlFor="new-player-name">New player name</label>
                <input
                  id="new-player-name"
                  type="text"
                  value={newPlayer.name}
                  onChange={(event) =>
                    setNewPlayer((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Full name"
                />
              </div>
              <div className="field">
                <label htmlFor="new-player-email">Login email</label>
                <input
                  id="new-player-email"
                  type="email"
                  value={newPlayer.email}
                  onChange={(event) =>
                    setNewPlayer((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="player@example.com"
                />
              </div>
              <div className="field field-action">
                <label aria-hidden="true">&nbsp;</label>
                <button type="submit" className="btn">
                  Add and invite player
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </section>
      <section className="card stack">
        <div className="section-title">
          <h2>Assign coaches</h2>
          <Badge>{campaignCoaches.length} assigned</Badge>
        </div>
        {message && isCoachAssignError(message) ? (
          <p className={`alert ${alertTone(message)}`}>{message}</p>
        ) : null}
        {campaignCoaches.length > 0 ? (
          <ul className="compact-list coach-assignment-list">
            {campaignCoaches.map((coach) => (
              <li key={coach.id}>
                <div>
                  <strong>{coach.name}</strong>
                  <span>
                    {coach.email} · {coach.coachRole.replaceAll("_", " ")}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => void handleUnassignCoach(coach)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No coaches assigned yet.</p>
        )}
        {coachMode === "auth_first" ? (
          <div className="coach-auth-checklist stack">
            <strong>Create coach in Supabase Auth first</strong>
            <ol>
              <li>
                In Supabase Auth, create a user with{" "}
                <code>user_metadata: &#123; &quot;role&quot;: &quot;coach&quot; &#125;</code>
              </li>
              <li>Ask the coach to sign in once so their CRM profile is created</li>
              <li>Select them below and click Assign coach</li>
            </ol>
            {supabaseUrl ? (
              <p className="muted">
                Project: <code>{supabaseUrl}</code>
              </p>
            ) : null}
          </div>
        ) : null}
        {unassignedCoaches.length > 0 ? (
          <form
            className="grid cols-2 assignment-form"
            onSubmit={(event) => void handleAssignCoach(event)}
          >
            <div className="field">
              <label htmlFor="assign-coach">Coach</label>
              <select
                id="assign-coach"
                value={coachAssignId}
                onChange={(event) => setCoachAssignId(event.target.value)}
              >
                {unassignedCoaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.full_name || coach.preferred_name || coach.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="field field-action">
              <label aria-hidden="true">&nbsp;</label>
              <button type="submit" className="btn primary">
                Assign coach
              </button>
            </div>
          </form>
        ) : coachMode === "auth_first" ? (
          <p className="muted">
            No coach profiles available yet. Create the Auth user and have them sign in once.
          </p>
        ) : (
          <p className="muted">All coach profiles are already assigned to this campaign.</p>
        )}
        {coachMode === "crm_create" ? (
          <form
            className="grid cols-3 assignment-form"
            onSubmit={(event) => void handleCreateAndAssignCoach(event)}
          >
            <div className="field">
              <label htmlFor="new-coach-name">New coach name</label>
              <input
                id="new-coach-name"
                type="text"
                value={newCoach.name}
                onChange={(event) =>
                  setNewCoach((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Full name"
              />
            </div>
            <div className="field">
              <label htmlFor="new-coach-email">Coach login email</label>
              <input
                id="new-coach-email"
                type="email"
                value={newCoach.email}
                onChange={(event) =>
                  setNewCoach((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="coach@example.com"
              />
            </div>
            <div className="field field-action">
              <label aria-hidden="true">&nbsp;</label>
              <button type="submit" className="btn">
                Add and assign coach
              </button>
            </div>
          </form>
        ) : null}
      </section>
      {detailCaps.coachNps ? (
        <AdminNpsPanel
          campaignId={campaignId}
          rosterCount={rows.length}
          coachCount={campaignCoaches.length}
          report={npsReport}
          surveys={npsSurveys}
          onOpenPost={() => void handleSaveNpsSurvey("post_season", "open")}
          onClosePost={() => void handleSaveNpsSurvey("post_season", "closed")}
          onOpenMid={() => void handleSaveNpsSurvey("mid_season", "open")}
          onCloseMid={() => void handleSaveNpsSurvey("mid_season", "closed")}
        />
      ) : null}
      {detailCaps.growthMatrix ? (
        <AdminGrowthMatrixPanel
          briefing={briefing}
          reviews={growthReviews}
          onShare={(reviewId) => void handleShareGrowthReview(reviewId)}
        />
      ) : null}
      {detailCaps.liveMatrix ? (
        <AdminLiveMatrixPanel rows={matrixRows} auditEvents={auditEvents} />
      ) : null}
    </>
  );
}
