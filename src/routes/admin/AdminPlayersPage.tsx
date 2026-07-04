import { useEffect, useState } from "react";
import { PageHead } from "../../components/shell/PagePrimitives";
import { api } from "../../data";
import { getPassportStatus, passportStatusLabel } from "../../lib/passport";
import { getMissingAthleteFields } from "../../lib/profile";
import type { Athlete } from "../../types/database";

export function AdminPlayersPage() {
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
