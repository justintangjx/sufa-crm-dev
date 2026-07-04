import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import heroImage from "../../assets/hero.png";
import { useAuth } from "../../auth/AuthContext";
import { DemoCoachLlmConfigBanner } from "../../components/shell/AppLayout";
import { PageHead } from "../../components/shell/PagePrimitives";
import { demoCoachLlm, useMockBackend } from "../../lib/env";
import { getRoleHome } from "../../lib/roles";

const demoAccounts = [
  { email: "admin@sufa.test", label: "Admin" },
  { email: "coach@sufa.test", label: "Coach" },
  { email: "alice@sufa.test", label: "Player (Alice - Matrix)" },
  { email: "derrick@sufa.test", label: "Player (Derrick)" },
] as const;

export function LoginPage() {
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
            U24 Worlds campaign operations for Singapore Ultimate, with reusable CRM records for
            future competitions.
          </p>
          <div className="auth-visual" aria-hidden="true">
            <img src={heroImage} alt="" />
            <div className="auth-visual-panel top">
              <span>U24 Worlds 2026</span>
              <strong>Live matrix open</strong>
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
