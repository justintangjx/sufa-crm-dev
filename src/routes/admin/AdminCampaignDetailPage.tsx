import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
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
import { draftPlayerReminder, summarizeCampaignReadiness } from "../../lib/assistant";
import { campaignCapabilities } from "../../lib/campaignCapabilities";
import { enablePlayerGrowthMatrix } from "../../lib/env";
import { passportStatusLabel } from "../../lib/passport";
import type {
  Athlete,
  AssistantDraft,
  Campaign,
  CampaignNpsSurvey,
  CampaignTryoutBriefing,
  EvaluationAuditEvent,
  Profile,
} from "../../types/database";
import {
  buildIncompletePlayersAnswer,
  buildSportSyncReadinessAnswer,
} from "./adminCampaignAssistant";
import { AdminGrowthMatrixPanel, AdminLiveMatrixPanel, AdminNpsPanel } from "./AdminCampaignPanels";
import { AdminRosterImportPanel } from "./AdminRosterImportPanel";
import { emptyCampaignAssignmentForm, type CampaignAssignmentFormState } from "./adminCampaignForm";

export function AdminCampaignDetailPage() {
  const { campaignId = "" } = useParams();
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
  const [drafts, setDrafts] = useState<AssistantDraft[]>([]);
  const [briefing, setBriefing] = useState<CampaignTryoutBriefing | null>(null);
  const [growthReviews, setGrowthReviews] = useState<GrowthReviewWithDetails[]>([]);
  const [matrixRows, setMatrixRows] = useState<CampaignMatrixStatusRow[]>([]);
  const [auditEvents, setAuditEvents] = useState<EvaluationAuditEvent[]>([]);
  const [npsReport, setNpsReport] = useState<NpsReport>({ coachRows: [], playerRows: [] });
  const [npsSurveys, setNpsSurveys] = useState<CampaignNpsSurvey[]>([]);
  const [newPlayer, setNewPlayer] = useState({ name: "", email: "" });
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
        `${created.legal_name ?? "Player"} added to the roster and invited to ${campaign?.name ?? "this campaign"}. Complete their details on the Players page.`,
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
      <section className="card stack">
        <div className="section-title">
          <h2>Assign players</h2>
          <Badge>{unassignedAthletes.length} available</Badge>
        </div>
        {unassignedAthletes.length > 0 ? (
          <form
            className="grid cols-3 assignment-form"
            onSubmit={(event) => void handleAssignPlayer(event)}
          >
            <div className="field">
              <label htmlFor="assign-player">Player</label>
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
          <p className="muted">All athletes are already assigned to this campaign.</p>
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
        <p className="muted">
          Assigned players can see the campaign from their player dashboard. Coach evaluations and
          Growth Matrix drafts remain hidden until the correct review/share steps happen.
        </p>
      </section>
      <AdminRosterImportPanel
        campaignId={campaignId}
        athletes={athletes}
        memberAthleteIds={assignedAthleteIds}
        onImported={loadCampaignDetail}
      />
      <section className="card stack">
        <div className="section-title">
          <h2>Assign coaches</h2>
          <Badge>{campaignCoaches.length} assigned</Badge>
        </div>
        {campaignCoaches.length > 0 ? (
          <ul className="compact-list">
            {campaignCoaches.map((coach) => (
              <li key={coach.id}>
                <strong>{coach.name}</strong>
                <span>
                  {coach.email} · {coach.coachRole.replaceAll("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No coaches assigned yet.</p>
        )}
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
        ) : (
          <p className="muted">All coach profiles are already assigned to this campaign.</p>
        )}
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
        <p className="muted">
          Pilot uses flat coach role only. On Supabase, create the Auth user with{" "}
          <code>role=coach</code> first if create-from-CRM is unavailable, then assign here.
        </p>
      </section>
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
      {detailCaps.coachNps ? (
        <AdminNpsPanel
          campaignId={campaignId}
          report={npsReport}
          surveys={npsSurveys}
          onOpenPost={() => void handleSaveNpsSurvey("post_season", "open")}
          onClosePost={() => void handleSaveNpsSurvey("post_season", "closed")}
          onOpenMid={() => void handleSaveNpsSurvey("mid_season", "open")}
          onCloseMid={() => void handleSaveNpsSurvey("mid_season", "closed")}
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
