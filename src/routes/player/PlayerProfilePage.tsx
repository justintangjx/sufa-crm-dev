import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { CheckboxField, TextField } from "../../components/shell/FormFields";
import { Badge, PageHead } from "../../components/shell/PagePrimitives";
import { api } from "../../data";
import { getProfileCompletion, getMissingAthleteFields } from "../../lib/profile";
import type { Athlete } from "../../types/database";
import {
  emptyPlayerProfileForm,
  playerProfileFormFromAthlete,
  playerProfilePatchFromForm,
  type PlayerProfileFormState,
} from "./playerProfileForm";

export function PlayerProfilePage() {
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
