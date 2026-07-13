import { useCallback, useEffect, useState, type FormEvent } from "react";
import { TextField } from "../../components/shell/FormFields";
import { Badge, PageHead } from "../../components/shell/PagePrimitives";
import { api } from "../../data";
import { getPassportStatus, passportStatusLabel } from "../../lib/passport";
import { getMissingAthleteFields } from "../../lib/profile";
import type { Athlete } from "../../types/database";
import {
  adminPatchFromRosterForm,
  createInputFromRosterForm,
  emptyRosterForm,
  rosterFormFromAthlete,
  type RosterFormState,
} from "./adminRosterForm";

export function AdminPlayersPage() {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [form, setForm] = useState<RosterFormState>(emptyRosterForm);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setAthletes(await api.listAthletes());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateForm(field: keyof RosterFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  const editing = form.athleteId !== null;
  const editingAthlete = editing ? athletes.find((a) => a.id === form.athleteId) : undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.legalName.trim() || !form.email.trim()) {
      setMessage({ tone: "warn", text: "Name and email are required." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (form.athleteId) {
        await api.updateAthleteAsAdmin(form.athleteId, adminPatchFromRosterForm(form));
        setMessage({ tone: "ok", text: "Player updated." });
      } else {
        await api.createAthlete(createInputFromRosterForm(form));
        setMessage({
          tone: "ok",
          text: "Player added to the roster. They can now sign in with a magic link to this email.",
        });
      }
      setForm(emptyRosterForm);
      await load();
    } catch (error) {
      setMessage({
        tone: "warn",
        text: error instanceof Error ? error.message : "Could not save the player.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHead
        title="Players"
        subtitle="Athlete database with readiness signals."
        eyebrow="Admin"
      />
      <section className="card stack">
        <div className="section-title">
          <h2>{editing ? "Edit roster player" : "Add roster player"}</h2>
          <Badge tone={editing ? "warn" : "ok"}>{editing ? "editing" : "new"}</Badge>
        </div>
        <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
          <div className="grid cols-3">
            <TextField
              label="Legal name"
              value={form.legalName}
              onChange={(value) => updateForm("legalName", value)}
              required
            />
            <TextField
              label="Preferred name"
              value={form.preferredName}
              onChange={(value) => updateForm("preferredName", value)}
            />
            <TextField
              label="Login email"
              type="email"
              value={form.email}
              onChange={(value) => updateForm("email", value)}
              placeholder="player@example.com"
              required
            />
            <div className="field">
              <label htmlFor="roster-gender">Gender</label>
              <select
                id="roster-gender"
                value={form.gender}
                onChange={(event) => updateForm("gender", event.target.value)}
              >
                <option value="">Not set</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </div>
            <TextField
              label="Date of birth"
              type="date"
              value={form.dateOfBirth}
              onChange={(value) => updateForm("dateOfBirth", value)}
            />
            <TextField
              label="Positions"
              value={form.positions}
              onChange={(value) => updateForm("positions", value)}
              placeholder="handler, cutter"
            />
          </div>
          <div className="btn-row">
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Saving..." : editing ? "Save player" : "Add player"}
            </button>
            {editing ? (
              <button type="button" className="btn" onClick={() => setForm(emptyRosterForm)}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
        {editingAthlete?.profile_id ? (
          <p className="muted">
            This player has already logged in, so their email can no longer be changed.
          </p>
        ) : (
          <p className="muted">
            Players sign in with a magic link to their roster email. No invite is sent from here.
          </p>
        )}
        {message ? <p className={`alert ${message.tone}`}>{message.text}</p> : null}
      </section>
      <section className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Login</th>
              <th>Positions</th>
              <th>Profile</th>
              <th>Missing</th>
              <th>Passport</th>
              <th>Consent</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {athletes.map((athlete) => {
              const missing = getMissingAthleteFields(athlete);
              const passport = getPassportStatus(athlete.passport_expiry);
              return (
                <tr key={athlete.id}>
                  <td>{athlete.preferred_name || athlete.legal_name || "Unknown athlete"}</td>
                  <td>{athlete.email ?? "-"}</td>
                  <td>
                    <Badge tone={athlete.profile_id ? "ok" : "warn"}>
                      {athlete.profile_id ? "active" : "not logged in"}
                    </Badge>
                  </td>
                  <td>{athlete.positions.length > 0 ? athlete.positions.join(", ") : "-"}</td>
                  <td>{athlete.profile_status}</td>
                  <td>{missing.length}</td>
                  <td>{passportStatusLabel(passport)}</td>
                  <td>{athlete.data_sharing_consent ? "Yes" : "No"}</td>
                  <td>
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => setForm(rosterFormFromAthlete(athlete))}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
