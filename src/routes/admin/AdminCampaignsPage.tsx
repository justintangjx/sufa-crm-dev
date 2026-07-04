import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { TextField } from "../../components/shell/FormFields";
import { Badge, PageHead } from "../../components/shell/PagePrimitives";
import { api } from "../../data";
import { orderCampaignsForMvp } from "../../lib/campaignUi";
import { optionalText } from "../../lib/form";
import type { Campaign } from "../../types/database";
import { emptyCampaignForm, type CampaignFormState } from "./adminCampaignForm";

export function AdminCampaignsPage() {
  const { profile } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [form, setForm] = useState<CampaignFormState>(emptyCampaignForm);
  const [message, setMessage] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    setCampaigns(orderCampaignsForMvp(await api.listCampaigns()));
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  function updateCampaignForm(field: keyof CampaignFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleCreateCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || form.name.trim().length === 0) {
      return;
    }
    const campaign = await api.createCampaign(
      {
        name: form.name.trim(),
        team: optionalText(form.team) ?? undefined,
        start_date: optionalText(form.startDate) ?? undefined,
        end_date: optionalText(form.endDate) ?? undefined,
        location: optionalText(form.location) ?? undefined,
        status: form.status,
      },
      profile.id,
    );
    setForm(emptyCampaignForm);
    setMessage(`${campaign.name} created.`);
    await loadCampaigns();
  }

  return (
    <>
      <PageHead
        title="Campaigns"
        subtitle="Campaign list and creation workspace."
        eyebrow="Admin"
      />
      <section className="card stack">
        <div className="section-title">
          <h2>Create campaign</h2>
          <Badge>admin</Badge>
        </div>
        <form className="stack" onSubmit={(event) => void handleCreateCampaign(event)}>
          <div className="grid cols-2">
            <TextField
              label="Campaign name"
              value={form.name}
              onChange={(value) => updateCampaignForm("name", value)}
              required
            />
            <TextField
              label="Team"
              value={form.team}
              onChange={(value) => updateCampaignForm("team", value)}
              placeholder="Open, Women, Mixed..."
            />
            <TextField
              label="Start date"
              type="date"
              value={form.startDate}
              onChange={(value) => updateCampaignForm("startDate", value)}
            />
            <TextField
              label="End date"
              type="date"
              value={form.endDate}
              onChange={(value) => updateCampaignForm("endDate", value)}
            />
            <TextField
              label="Location"
              value={form.location}
              onChange={(value) => updateCampaignForm("location", value)}
              placeholder="Singapore"
            />
            <div className="field">
              <label htmlFor="campaign-status">Campaign status</label>
              <select
                id="campaign-status"
                value={form.status}
                onChange={(event) => updateCampaignForm("status", event.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          <div className="btn-row">
            <button type="submit" className="btn primary">
              Create campaign
            </button>
          </div>
          {message ? <p className="alert ok">{message}</p> : null}
        </form>
      </section>
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
