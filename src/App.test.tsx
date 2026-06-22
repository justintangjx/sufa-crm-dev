import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { api, resetData } from "./data";
import { TestApp } from "./App";

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
    expect(screen.getByText(/total athletes/i)).toBeInTheDocument();
  });

  it("redirects a player away from admin routes", async () => {
    await api.signIn("alice@sufa.test");

    render(<TestApp initialEntries={["/admin"]} />);

    expect(await screen.findByRole("heading", { name: /player dashboard/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /admin dashboard/i })).not.toBeInTheDocument();
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

  it("lets an admin draft campaign reminders without sending them", async () => {
    const user = userEvent.setup();
    await api.signIn("admin@sufa.test");

    render(<TestApp initialEntries={["/admin/campaigns/c-sea"]} />);

    expect(await screen.findByRole("heading", { name: /sea games 2026/i })).toBeInTheDocument();
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
