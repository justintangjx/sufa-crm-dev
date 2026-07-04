import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { api, resetData } from "./data";
import { TestApp } from "./routes";

async function submitNpsFor(profileId: string, score: number) {
  const athlete = await api.getAthleteForProfile(profileId);
  const task = (await api.listPlayerNpsTasks(profileId, "c-u24"))[0];
  expect(athlete).not.toBeNull();
  expect(task).toBeDefined();
  await api.submitNpsResponse({
    surveyId: "nps-u24-mid",
    assignmentId: task?.assignmentId ?? "",
    athleteId: athlete?.id ?? "",
    targetCoachProfileId: "p-coach",
    score,
  });
}

describe("App routing", () => {
  beforeEach(() => {
    resetData();
  });

  it("lets an admin sign in and land on the admin dashboard", async () => {
    const user = userEvent.setup();
    render(<TestApp initialEntries={["/login"]} />);

    await user.type(screen.getByLabelText(/email/i), "admin@sufa.test");
    await user.click(screen.getByRole("button", { name: /send magic link/i }));

    expect(await screen.findByRole("heading", { name: /admin dashboard/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /u24 worlds 2026/i })).toBeInTheDocument();
    expect(await screen.findByText(/players travel-ready/i)).toBeInTheDocument();
    expect(screen.getByText(/next admin actions/i)).toBeInTheDocument();
  });

  it("redirects a player away from admin routes", async () => {
    await api.signIn("alice@sufa.test");

    render(<TestApp initialEntries={["/admin"]} />);

    expect(
      await screen.findByRole("heading", { name: /player campaign hub/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /admin dashboard/i })).not.toBeInTheDocument();
  });

  it("keeps U24 Worlds first while SEA Games remains a separate campaign", async () => {
    await api.signIn("alice@sufa.test");

    render(<TestApp initialEntries={["/player"]} />);

    const campaignPanel = (
      await screen.findByRole("heading", { name: /campaign readiness/i })
    ).closest("section");
    expect(campaignPanel).not.toBeNull();

    const campaignLinks = within(campaignPanel as HTMLElement).getAllByRole("link");
    expect(campaignLinks.map((link) => link.textContent)).toEqual([
      "U24 Worlds 2026",
      "SEA Games 2026",
    ]);
  });

  it("lets a player complete missing profile details and records audit requests", async () => {
    const user = userEvent.setup();
    await api.signIn("ben@sufa.test");

    render(<TestApp initialEntries={["/player/profile"]} />);

    expect(await screen.findByRole("heading", { name: /player profile/i })).toBeInTheDocument();
    expect(await screen.findByText(/29%/)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/date of birth/i), "1998-02-14");
    await user.type(screen.getByLabelText(/emergency contact name/i), "Mina Ong");
    await user.type(screen.getByLabelText(/emergency contact phone/i), "+65 9888 0000");
    await user.type(screen.getByLabelText(/passport expiry/i), "2031-03-01");
    await user.click(screen.getByLabelText(/using my profile data for campaign administration/i));
    await user.click(screen.getByRole("button", { name: /save profile/i }));

    expect(await screen.findByText(/profile saved/i)).toBeInTheDocument();

    await waitFor(async () => {
      const athlete = await api.getAthleteForProfile("p-ben");
      expect(athlete?.date_of_birth).toBe("1998-02-14");
      expect(athlete?.data_sharing_consent).toBe(true);
    });

    const requests = await api.listChangeRequests();
    const benFields = requests
      .filter((request) => request.athleteId === "a-ben")
      .map((request) => request.fieldName);
    expect(benFields).toEqual(
      expect.arrayContaining([
        "date_of_birth",
        "emergency_contact_name",
        "emergency_contact_phone",
        "passport_expiry",
        "data_sharing_consent",
      ]),
    );
  });

  it("offers Derrick as a blank player demo account", async () => {
    const user = userEvent.setup();
    render(<TestApp initialEntries={["/login"]} />);

    await user.click(await screen.findByRole("button", { name: /player \(derrick\)/i }));

    expect(
      await screen.findByRole("heading", { name: /player campaign hub/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/7 items are blocking campaign readiness/i)).toBeInTheDocument();

    const athlete = await api.getAthleteForProfile("p-derrick");
    expect(athlete?.legal_name).toBeNull();
    expect(athlete?.data_sharing_consent).toBe(false);
  });

  it("shows a player the published tryout briefing and shared growth placement", async () => {
    await api.signIn("alice@sufa.test");

    render(<TestApp initialEntries={["/player/campaigns/c-sea"]} />);

    expect(await screen.findByRole("heading", { name: /sea games 2026/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /before tryouts/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /live self-evaluation matrix/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /coach nps/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Coach Lim/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Core minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/reliable throwing under pressure/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/formal right-of-reply/i)).toBeInTheDocument();
  });

  it("does not show a player draft or one-sign-off growth reviews", async () => {
    await api.signIn("ben@sufa.test");

    render(<TestApp initialEntries={["/player/campaigns/c-sea"]} />);

    expect(await screen.findByRole("heading", { name: /sea games 2026/i })).toBeInTheDocument();
    expect(screen.getByText(/No matrix placement has been shared yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/Ben is still building tactical execution/i)).not.toBeInTheDocument();
  });

  it("lets a player submit a right-of-reply without changing the placement result", async () => {
    const user = userEvent.setup();
    await api.signIn("alice@sufa.test");

    render(<TestApp initialEntries={["/player/campaigns/c-sea"]} />);

    await user.type(
      await screen.findByLabelText(/formal right-of-reply/i),
      "I want the welfare board to know I was recovering from illness during camp.",
    );
    await user.click(screen.getByRole("button", { name: /submit reply/i }));

    expect(await screen.findByText(/Reply submitted/i)).toBeInTheDocument();
    expect(screen.getByText(/Core minutes/i)).toBeInTheDocument();

    const flow = await api.getPlayerCampaignFlow("p-alice", "c-sea");
    expect(flow?.reviews[0]?.status).toBe("disputed");
    expect(flow?.reviews[0]?.quadrant).toBe("core_minutes");
    expect(flow?.reviews[0]?.replies[0]?.body).toContain("recovering from illness");
  });

  it("requires a second coach sign-off before an admin can share a growth review", async () => {
    const before = await api.getCampaignGrowthReviews("c-sea");
    const benReview = before.find((review) => review.athleteName === "Ben");
    expect(benReview?.signoffs).toHaveLength(1);
    expect(benReview?.status).toBe("awaiting_second_signoff");

    await expect(api.shareGrowthReview("gr-ben-q1", "p-admin")).rejects.toThrow(/Two coach/);

    const signed = await api.signGrowthReview("gr-ben-q1", "p-coach-2");
    expect(signed.signoffs).toHaveLength(2);

    const shared = await api.shareGrowthReview("gr-ben-q1", "p-admin");
    expect(shared.status).toBe("shared");

    const playerFlow = await api.getPlayerCampaignFlow("p-ben", "c-sea");
    expect(playerFlow?.reviews[0]?.rationale).toContain("Ben is still building");
  });

  it("lets an admin draft campaign reminders without sending them", async () => {
    const user = userEvent.setup();
    await api.signIn("admin@sufa.test");

    render(<TestApp initialEntries={["/admin/campaigns/c-sea"]} />);

    expect(await screen.findByRole("heading", { name: /sea games 2026/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /u24 live evaluation matrix/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^coach nps$/i })).not.toBeInTheDocument();
    expect((await screen.findAllByText(/passport expiry/i)).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /who is incomplete/i }));
    expect(
      await screen.findByText(/1 player is missing required profile details/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ben: Date of birth/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /are we sportsync-ready/i }));
    expect(await screen.findByText(/2 of 3 players are profile-ready/i)).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /draft reminders \(1\)/i }));

    expect(await screen.findByText(/1 reminder draft created for review/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /reminder draft preview/i })).toBeInTheDocument();
    expect(screen.getByText(/Hi Ben,/)).toBeInTheDocument();
    expect(screen.getAllByText(/Nothing has been sent/i).length).toBeGreaterThan(0);

    const drafts = await api.listAssistantDrafts("p-admin");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.status).toBe("draft");
    expect(drafts[0]?.content).toContain("Passport expiry");
  });

  it("lets an admin create a campaign from the campaign workspace", async () => {
    const user = userEvent.setup();
    await api.signIn("admin@sufa.test");

    render(<TestApp initialEntries={["/admin/campaigns"]} />);

    expect(await screen.findByRole("heading", { name: /campaigns/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/campaign name/i), "Worlds 2027");
    await user.type(screen.getByLabelText(/^team$/i), "Mixed");
    await user.type(screen.getByLabelText(/start date/i), "2027-07-01");
    await user.type(screen.getByLabelText(/end date/i), "2027-07-08");
    await user.type(screen.getByLabelText(/location/i), "Perth");
    await user.selectOptions(screen.getByLabelText(/campaign status/i), "active");
    await user.click(screen.getByRole("button", { name: /create campaign/i }));

    expect(await screen.findByText(/Worlds 2027 created/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /worlds 2027/i })).toBeInTheDocument();

    const campaigns = await api.listCampaigns();
    expect(campaigns.some((campaign) => campaign.name === "Worlds 2027")).toBe(true);
  });

  it("lets an admin assign Derrick to a campaign from campaign detail", async () => {
    const user = userEvent.setup();
    await api.signIn("admin@sufa.test");

    render(<TestApp initialEntries={["/admin/campaigns/c-sea"]} />);

    expect(await screen.findByRole("heading", { name: /sea games 2026/i })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/player/i), "a-derrick");
    await user.selectOptions(screen.getByLabelText(/assignment status/i), "registered");
    await user.click(screen.getByRole("button", { name: /assign player/i }));

    expect(await screen.findByText(/Player assigned to SEA Games 2026/i)).toBeInTheDocument();

    const flow = await api.getPlayerCampaignFlow("p-derrick", "c-sea");
    expect(flow?.memberStatus).toBe("registered");
  });

  it("lets an admin triage review queue risk without auto-approving changes", async () => {
    const user = userEvent.setup();
    await api.updateOwnAthlete("p-cara", { passport_expiry: "2031-03-01" });
    await api.signIn("admin@sufa.test");

    render(<TestApp initialEntries={["/admin/review"]} />);

    expect(await screen.findByRole("heading", { name: /review queue/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /summarize queue/i }));
    expect(await screen.findByText(/2 pending changes need review/i)).toBeInTheDocument();
    expect(screen.getByText(/1 high risk/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /review risk/i }));
    expect(await screen.findByText(/passport_expiry is high risk/i)).toBeInTheDocument();
    expect(screen.getByText(/phone is low risk/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /suggest decisions/i }));
    expect(
      await screen.findByText(/verify supporting context before approving/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/approve if the value looks current/i)).toBeInTheDocument();

    const requests = await api.listChangeRequests();
    expect(requests.filter((request) => request.status === "pending")).toHaveLength(2);
  });

  it("shows admins growth matrix disputes and welfare-board-ready counts", async () => {
    await api.submitGrowthReply(
      "gr-alice-q1",
      "p-alice",
      "I dispute the growth potential notes and request welfare review.",
    );
    await api.signIn("admin@sufa.test");

    render(<TestApp initialEntries={["/admin/campaigns/c-sea"]} />);

    expect(
      await screen.findByRole("heading", { name: /player growth matrix/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/briefing published/i)).toBeInTheDocument();
    expect(screen.getByText(/Right-of-reply records/i)).toBeInTheDocument();
    expect(screen.getByText(/Shared placements for report/i)).toBeInTheDocument();
  });

  it("records player and coach live matrix submissions with audit events", async () => {
    await api.savePlayerMatrixSubmission({
      campaignId: "c-u24",
      athleteId: "a-ben",
      submittedBy: "p-ben",
      skillScore: 3,
      growthScore: 4,
      readinessScore: 3,
      confidenceScore: 4,
      strengths: "Quick first steps and positive sideline communication.",
      developmentFocus: "More consistent reset timing.",
      supportNeeded: "Extra handler-defender reps.",
      status: "submitted",
    });

    await api.saveCoachMatrixAssessment({
      campaignId: "c-u24",
      athleteId: "a-ben",
      coachProfileId: "p-coach",
      skillScore: 3,
      growthScore: 4,
      readinessScore: 3,
      tacticalScore: 3,
      strengths: "Takes feedback well and applies it within the same session.",
      developmentFocus: "Spacing discipline against zone looks.",
      coachNotes: "Good U24 Worlds training candidate with clear development priorities.",
      status: "submitted",
    });

    const rows = await api.getCampaignMatrixStatus("c-u24");
    const ben = rows.find((row) => row.athleteId === "a-ben");
    expect(ben?.playerStatus).toBe("submitted");
    expect(ben?.submittedCoachCount).toBe(1);

    const auditEvents = await api.listEvaluationAuditEvents("c-u24");
    expect(auditEvents.map((event) => event.event_type)).toEqual(
      expect.arrayContaining(["submitted"]),
    );
    expect(auditEvents.some((event) => event.actor_role === "coach")).toBe(true);
  });

  it("withholds NPS aggregates until the anonymity threshold is met", async () => {
    let report = await api.getNpsReport("c-u24");
    const coachLimMid = () =>
      report.find((row) => row.surveyId === "nps-u24-mid" && row.coachProfileId === "p-coach");
    expect(coachLimMid()?.withheld).toBe(true);

    await submitNpsFor("p-alice", 10);
    await submitNpsFor("p-ben", 9);
    report = await api.getNpsReport("c-u24");
    expect(coachLimMid()?.withheld).toBe(true);

    await submitNpsFor("p-cara", 6);
    report = await api.getNpsReport("c-u24");
    expect(coachLimMid()).toMatchObject({
      responseCount: 3,
      withheld: false,
      nps: 33,
    });
  });

  it("lets a coach structure rough notes and submit an evaluation", async () => {
    const user = userEvent.setup();
    await api.signIn("coach@sufa.test");

    render(<TestApp initialEntries={["/coach/evaluations/c-sea/a-alice"]} />);

    expect(
      await screen.findByRole("heading", { level: 1, name: /^evaluation$/i }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /alice/i })).toBeInTheDocument();
    expect(screen.queryByText(/passport/i)).not.toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/paste rough notes/i),
      "Strong hucks and accurate throws. Needs to work on reset defense. Reliable starter, lock them in to select.",
    );
    await user.click(screen.getByRole("button", { name: /structure notes/i }));

    expect(await screen.findByText(/notes structured into a draft/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /structured evaluation/i }).closest("section"),
      ).toHaveFocus();
    });
    expect((screen.getByLabelText(/strengths/i) as HTMLTextAreaElement).value).toContain(
      "Strong hucks",
    );
    expect(screen.getByLabelText(/development areas/i)).toHaveValue(
      "Needs to work on reset defense",
    );
    expect(screen.getByLabelText(/recommendation/i)).toHaveValue("");
    expect(screen.getByText(/review grounding evidence/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/throwing rating/i), "4");
    await user.selectOptions(screen.getByLabelText(/cutting rating/i), "4");
    await user.selectOptions(screen.getByLabelText(/defense rating/i), "3");
    await user.selectOptions(screen.getByLabelText(/fitness rating/i), "4");
    await user.selectOptions(screen.getByLabelText(/game iq rating/i), "5");
    await user.selectOptions(screen.getByLabelText(/communication rating/i), "4");
    await user.selectOptions(screen.getByLabelText(/coachability rating/i), "5");
    await user.selectOptions(screen.getByLabelText(/recommendation/i), "selected");
    await user.click(screen.getByRole("button", { name: /submit evaluation/i }));

    expect(await screen.findByText(/evaluation submitted/i)).toBeInTheDocument();

    const evaluation = await api.getEvaluation("c-sea", "a-alice", "p-coach");
    expect(evaluation?.status).toBe("submitted");
    expect(evaluation?.recommendation).toBe("selected");
    expect(evaluation?.strengths).toContain("Strong hucks");
  });

  it("keeps U24 live matrix tools off a coach SEA Games campaign route", async () => {
    await api.signIn("coach@sufa.test");

    render(<TestApp initialEntries={["/coach/campaigns/c-sea"]} />);

    expect(
      await screen.findByRole("heading", { name: /sea games 2026 players/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /u24 coach matrix assessment/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /player matrix/i })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /growth matrix/i })).toBeInTheDocument();
  });

  it("does not require an LLM call to structure coach notes in the app shell", async () => {
    const user = userEvent.setup();
    await api.signIn("coach@sufa.test");

    render(<TestApp initialEntries={["/coach/evaluations/c-sea/a-cara"]} />);

    expect(await screen.findByRole("heading", { name: /cara/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/paste rough notes/i), "Calm handler. Needs more reps.");
    await user.click(screen.getByRole("button", { name: /structure notes/i }));

    expect(await screen.findByText(/notes structured into a draft/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/strengths/i)).toHaveValue("Calm handler");
    expect(screen.getByLabelText(/development areas/i)).toHaveValue("Needs more reps");
  });
});
